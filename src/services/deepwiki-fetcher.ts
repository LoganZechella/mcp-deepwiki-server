
import fetch from "node-fetch";
import * as cheerio from "cheerio";
import { createLogger } from "../utils/logger.js";
import { sanitizeHtml } from "../utils/html-sanitizer.js";
import { DeepWikiUrlInfo, DeepWikiPage, DeepWikiResult } from "../types/index.js";

const logger = createLogger("deepwiki-fetcher");

/**
 * Service for fetching and processing DeepWiki content
 */
export class DeepWikiFetcher {
  private readonly baseUrl = "https://deepwiki.com";
  private readonly allowedDomains = ["deepwiki.com"];
  private readonly userAgent = "MCP-DeepWiki-Server/1.0.0";

  /**
   * Fetch aggregated content from DeepWiki
   */
  async fetchAggregated(urlInfo: DeepWikiUrlInfo, maxDepth: number): Promise<DeepWikiResult> {
    const pages = await this.fetchAllPages(urlInfo, maxDepth);
    
    const aggregatedContent = pages
      .map(page => `# ${page.title}\n\n${page.content}`)
      .join('\n\n---\n\n');

    return {
      repository: `${urlInfo.owner}/${urlInfo.repo}`,
      mode: "aggregate",
      content: aggregatedContent,
      pageCount: pages.length,
      fetchedAt: new Date().toISOString()
    };
  }

  /**
   * Fetch structured pages from DeepWiki
   */
  async fetchPages(urlInfo: DeepWikiUrlInfo, maxDepth: number): Promise<DeepWikiResult> {
    const pages = await this.fetchAllPages(urlInfo, maxDepth);

    return {
      repository: `${urlInfo.owner}/${urlInfo.repo}`,
      mode: "pages",
      pages: pages,
      pageCount: pages.length,
      fetchedAt: new Date().toISOString()
    };
  }

  /**
   * Fetch all pages for a repository
   */
  private async fetchAllPages(urlInfo: DeepWikiUrlInfo, maxDepth: number): Promise<DeepWikiPage[]> {
    const baseUrl = `${this.baseUrl}/${urlInfo.owner}/${urlInfo.repo}`;
    const visited = new Set<string>();
    const pages: DeepWikiPage[] = [];
    const queue: { url: string; depth: number }[] = [{ url: baseUrl, depth: 0 }];

    logger.info(`Fetching pages for ${urlInfo.owner}/${urlInfo.repo} (maxDepth: ${maxDepth})`);

    while (queue.length > 0 && pages.length < 100) { // Safety limit
      const { url, depth } = queue.shift()!;

      if (visited.has(url) || depth > maxDepth) {
        continue;
      }

      visited.add(url);

      try {
        const page = await this.fetchSinglePage(url, depth);
        if (page) {
          pages.push(page);
          
          // Extract links for further crawling
          if (depth < maxDepth) {
            const links = this.extractLinks(page.rawHtml, baseUrl);
            for (const link of links) {
              if (!visited.has(link)) {
                queue.push({ url: link, depth: depth + 1 });
              }
            }
          }
        }
      } catch (error) {
        logger.warn(`Failed to fetch page ${url}:`, error);
      }
    }

    logger.info(`Fetched ${pages.length} pages for ${urlInfo.owner}/${urlInfo.repo}`);
    return pages;
  }

  /**
   * Fetch a single page from DeepWiki
   */
  private async fetchSinglePage(url: string, depth: number): Promise<DeepWikiPage | null> {
    try {
      logger.debug(`Fetching page: ${url} (depth: ${depth})`);

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
        logger.warn(`HTTP ${response.status} for ${url}`);
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

      return {
        url,
        title,
        content: textContent,
        depth,
        rawHtml: html,
        fetchedAt: new Date().toISOString()
      };

    } catch (error) {
      logger.error(`Error fetching page ${url}:`, error);
      return null;
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
