
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { DeepWikiService } from './services/deepwiki.js';
import { GitHubFallbackService } from './services/github-fallback.js';
import { ResponseFormatter } from './utils/response-formatter.js';
import { Logger } from './utils/logger.js';

// Claude Desktop optimized timeout settings
const CLAUDE_DESKTOP_TIMEOUT = parseInt(process.env.MCP_TIMEOUT || '45000'); // 45 seconds default
const MAX_CONTENT_SIZE = 500000; // 500KB max content size for Claude Desktop
const RETRY_ATTEMPTS = 2;
const RETRY_DELAY = 1000; // 1 second

class OptimizedDeepWikiServer {
  private server: Server;
  private deepwikiService: DeepWikiService;
  private githubFallback: GitHubFallbackService;
  private formatter: ResponseFormatter;
  private logger: Logger;

  constructor() {
    this.server = new Server(
      {
        name: 'deepwiki-server-optimized',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {
            listChanged: true,
          },
        },
      }
    );

    this.logger = new Logger();
    this.deepwikiService = new DeepWikiService(this.logger);
    this.githubFallback = new GitHubFallbackService(this.logger);
    this.formatter = new ResponseFormatter();

    this.setupTools();
    this.setupErrorHandling();
  }

  private setupTools(): void {
    // Optimized deepwiki_fetch tool with enhanced error handling
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'deepwiki_fetch',
            title: 'DeepWiki Documentation Fetcher',
            description: 'Retrieves GitHub repository documentation from DeepWiki with enhanced content organization and filtering capabilities.',
            inputSchema: {
              type: 'object',
              properties: {
                url: {
                  type: 'string',
                  description: 'DeepWiki URL or GitHub repository identifier (e.g., \'https://deepwiki.com/owner/repo\' or \'owner/repo\')',
                },
                mode: {
                  type: 'string',
                  enum: ['aggregate', 'pages', 'structured'],
                  description: 'Output mode: \'aggregate\' (combined content), \'pages\' (JSON list), \'structured\' (organized by content type)',
                },
                maxDepth: {
                  type: 'integer',
                  minimum: 1,
                  maximum: 50,
                  description: 'Maximum depth for crawling pages (default: 10)',
                },
                includeMetadata: {
                  type: 'boolean',
                  description: 'Include repository metadata in output (default: false)',
                },
                contentFilter: {
                  type: 'string',
                  enum: ['all', 'documentation', 'code', 'examples'],
                  description: 'Filter content by type (default: \'all\')',
                },
              },
              required: ['url'],
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
          {
            name: 'deepwiki_summarize',
            title: 'DeepWiki Documentation Summarizer',
            description: 'Generates AI-powered summaries of GitHub repository documentation with different focus types (overview, technical, quickstart, api).',
            inputSchema: {
              type: 'object',
              properties: {
                url: {
                  type: 'string',
                  description: 'DeepWiki URL or GitHub repository identifier (e.g., \'https://deepwiki.com/owner/repo\' or \'owner/repo\')',
                },
                summaryType: {
                  type: 'string',
                  enum: ['overview', 'technical', 'quickstart', 'api'],
                  description: 'Type of summary: overview (default), technical, quickstart, or api',
                },
                maxLength: {
                  type: 'integer',
                  minimum: 100,
                  maximum: 5000,
                  description: 'Maximum length of summary in words (default: 1000)',
                },
              },
              required: ['url'],
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
          {
            name: 'deepwiki_search',
            title: 'DeepWiki Repository Search',
            description: 'Search for GitHub repositories with documentation available on DeepWiki. Supports filtering by programming language and topics.',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query for repositories (e.g., \'machine learning\', \'web framework\', \'database\')',
                },
                topics: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Filter by repository topics/tags (e.g., [\'python\', \'api\', \'web\'])',
                },
                language: {
                  type: 'string',
                  description: 'Filter by programming language (e.g., \'Python\', \'JavaScript\', \'Go\')',
                },
                limit: {
                  type: 'integer',
                  minimum: 1,
                  maximum: 50,
                  description: 'Maximum number of results to return (default: 10, max: 50)',
                },
              },
              required: ['query'],
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
        ] as Tool[],
      };
    });

    // Tool call handler with Claude Desktop optimizations
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'deepwiki_fetch':
            return await this.handleDeepWikiFetch(args);
          case 'deepwiki_summarize':
            return await this.handleDeepWikiSummarize(args);
          case 'deepwiki_search':
            return await this.handleDeepWikiSearch(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        this.logger.error(`Tool ${name} failed:`, error);
        return this.formatter.formatError(error instanceof Error ? error.message : 'Unknown error occurred');
      }
    });
  }

  private async handleDeepWikiFetch(args: any) {
    const schema = z.object({
      url: z.string(),
      mode: z.enum(['aggregate', 'pages', 'structured']).default('aggregate'),
      maxDepth: z.number().min(1).max(50).default(10),
      includeMetadata: z.boolean().default(false),
      contentFilter: z.enum(['all', 'documentation', 'code', 'examples']).default('all'),
    });

    const params = schema.parse(args);
    
    this.logger.info(`Fetching DeepWiki content for: ${params.url}`);

    // Create timeout promise for Claude Desktop compatibility
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout - content taking too long to load')), CLAUDE_DESKTOP_TIMEOUT - 5000);
    });

    try {
      // Race between actual fetch and timeout
      const result = await Promise.race([
        this.fetchWithRetryAndFallback(params),
        timeoutPromise
      ]);

      return this.formatter.formatSuccess(result);
    } catch (error) {
      this.logger.error('DeepWiki fetch failed:', error);
      throw error;
    }
  }

  private async fetchWithRetryAndFallback(params: any) {
    let lastError: Error | null = null;

    // Try DeepWiki with retries
    for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
      try {
        this.logger.info(`DeepWiki attempt ${attempt}/${RETRY_ATTEMPTS}`);
        const result = await this.deepwikiService.fetchContent(params);
        
        // Check if we got a loading page or incomplete content
        if (this.isLoadingPage(result)) {
          throw new Error('DeepWiki returned loading page - content not ready');
        }

        // Validate content size for Claude Desktop
        if (this.getContentSize(result) > MAX_CONTENT_SIZE) {
          this.logger.warn('Content too large, truncating for Claude Desktop compatibility');
          return this.truncateContent(result);
        }

        return result;
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(`DeepWiki attempt ${attempt} failed:`, error);
        
        if (attempt < RETRY_ATTEMPTS) {
          await this.delay(RETRY_DELAY * attempt); // Exponential backoff
        }
      }
    }

    // Fallback to GitHub if DeepWiki fails
    this.logger.info('Falling back to GitHub API');
    try {
      const githubResult = await this.githubFallback.fetchContent(params);
      return {
        ...githubResult,
        source: 'github-fallback',
        note: 'Content retrieved from GitHub API due to DeepWiki unavailability'
      };
    } catch (githubError) {
      this.logger.error('GitHub fallback also failed:', githubError);
      throw new Error(`Both DeepWiki and GitHub fallback failed. Last DeepWiki error: ${lastError?.message}. GitHub error: ${(githubError as Error).message}`);
    }
  }

  private async handleDeepWikiSummarize(args: any) {
    const schema = z.object({
      url: z.string(),
      summaryType: z.enum(['overview', 'technical', 'quickstart', 'api']).default('overview'),
      maxLength: z.number().min(100).max(5000).default(1000),
    });

    const params = schema.parse(args);
    
    this.logger.info(`Generating summary for: ${params.url}`);

    // First fetch the content
    const content = await this.fetchWithRetryAndFallback({
      url: params.url,
      mode: 'aggregate',
      maxDepth: 5, // Reduced depth for summarization
      contentFilter: 'documentation'
    });

    // Generate summary based on type
    const summary = await this.deepwikiService.generateSummary(content, params.summaryType, params.maxLength);
    
    return this.formatter.formatSuccess({
      summary,
      summaryType: params.summaryType,
      sourceUrl: params.url,
      wordCount: summary.split(/\s+/).length
    });
  }

  private async handleDeepWikiSearch(args: any) {
    const schema = z.object({
      query: z.string(),
      topics: z.array(z.string()).optional(),
      language: z.string().optional(),
      limit: z.number().min(1).max(50).default(10),
    });

    const params = schema.parse(args);
    
    this.logger.info(`Searching repositories: ${params.query}`);

    const results = await this.deepwikiService.searchRepositories(params);
    
    return this.formatter.formatSuccess({
      results,
      query: params.query,
      totalFound: results.length,
      filters: {
        topics: params.topics,
        language: params.language,
        limit: params.limit
      }
    });
  }

  private isLoadingPage(content: any): boolean {
    if (typeof content === 'string') {
      const loadingIndicators = [
        'loading',
        'please wait',
        'processing',
        'generating',
        'spinner',
        'loader',
        'loading-spinner',
        'content-loading'
      ];
      
      const lowerContent = content.toLowerCase();
      return loadingIndicators.some(indicator => lowerContent.includes(indicator)) && content.length < 1000;
    }
    
    if (content && typeof content === 'object') {
      const contentStr = JSON.stringify(content).toLowerCase();
      return contentStr.includes('loading') && contentStr.length < 1000;
    }
    
    return false;
  }

  private getContentSize(content: any): number {
    return JSON.stringify(content).length;
  }

  private truncateContent(content: any): any {
    if (typeof content === 'string') {
      if (content.length > MAX_CONTENT_SIZE) {
        return content.substring(0, MAX_CONTENT_SIZE - 100) + '\n\n[Content truncated for Claude Desktop compatibility]';
      }
      return content;
    }
    
    if (content && typeof content === 'object') {
      const truncated = { ...content };
      const contentStr = JSON.stringify(truncated);
      
      if (contentStr.length > MAX_CONTENT_SIZE) {
        // Truncate the main content field
        if (truncated.content && typeof truncated.content === 'string') {
          const availableSpace = MAX_CONTENT_SIZE - JSON.stringify({ ...truncated, content: '' }).length - 100;
          truncated.content = truncated.content.substring(0, availableSpace) + '\n\n[Content truncated for Claude Desktop compatibility]';
        }
      }
      
      return truncated;
    }
    
    return content;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      this.logger.error('MCP Server error:', error);
    };

    process.on('SIGINT', async () => {
      this.logger.info('Shutting down MCP server...');
      await this.server.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      this.logger.info('Shutting down MCP server...');
      await this.server.close();
      process.exit(0);
    });
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    this.logger.info('MCP DeepWiki server started and ready for Claude Desktop');
  }
}

// Start the server
const server = new OptimizedDeepWikiServer();
server.start().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});

