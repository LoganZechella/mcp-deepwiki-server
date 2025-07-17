
/**
 * DeepWiki Summarize Tool
 * Provides AI-powered summarization with multiple summary types
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createEnhancedLogger } from '../utils/enhanced-logger.js';
import { AIService } from '../services/ai-service.js';
import { DeepWikiFetcher } from '../services/deepwiki-fetcher.js';
import { validateDeepWikiUrl } from '../utils/url-validator.js';
import { CacheService } from '../services/cache-service.js';

const logger = createEnhancedLogger('deepwiki-summarize-tool');

// Input schema for the deepwiki_summarize tool
const DeepWikiSummarizeSchema = z.object({
  url: z.string().min(1, "URL is required"),
  summaryType: z.enum(["overview", "technical", "quickstart", "api"]).optional().default("overview"),
  maxLength: z.number().int().min(100).max(5000).optional().default(1000)
});

type SummaryType = "overview" | "technical" | "quickstart" | "api";

/**
 * Generate system prompts for different summary types
 */
function getSystemPrompt(summaryType: SummaryType): string {
  const basePrompt = "You are an expert technical writer who specializes in creating clear, concise documentation summaries.";
  
  switch (summaryType) {
    case "overview":
      return `${basePrompt} Create a comprehensive overview that explains what the project does, its main features, and why someone would use it. Focus on the big picture and key benefits.`;
    
    case "technical":
      return `${basePrompt} Create a technical summary focusing on architecture, implementation details, dependencies, and technical specifications. Include information about how the system works internally.`;
    
    case "quickstart":
      return `${basePrompt} Create a quickstart guide that helps users get up and running quickly. Focus on installation steps, basic configuration, and simple usage examples.`;
    
    case "api":
      return `${basePrompt} Create an API reference summary focusing on available endpoints, methods, parameters, and usage examples. Highlight the most important API features and common use cases.`;
    
    default:
      return basePrompt;
  }
}

/**
 * Generate user prompt for summarization
 */
function getUserPrompt(content: string, summaryType: SummaryType, maxLength: number): string {
  const typeInstructions = {
    overview: "Provide a clear overview of what this project does, its main features, and benefits.",
    technical: "Focus on technical details, architecture, implementation, and how it works.",
    quickstart: "Create a quickstart guide with installation and basic usage instructions.",
    api: "Summarize the API documentation, endpoints, and usage examples."
  };

  return `Please create a ${summaryType} summary of the following documentation content. 
  
${typeInstructions[summaryType]}

Keep the summary under ${maxLength} words and make it well-structured with clear sections.

Documentation content:
${content}

Summary:`;
}

/**
 * Process and clean content for summarization
 */
function processContentForSummarization(content: string): string {
  // Remove excessive whitespace and normalize line breaks
  let processed = content.replace(/\s+/g, ' ').trim();
  
  // Limit content length to avoid token limits (roughly 8000 words = ~10k tokens)
  const maxWords = 8000;
  const words = processed.split(' ');
  
  if (words.length > maxWords) {
    processed = words.slice(0, maxWords).join(' ') + '... [content truncated]';
    logger.info(`Content truncated from ${words.length} to ${maxWords} words for summarization`);
  }
  
  return processed;
}

export function registerDeepWikiSummarizeTool(server: McpServer): void {
  const aiService = new AIService();
  const fetcher = new DeepWikiFetcher();
  const cache = new CacheService('summarize', { ttl: 3600000 }); // 1 hour cache

  server.registerTool(
    "deepwiki_summarize",
    {
      title: "DeepWiki Documentation Summarizer",
      description: "Generates AI-powered summaries of GitHub repository documentation with different focus types (overview, technical, quickstart, api).",
      inputSchema: {
        url: z.string().describe("DeepWiki URL or GitHub repository identifier (e.g., 'https://deepwiki.com/owner/repo' or 'owner/repo')"),
        summaryType: z.enum(["overview", "technical", "quickstart", "api"]).optional().describe("Type of summary: overview (default), technical, quickstart, or api"),
        maxLength: z.number().int().min(100).max(5000).optional().describe("Maximum length of summary in words (default: 1000)")
      }
    },
    async (args: { url: string; summaryType?: SummaryType; maxLength?: number }) => {
      try {
        const validated = {
          url: args.url,
          summaryType: args.summaryType || "overview" as const,
          maxLength: args.maxLength || 1000
        };

        logger.info(`DeepWiki summarize requested: ${validated.url} (type: ${validated.summaryType}, maxLength: ${validated.maxLength})`);
        
        // Check if AI service is available
        if (!aiService.isAvailable()) {
          return {
            content: [{
              type: "text" as const,
              text: "AI summarization is not available. Please configure OpenAI or Anthropic API keys in environment variables."
            }]
          };
        }

        // Generate cache key
        const cacheKey = `${validated.url}:${validated.summaryType}:${validated.maxLength}`;
        
        // Check cache first
        const cachedSummary = await cache.get<string>(cacheKey);
        if (cachedSummary) {
          logger.info('Returning cached summary');
          return {
            content: [{
              type: "text" as const,
              text: cachedSummary
            }]
          };
        }

        // Validate URL and extract repository information
        const urlInfo = validateDeepWikiUrl(validated.url);
        
        // Fetch the documentation content
        logger.info('Fetching documentation content for summarization');
        const result = await fetcher.fetchAggregated(urlInfo, 10);
        
        if (!result.content || result.content.trim().length === 0) {
          return {
            content: [{
              type: "text" as const,
              text: "No content found to summarize. The repository may not have documentation available on DeepWiki."
            }]
          };
        }

        // Process content for summarization
        const processedContent = processContentForSummarization(result.content);
        
        // Generate summary using AI service
        logger.info(`Generating ${validated.summaryType} summary using AI service`);
        
        const systemPrompt = getSystemPrompt(validated.summaryType);
        const userPrompt = getUserPrompt(processedContent, validated.summaryType, validated.maxLength);
        
        const summary = await logger.time('ai-summarization', async () => {
          return await aiService.generateText(userPrompt, {
            systemPrompt,
            maxTokens: Math.min(validated.maxLength * 2, 4000), // Rough token estimation
            temperature: 0.3 // Lower temperature for more consistent summaries
          });
        });

        // Cache the result
        await cache.set(cacheKey, summary);
        
        logger.info('Summary generated successfully');
        
        return {
          content: [{
            type: "text" as const,
            text: summary
          }]
        };

      } catch (error) {
        logger.error("Error in deepwiki_summarize tool:", error as Error);
        
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        
        return {
          content: [{
            type: "text" as const,
            text: `Error generating summary: ${errorMessage}`
          }]
        };
      }
    }
  );

  logger.info("DeepWiki summarize tool registered successfully");
}
