import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { Logger } from '../utils/logger.js';

export class DeepWikiService {
  private logger: Logger;
  private baseUrl = 'https://deepwiki.com';
  private githubApiUrl = 'https://api.github.com';
  private userAgent = 'MCP-DeepWiki-Server/1.0.0 (Claude Desktop Compatible)';

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async fetchContent(params: {
    url: string;
    mode: string;
    maxDepth: number;
    includeMetadata: boolean;
    contentFilter: string;
  }): Promise<any> {
    const normalizedUrl = this.normalizeUrl(params.url);
    this.logger.info(`Fetching from normalized URL: ${normalizedUrl}`);

    // First, check if the content is ready (not loading)
    const isReady = await this.checkContentReady(normalizedUrl);
    if (!isReady) {
      throw new Error('DeepWiki content is still being generated - please try again in a few moments');
    }

    switch (params.mode) {
      case 'aggregate':
        return await this.fetchAggregateContent(normalizedUrl, params);
      case 'pages':
        return await this.fetchPagesContent(normalizedUrl, params);
      case 'structured':
        return await this.fetchStructuredContent(normalizedUrl, params);
      default:
        throw new Error(`Unsupported mode: ${params.mode}`);
    }
  }

  private async checkContentReady(url: string): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(url, {
        method: 'HEAD',
        headers: {
          'User-Agent': this.userAgent,
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      // Check for specific headers that indicate content is ready
      const contentLength = response.headers.get('content-length');
      const lastModified = response.headers.get('last-modified');
      
      // If content-length is very small, it might be a loading page
      if (contentLength && parseInt(contentLength) < 1000) {
        this.logger.warn('Content length too small, might be loading page');
        return false;
      }

      return response.ok;
    } catch (error) {
      this.logger.warn('Content readiness check failed:', error);
      return true; // Assume ready if check fails
    }
  }

  private async fetchAggregateContent(url: string, params: any): Promise<any> {
    const response = await this.makeRequest(url);
    const html = await response.text();
    
    // Check for loading indicators in HTML
    if (this.containsLoadingIndicators(html)) {
      throw new Error('DeepWiki is still processing this repository - content not ready');
    }

    const $ = cheerio.load(html);
    
    // Remove loading elements, spinners, and navigation
    $('script, style, nav, .loading, .spinner, .loader, [class*="loading"], [id*="loading"]').remove();
    
    // Extract main content
    const mainContent = this.extractMainContent($);
    
    if (!mainContent || mainContent.length < 100) {
      throw new Error('No substantial content found - repository may not be processed yet');
    }

    const result: any = {
      url,
      mode: 'aggregate',
      content: mainContent,
      timestamp: new Date().toISOString(),
      contentLength: mainContent.length,
    };

    if (params.includeMetadata) {
      result.metadata = this.extractMetadata($);
    }

    return result;
  }

  private async fetchPagesContent(url: string, params: any): Promise<any> {
    const response = await this.makeRequest(url);
    const html = await response.text();
    
    if (this.containsLoadingIndicators(html)) {
      throw new Error('DeepWiki is still processing this repository - content not ready');
    }

    const $ = cheerio.load(html);
    const pages = this.extractPages($, params.maxDepth);
    
    if (pages.length === 0) {
      throw new Error('No pages found - repository may not be processed yet');
    }

    return {
      url,
      mode: 'pages',
      pages,
      totalPages: pages.length,
      timestamp: new Date().toISOString(),
    };
  }

  private async fetchStructuredContent(url: string, params: any): Promise<any> {
    const response = await this.makeRequest(url);
    const html = await response.text();
    
    if (this.containsLoadingIndicators(html)) {
      throw new Error('DeepWiki is still processing this repository - content not ready');
    }

    const $ = cheerio.load(html);
    
    const structured = {
      documentation: this.extractDocumentation($),
      codeExamples: this.extractCodeExamples($),
      apiReference: this.extractApiReference($),
      quickstart: this.extractQuickstart($),
    };

    // Filter based on contentFilter
    if (params.contentFilter !== 'all') {
      const filtered: any = {};
      if (params.contentFilter === 'documentation') {
        filtered.documentation = structured.documentation;
      } else if (params.contentFilter === 'code') {
        filtered.codeExamples = structured.codeExamples;
      } else if (params.contentFilter === 'examples') {
        filtered.codeExamples = structured.codeExamples;
        filtered.quickstart = structured.quickstart;
      }
      return {
        url,
        mode: 'structured',
        content: filtered,
        timestamp: new Date().toISOString(),
      };
    }

    return {
      url,
      mode: 'structured',
      content: structured,
      timestamp: new Date().toISOString(),
    };
  }

  private containsLoadingIndicators(html: string): boolean {
    const loadingPatterns = [
      /loading/i,
      /please wait/i,
      /processing/i,
      /generating/i,
      /spinner/i,
      /loader/i,
      /<div[^>]*class="[^"]*loading[^"]*"/i,
      /<div[^>]*id="[^"]*loading[^"]*"/i,
      /content-loading/i,
      /repository is being processed/i,
      /documentation is being generated/i,
    ];

    return loadingPatterns.some(pattern => pattern.test(html)) && html.length < 5000;
  }

  private extractMainContent($: cheerio.CheerioAPI): string {
    // Try multiple selectors for main content
    const contentSelectors = [
      'main',
      '.content',
      '.main-content',
      '.documentation',
      '.wiki-content',
      '.repository-content',
      '#content',
      '.container .content',
      'article',
    ];

    for (const selector of contentSelectors) {
      const content = $(selector).text().trim();
      if (content && content.length > 100) {
        return this.cleanContent(content);
      }
    }

    // Fallback: extract from body but remove common non-content elements
    $('header, footer, nav, aside, .sidebar, .navigation, .menu').remove();
    const bodyContent = $('body').text().trim();
    
    if (bodyContent && bodyContent.length > 100) {
      return this.cleanContent(bodyContent);
    }

    throw new Error('No substantial content found in the page');
  }

  private extractMetadata($: cheerio.CheerioAPI): any {
    return {
      title: $('title').text().trim() || $('h1').first().text().trim(),
      description: $('meta[name="description"]').attr('content') || '',
      repository: this.extractRepositoryInfo($),
      lastUpdated: $('meta[name="last-modified"]').attr('content') || '',
      language: $('html').attr('lang') || 'en',
    };
  }

  private extractRepositoryInfo($: cheerio.CheerioAPI): any {
    // Extract repository information from various possible locations
    const repoInfo = {
      name: '',
      owner: '',
      stars: '',
      forks: '',
      language: '',
    };

    // Try to extract from breadcrumbs or headers
    const breadcrumbs = $('.breadcrumb, .repo-breadcrumb').text();
    if (breadcrumbs) {
      const parts = breadcrumbs.split('/').map(p => p.trim()).filter(p => p);
      if (parts.length >= 2) {
        repoInfo.owner = parts[parts.length - 2];
        repoInfo.name = parts[parts.length - 1];
      }
    }

    return repoInfo;
  }

  private extractPages($: cheerio.CheerioAPI, maxDepth: number): any[] {
    const pages: any[] = [];
    const links = $('a[href*="/"], .page-link, .wiki-link').slice(0, maxDepth);
    
    links.each((_, element) => {
      const $link = $(element);
      const href = $link.attr('href');
      const title = $link.text().trim() || $link.attr('title') || '';
      
      if (href && title && !href.includes('#') && !href.startsWith('http')) {
        pages.push({
          title,
          path: href,
          url: new URL(href, this.baseUrl).toString(),
        });
      }
    });

    return pages;
  }

  private extractDocumentation($: cheerio.CheerioAPI): string {
    const docSelectors = [
      '.documentation',
      '.readme',
      '.docs',
      '.wiki',
      '[class*="doc"]',
      'section[id*="doc"]',
    ];

    for (const selector of docSelectors) {
      const content = $(selector).text().trim();
      if (content && content.length > 50) {
        return this.cleanContent(content);
      }
    }

    return '';
  }

  private extractCodeExamples($: cheerio.CheerioAPI): string[] {
    const examples: string[] = [];
    $('pre, code, .code-example, .example').each((_, element) => {
      const code = $(element).text().trim();
      if (code && code.length > 10 && code.length < 2000) {
        examples.push(code);
      }
    });
    return examples;
  }

  private extractApiReference($: cheerio.CheerioAPI): string {
    const apiSelectors = [
      '.api',
      '.reference',
      '.api-reference',
      '[class*="api"]',
      'section[id*="api"]',
    ];

    for (const selector of apiSelectors) {
      const content = $(selector).text().trim();
      if (content && content.length > 50) {
        return this.cleanContent(content);
      }
    }

    return '';
  }

  private extractQuickstart($: cheerio.CheerioAPI): string {
    const quickstartSelectors = [
      '.quickstart',
      '.getting-started',
      '.quick-start',
      '[class*="quickstart"]',
      'section[id*="quickstart"]',
      'section[id*="getting-started"]',
    ];

    for (const selector of quickstartSelectors) {
      const content = $(selector).text().trim();
      if (content && content.length > 50) {
        return this.cleanContent(content);
      }
    }

    return '';
  }

  private cleanContent(content: string): string {
    return content
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();
  }

  private normalizeUrl(url: string): string {
    // Handle different URL formats
    if (url.startsWith('http')) {
      return url;
    }
    
    // Handle owner/repo format
    if (url.includes('/') && !url.startsWith('/')) {
      return `${this.baseUrl}/${url}`;
    }
    
    throw new Error(`Invalid URL format: ${url}`);
  }

  private async makeRequest(url: string): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Cache-Control': 'no-cache',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  async generateSummary(content: any, summaryType: string, maxLength: number): Promise<string> {
    // Extract text content for summarization
    let textContent = '';
    if (typeof content === 'string') {
      textContent = content;
    } else if (content && content.content) {
      textContent = content.content;
    } else {
      textContent = JSON.stringify(content);
    }

    // Simple extractive summarization based on type
    const sentences = textContent.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const targetSentences = Math.min(Math.floor(maxLength / 50), sentences.length);

    let summary = '';
    switch (summaryType) {
      case 'overview':
        summary = this.extractOverviewSentences(sentences, targetSentences);
        break;
      case 'technical':
        summary = this.extractTechnicalSentences(sentences, targetSentences);
        break;
      case 'quickstart':
        summary = this.extractQuickstartSentences(sentences, targetSentences);
        break;
      case 'api':
        summary = this.extractApiSentences(sentences, targetSentences);
        break;
      default:
        summary = sentences.slice(0, targetSentences).join('. ') + '.';
    }

    return summary.trim();
  }

  private extractOverviewSentences(sentences: string[], count: number): string {
    // Prioritize sentences with overview keywords
    const overviewKeywords = ['overview', 'introduction', 'about', 'description', 'purpose', 'what is'];
    const scored = sentences.map(s => ({
      sentence: s,
      score: overviewKeywords.reduce((score, keyword) => 
        s.toLowerCase().includes(keyword) ? score + 1 : score, 0)
    }));
    
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, count)
      .map(s => s.sentence)
      .join('. ') + '.';
  }

  private extractTechnicalSentences(sentences: string[], count: number): string {
    const technicalKeywords = ['implementation', 'architecture', 'algorithm', 'performance', 'technical', 'system'];
    const scored = sentences.map(s => ({
      sentence: s,
      score: technicalKeywords.reduce((score, keyword) => 
        s.toLowerCase().includes(keyword) ? score + 1 : score, 0)
    }));
    
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, count)
      .map(s => s.sentence)
      .join('. ') + '.';
  }

  private extractQuickstartSentences(sentences: string[], count: number): string {
    const quickstartKeywords = ['install', 'setup', 'getting started', 'quick', 'start', 'begin', 'first'];
    const scored = sentences.map(s => ({
      sentence: s,
      score: quickstartKeywords.reduce((score, keyword) => 
        s.toLowerCase().includes(keyword) ? score + 1 : score, 0)
    }));
    
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, count)
      .map(s => s.sentence)
      .join('. ') + '.';
  }

  private extractApiSentences(sentences: string[], count: number): string {
    const apiKeywords = ['api', 'method', 'function', 'endpoint', 'parameter', 'return', 'response'];
    const scored = sentences.map(s => ({
      sentence: s,
      score: apiKeywords.reduce((score, keyword) => 
        s.toLowerCase().includes(keyword) ? score + 1 : score, 0)
    }));
    
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, count)
      .map(s => s.sentence)
      .join('. ') + '.';
  }

  // FIXED: Replace mock implementation with real GitHub Search API integration
  async searchRepositories(params: {
    query: string;
    topics?: string[];
    language?: string;
    limit: number;
  }): Promise<any[]> {
        // Validate input parameters
    if (!params.query || params.query.trim().length === 0) {
      throw new Error('Search query cannot be empty');
    }

    if (params.limit <= 0) {
      return [];
    }

    this.logger.info(`Searching GitHub repositories with query: ${params.query}`);
    
    try {
      // Build GitHub search query
      const searchQuery = this.buildGitHubSearchQuery(params);
      const githubUrl = `${this.githubApiUrl}/search/repositories?q=${encodeURIComponent(searchQuery)}&sort=stars&order=desc&per_page=${Math.min(params.limit, 100)}`;
      
      this.logger.info(`GitHub search URL: ${githubUrl}`);
      
      // Make request to GitHub API
      const response = await this.makeGitHubRequest(githubUrl);
      const data = await response.json();
      
      if (!data.items || !Array.isArray(data.items)) {
        this.logger.warn('GitHub API returned unexpected response format');
        return [];
      }
      
      // Transform GitHub results to DeepWiki format
      const results = data.items.slice(0, params.limit).map((repo: any) => ({
        name: repo.name,
        owner: repo.owner.login,
        description: repo.description || 'No description available',
        url: `${this.baseUrl}/${repo.owner.login}/${repo.name}`,
        githubUrl: repo.html_url,
        language: repo.language || 'Unknown',
        topics: repo.topics || [],
        stars: repo.stargazers_count || 0,
        forks: repo.forks_count || 0,
        lastUpdated: repo.updated_at,
        createdAt: repo.created_at,
        size: repo.size || 0,
        openIssues: repo.open_issues_count || 0,
        license: repo.license ? repo.license.name : null,
        isArchived: repo.archived || false,
        isFork: repo.fork || false,
        defaultBranch: repo.default_branch || 'main',
      }));
      
      this.logger.info(`Found ${results.length} repositories matching search criteria`);
      return results;
      
    } catch (error) {
      this.logger.error('GitHub search failed:', error);
      
      // Return error information instead of empty array for better debugging
      throw new Error(`Repository search failed: ${(error as Error).message}`);
    }
  }

  private buildGitHubSearchQuery(params: {
    query: string;
    topics?: string[];
    language?: string;
    limit: number;
  }): string {
    let searchQuery = params.query;
    
    // Add language filter
    if (params.language) {
      searchQuery += ` language:${params.language}`;
    }
    
    // Add topic filters
    if (params.topics && params.topics.length > 0) {
      params.topics.forEach(topic => {
        searchQuery += ` topic:${topic}`;
      });
    }
    
    // Add additional filters for better results
    searchQuery += ' archived:false'; // Exclude archived repositories
    searchQuery += ' fork:false'; // Exclude forks by default for cleaner results
    
    return searchQuery;
  }

  private async makeGitHubRequest(url: string): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    try {
      const headers: any = {
        'User-Agent': this.userAgent,
        'Accept': 'application/vnd.github.v3+json',
        'Accept-Encoding': 'gzip, deflate',
      };

      // Add GitHub token if available for higher rate limits
      const githubToken = process.env.GITHUB_TOKEN;
      if (githubToken) {
        headers['Authorization'] = `token ${githubToken}`;
        this.logger.info('Using GitHub token for enhanced rate limits');
      } else {
        this.logger.warn('No GitHub token found - using unauthenticated requests (60/hour limit)');
      }

      const response = await fetch(url, {
        headers,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      // Handle GitHub API rate limiting
      if (response.status === 403) {
        const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
        const rateLimitReset = response.headers.get('X-RateLimit-Reset');
        
        if (rateLimitRemaining === '0') {
          const resetTime = new Date(parseInt(rateLimitReset || '0') * 1000);
          throw new Error(`GitHub API rate limit exceeded. Rate limit resets at ${resetTime.toISOString()}. Consider adding a GITHUB_TOKEN environment variable for higher limits.`);
        }
        
        throw new Error('GitHub API access denied. Check your GitHub token if provided.');
      }
      
      if (response.status === 404) {
        throw new Error('No repositories found matching the search criteria');
      }
      
      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }

      // Log rate limit status for monitoring
      const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
      const rateLimitLimit = response.headers.get('X-RateLimit-Limit');
      this.logger.info(`GitHub API rate limit: ${rateLimitRemaining}/${rateLimitLimit} remaining`);

      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
}
