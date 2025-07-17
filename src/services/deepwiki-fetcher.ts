
import fetch from "node-fetch";
import * as cheerio from "cheerio";
import { createLogger } from "../utils/logger.js";
import { createEnhancedLogger } from "../utils/enhanced-logger.js";
import { sanitizeHtml } from "../utils/html-sanitizer.js";
import { DeepWikiUrlInfo, DeepWikiPage, DeepWikiResult } from "../types/index.js";
import { getCache } from "./cache-service.js";
import { retry, CircuitBreaker, RetryConditions } from "../utils/retry.js";
import { ConcurrencyQueue, RateLimiter } from "../utils/concurrency.js";

const logger = createLogger("deepwiki-fetcher");
const enhancedLogger = createEnhancedLogger("deepwiki-fetcher");

/**
 * Service for fetching and processing DeepWiki content with enhanced capabilities
 */
export class DeepWikiFetcher {
  private readonly baseUrl = "https://deepwiki.com";
  private readonly allowedDomains = ["deepwiki.com"];
  private readonly userAgent = "MCP-DeepWiki-Server/1.0.0";
  private readonly cache = getCache();
  private readonly circuitBreaker = new CircuitBreaker({
    failureThreshold: 5,
    resetTimeout: 60000, // 1 minute
    monitoringPeriod: 10000 // 10 seconds
  });
  private readonly concurrencyQueue = new ConcurrencyQueue({
    maxConcurrent: 5,
    timeout: 30000
  });
  private readonly rateLimiter = new RateLimiter(10, 2); // 10 requests per 2 seconds

  /**
   * Fetch aggregated content from DeepWiki with caching and enhanced error handling
   */
  async fetchAggregated(urlInfo: DeepWikiUrlInfo, maxDepth: number): Promise<DeepWikiResult> {
    const cacheKey = `aggregated:${urlInfo.owner}/${urlInfo.repo}:${maxDepth}`;
    
    return enhancedLogger.time('fetchAggregated', async () => {
      // Try cache first
      const cached = await this.cache.get<DeepWikiResult>(cacheKey);
      if (cached) {
        enhancedLogger.info('Cache hit for aggregated content', { 
          repository: `${urlInfo.owner}/${urlInfo.repo}`,
          maxDepth 
        });
        return cached;
      }

      const pages = await this.fetchAllPages(urlInfo, maxDepth);
      
      const aggregatedContent = pages
        .map(page => `# ${page.title}\n\n${page.content}`)
        .join('\n\n---\n\n');

      const result: DeepWikiResult = {
        repository: `${urlInfo.owner}/${urlInfo.repo}`,
        mode: "aggregate",
        content: aggregatedContent,
        pageCount: pages.length,
        fetchedAt: new Date().toISOString()
      };

      // Cache the result for 1 hour
      await this.cache.set(cacheKey, result, 60 * 60 * 1000);
      
      return result;
    });
  }

  /**
   * Fetch structured pages from DeepWiki with caching and enhanced error handling
   */
  async fetchPages(urlInfo: DeepWikiUrlInfo, maxDepth: number): Promise<DeepWikiResult> {
    const cacheKey = `pages:${urlInfo.owner}/${urlInfo.repo}:${maxDepth}`;
    
    return enhancedLogger.time('fetchPages', async () => {
      // Try cache first
      const cached = await this.cache.get<DeepWikiResult>(cacheKey);
      if (cached) {
        enhancedLogger.info('Cache hit for pages content', { 
          repository: `${urlInfo.owner}/${urlInfo.repo}`,
          maxDepth 
        });
        return cached;
      }

      const pages = await this.fetchAllPages(urlInfo, maxDepth);

      const result: DeepWikiResult = {
        repository: `${urlInfo.owner}/${urlInfo.repo}`,
        mode: "pages",
        pages: pages,
        pageCount: pages.length,
        fetchedAt: new Date().toISOString()
      };

      // Cache the result for 1 hour
      await this.cache.set(cacheKey, result, 60 * 60 * 1000);
      
      return result;
    });
  }

  /**
   * Fetch all pages for a repository with concurrent processing
   */
  private async fetchAllPages(urlInfo: DeepWikiUrlInfo, maxDepth: number): Promise<DeepWikiPage[]> {
    const baseUrl = `${this.baseUrl}/${urlInfo.owner}/${urlInfo.repo}`;
    const visited = new Set<string>();
    const pages: DeepWikiPage[] = [];
    const queue: { url: string; depth: number }[] = [{ url: baseUrl, depth: 0 }];

    enhancedLogger.info(`Fetching pages for ${urlInfo.owner}/${urlInfo.repo}`, { maxDepth });

    while (queue.length > 0 && pages.length < 100) { // Safety limit
      // Process current batch concurrently
      const currentBatch = queue.splice(0, Math.min(5, queue.length));
      const batchTasks = currentBatch
        .filter(({ url, depth }) => !visited.has(url) && depth <= maxDepth)
        .map(({ url, depth }) => {
          visited.add(url);
          return () => this.fetchSinglePageWithRetry(url, depth);
        });

      if (batchTasks.length === 0) continue;

      const batchResults = await this.concurrencyQueue.addAllSettled(batchTasks);
      
      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value) {
          const page = result.value;
          pages.push(page);
          
          // Extract links for further crawling
          if (page.depth < maxDepth) {
            const links = this.extractLinks(page.rawHtml, baseUrl);
            for (const link of links) {
              if (!visited.has(link)) {
                queue.push({ url: link, depth: page.depth + 1 });
              }
            }
          }
        } else if (result.status === 'rejected') {
          enhancedLogger.warn('Failed to fetch page in batch', { error: result.reason });
        }
      }
    }

    enhancedLogger.info(`Fetched ${pages.length} pages for ${urlInfo.owner}/${urlInfo.repo}`, {
      pageCount: pages.length,
      repository: `${urlInfo.owner}/${urlInfo.repo}`
    });
    return pages;
  }

  /**
   * Fetch a single page with retry logic and circuit breaker
   */
  private async fetchSinglePageWithRetry(url: string, depth: number): Promise<DeepWikiPage | null> {
    const cacheKey = `page:${url}`;
    
    // Check cache first
    const cached = await this.cache.get<DeepWikiPage>(cacheKey);
    if (cached) {
      enhancedLogger.debug('Cache hit for single page', { url, depth });
      return cached;
    }

    return this.circuitBreaker.execute(async () => {
      return retry(
        () => this.fetchSinglePage(url, depth),
        {
          maxAttempts: 3,
          baseDelay: 1000,
          backoffFactor: 2,
          retryCondition: RetryConditions.networkAndServerErrors
        }
      );
    });
  }

  /**
   * Fetch a single page from DeepWiki with rate limiting
   */
  private async fetchSinglePage(url: string, depth: number): Promise<DeepWikiPage | null> {
    // Apply rate limiting
    await this.rateLimiter.acquire();
    
    try {
      enhancedLogger.debug(`Fetching page: ${url}`, { depth });

      const response = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        },
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      if (!response.ok) {
        enhancedLogger.warn(`HTTP ${response.status} for ${url}`, { 
          status: response.status,
          statusText: response.statusText 
        });
        return null;
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Extract title
      const title = $('h1').first().text().trim() || 
                   $('title').text().trim() || 
                   url.split('/').pop() || 
                   'Untitled';

      // Extract main content
      const contentSelector = '.wiki-content, .content, main, article, .markdown-body, #content';
      let content = $(contentSelector).first().html() || $('body').html() || '';

      // Sanitize HTML and convert to markdown-like format
      const sanitizedContent = sanitizeHtml(content);
      const textContent = this.htmlToMarkdown(sanitizedContent);

      const page: DeepWikiPage = {
        url,
        title,
        content: textContent,
        depth,
        rawHtml: html,
        fetchedAt: new Date().toISOString()
      };

      // Cache the page for 30 minutes
      const cacheKey = `page:${url}`;
      await this.cache.set(cacheKey, page, 30 * 60 * 1000);

      return page;

    } catch (error) {
      enhancedLogger.error(`Error fetching page ${url}`, error as Error, { depth });
      throw error; // Re-throw for retry logic
    }
  }

  /**
   * Extract links from HTML content
   */
  private extractLinks(html: string, baseUrl: string): string[] {
    const $ = cheerio.load(html);
    const links: string[] = [];

    $('a[href]').each((_, element) => {
      const href = $(element).attr('href');
      if (href) {
        let fullUrl: string;
        
        if (href.startsWith('http')) {
          fullUrl = href;
        } else if (href.startsWith('/')) {
          fullUrl = new URL(href, this.baseUrl).toString();
        } else {
          fullUrl = new URL(href, baseUrl).toString();
        }

        // Only include links within the same repository on DeepWiki
        if (fullUrl.includes('deepwiki.com') && fullUrl.includes(baseUrl.split('/').slice(-2).join('/'))) {
          links.push(fullUrl);
        }
      }
    });

    return [...new Set(links)]; // Remove duplicates
  }

  /**
   * Convert HTML to markdown-like text
   */
  private htmlToMarkdown(html: string): string {
    const $ = cheerio.load(html);

    // Remove script and style elements
    $('script, style, nav, header, footer').remove();

    // Convert headers
    for (let i = 1; i <= 6; i++) {
      $(`h${i}`).each((_, element) => {
        const $el = $(element);
        const text = $el.text().trim();
        const prefix = '#'.repeat(i);
        $el.replaceWith(`\n${prefix} ${text}\n\n`);
      });
    }

    // Convert paragraphs
    $('p').each((_, element) => {
      const $el = $(element);
      const text = $el.text().trim();
      if (text) {
        $el.replaceWith(`${text}\n\n`);
      }
    });

    // Convert lists
    $('ul, ol').each((_, element) => {
      const $el = $(element);
      let listText = '\n';
      $el.find('li').each((index, li) => {
        const $li = $(li);
        const text = $li.text().trim();
        const prefix = $el.is('ol') ? `${index + 1}.` : '-';
        listText += `${prefix} ${text}\n`;
      });
      $el.replaceWith(listText + '\n');
    });

    // Convert code blocks
    $('pre code, pre').each((_, element) => {
      const $el = $(element);
      const text = $el.text().trim();
      $el.replaceWith(`\n\`\`\`\n${text}\n\`\`\`\n\n`);
    });

    // Convert inline code
    $('code').each((_, element) => {
      const $el = $(element);
      const text = $el.text().trim();
      $el.replaceWith(`\`${text}\``);
    });

    // Convert links
    $('a').each((_, element) => {
      const $el = $(element);
      const text = $el.text().trim();
      const href = $el.attr('href');
      if (text && href) {
        $el.replaceWith(`[${text}](${href})`);
      } else {
        $el.replaceWith(text);
      }
    });

    // Get final text and clean up
    let text = $.text();
    
    // Clean up extra whitespace
    text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
    text = text.replace(/^\s+|\s+$/g, '');
    
    return text;
  }
}
