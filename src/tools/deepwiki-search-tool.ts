
/**
 * DeepWiki Search Tool
 * Provides repository discovery with keyword search and filtering
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createEnhancedLogger } from '../utils/enhanced-logger.js';
import { CacheService } from '../services/cache-service.js';
import { retry, RetryConditions } from '../utils/retry.js';

const logger = createEnhancedLogger('deepwiki-search-tool');

// Input schema for the deepwiki_search tool
const DeepWikiSearchSchema = z.object({
  query: z.string().min(1, "Search query is required"),
  topics: z.array(z.string()).optional(),
  language: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional().default(10)
});

interface SearchResult {
  name: string;
  fullName: string;
  description: string;
  url: string;
  deepwikiUrl: string;
  stars: number;
  language: string;
  topics: string[];
  lastUpdated: string;
  hasDocumentation: boolean;
}

interface SearchResponse {
  results: SearchResult[];
  totalCount: number;
  query: string;
  filters: {
    topics?: string[];
    language?: string;
  };
}

/**
 * Search GitHub repositories using GitHub API
 */
async function searchGitHubRepositories(
  query: string, 
  options: { topics?: string[]; language?: string; limit?: number } = {}
): Promise<SearchResult[]> {
  const { topics, language, limit = 10 } = options;
  
  // Build GitHub search query
  let searchQuery = query;
  
  if (language) {
    searchQuery += ` language:${language}`;
  }
  
  if (topics && topics.length > 0) {
    searchQuery += ` ${topics.map(topic => `topic:${topic}`).join(' ')}`;
  }
  
  // Add filters for repositories with documentation
  searchQuery += ' fork:false archived:false';
  
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(searchQuery)}&sort=stars&order=desc&per_page=${limit}`;
  
  logger.debug(`GitHub API search URL: ${url}`);
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'MCP-DeepWiki-Server/1.0'
    }
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub API error (${response.status}): ${errorText}`);
  }
  
  const data = await response.json();
  
  if (!data.items) {
    return [];
  }
  
  return data.items.map((repo: any): SearchResult => ({
    name: repo.name,
    fullName: repo.full_name,
    description: repo.description || 'No description available',
    url: repo.html_url,
    deepwikiUrl: `https://deepwiki.com/${repo.full_name}`,
    stars: repo.stargazers_count || 0,
    language: repo.language || 'Unknown',
    topics: repo.topics || [],
    lastUpdated: repo.updated_at,
    hasDocumentation: checkHasDocumentation(repo)
  }));
}

/**
 * Check if repository likely has documentation
 */
function checkHasDocumentation(repo: any): boolean {
  // Check for README
  if (repo.has_readme) return true;
  
  // Check for documentation-related topics
  const docTopics = ['documentation', 'docs', 'wiki', 'guide', 'tutorial'];
  if (repo.topics && repo.topics.some((topic: string) => docTopics.includes(topic.toLowerCase()))) {
    return true;
  }
  
  // Check description for documentation keywords
  if (repo.description) {
    const docKeywords = ['documentation', 'docs', 'guide', 'tutorial', 'manual', 'reference'];
    const description = repo.description.toLowerCase();
    if (docKeywords.some(keyword => description.includes(keyword))) {
      return true;
    }
  }
  
  return false;
}

/**
 * Rank and filter search results
 */
function rankResults(results: SearchResult[], query: string): SearchResult[] {
  const queryLower = query.toLowerCase();
  
  return results
    .map(result => ({
      ...result,
      relevanceScore: calculateRelevanceScore(result, queryLower)
    }))
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .map(({ relevanceScore, ...result }) => result);
}

/**
 * Calculate relevance score for ranking
 */
function calculateRelevanceScore(result: SearchResult, query: string): number {
  let score = 0;
  
  // Name match (highest weight)
  if (result.name.toLowerCase().includes(query)) {
    score += 100;
  }
  
  // Description match
  if (result.description.toLowerCase().includes(query)) {
    score += 50;
  }
  
  // Topic match
  if (result.topics.some(topic => topic.toLowerCase().includes(query))) {
    score += 30;
  }
  
  // Star count (logarithmic scaling)
  score += Math.log10(result.stars + 1) * 10;
  
  // Documentation bonus
  if (result.hasDocumentation) {
    score += 20;
  }
  
  // Recent activity bonus (within last year)
  const lastUpdated = new Date(result.lastUpdated);
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  
  if (lastUpdated > oneYearAgo) {
    score += 10;
  }
  
  return score;
}

/**
 * Format search results for display
 */
function formatSearchResults(response: SearchResponse): string {
  const { results, totalCount, query, filters } = response;
  
  let output = `# DeepWiki Repository Search Results\n\n`;
  output += `**Query:** "${query}"\n`;
  output += `**Results:** ${results.length} of ${totalCount} repositories\n`;
  
  if (filters.language) {
    output += `**Language Filter:** ${filters.language}\n`;
  }
  
  if (filters.topics && filters.topics.length > 0) {
    output += `**Topic Filters:** ${filters.topics.join(', ')}\n`;
  }
  
  output += `\n---\n\n`;
  
  if (results.length === 0) {
    output += `No repositories found matching your search criteria.\n\n`;
    output += `**Suggestions:**\n`;
    output += `- Try broader search terms\n`;
    output += `- Remove language or topic filters\n`;
    output += `- Check spelling of search terms\n`;
    return output;
  }
  
  results.forEach((result, index) => {
    output += `## ${index + 1}. ${result.name}\n\n`;
    output += `**Full Name:** ${result.fullName}\n`;
    output += `**Description:** ${result.description}\n`;
    output += `**Language:** ${result.language}\n`;
    output += `**Stars:** ${result.stars.toLocaleString()}\n`;
    
    if (result.topics.length > 0) {
      output += `**Topics:** ${result.topics.join(', ')}\n`;
    }
    
    output += `**Last Updated:** ${new Date(result.lastUpdated).toLocaleDateString()}\n`;
    output += `**Documentation Available:** ${result.hasDocumentation ? 'Yes' : 'Likely'}\n`;
    output += `**GitHub URL:** ${result.url}\n`;
    output += `**DeepWiki URL:** ${result.deepwikiUrl}\n\n`;
    
    if (index < results.length - 1) {
      output += `---\n\n`;
    }
  });
  
  return output;
}

export function registerDeepWikiSearchTool(server: McpServer): void {
  const cache = new CacheService('search', { ttl: 1800000 }); // 30 minutes cache

  server.registerTool(
    "deepwiki_search",
    {
      title: "DeepWiki Repository Search",
      description: "Search for GitHub repositories with documentation available on DeepWiki. Supports filtering by programming language and topics.",
      inputSchema: {
        query: z.string().describe("Search query for repositories (e.g., 'machine learning', 'web framework', 'database')"),
        topics: z.array(z.string()).optional().describe("Filter by repository topics/tags (e.g., ['python', 'api', 'web'])"),
        language: z.string().optional().describe("Filter by programming language (e.g., 'Python', 'JavaScript', 'Go')"),
        limit: z.number().int().min(1).max(50).optional().describe("Maximum number of results to return (default: 10, max: 50)")
      }
    },
    async (args: { query: string; topics?: string[]; language?: string; limit?: number }) => {
      try {
        const validated = {
          query: args.query.trim(),
          topics: args.topics,
          language: args.language,
          limit: args.limit || 10
        };

        logger.info(`DeepWiki search requested: "${validated.query}" (language: ${validated.language || 'any'}, topics: ${validated.topics?.join(',') || 'none'}, limit: ${validated.limit})`);
        
        // Generate cache key
        const cacheKey = JSON.stringify(validated);
        
        // Check cache first
        const cachedResponse = await cache.get<SearchResponse>(cacheKey);
        if (cachedResponse) {
          logger.info('Returning cached search results');
          return {
            content: [{
              type: "text" as const,
              text: formatSearchResults(cachedResponse)
            }]
          };
        }

        // Perform search with retry logic
        logger.info('Searching GitHub repositories');
        
        const searchResults = await retry(
          () => searchGitHubRepositories(validated.query, {
            topics: validated.topics,
            language: validated.language,
            limit: validated.limit
          }),
          {
            maxAttempts: 3,
            baseDelay: 1000,
            retryCondition: RetryConditions.networkAndServerErrors
          }
        );

        // Rank results by relevance
        const rankedResults = rankResults(searchResults, validated.query);
        
        const response: SearchResponse = {
          results: rankedResults,
          totalCount: rankedResults.length,
          query: validated.query,
          filters: {
            topics: validated.topics,
            language: validated.language
          }
        };

        // Cache the results
        await cache.set(cacheKey, response);
        
        logger.info(`Search completed: found ${rankedResults.length} repositories`);
        
        return {
          content: [{
            type: "text" as const,
            text: formatSearchResults(response)
          }]
        };

      } catch (error) {
        logger.error("Error in deepwiki_search tool:", error as Error);
        
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        
        return {
          content: [{
            type: "text" as const,
            text: `Error searching repositories: ${errorMessage}\n\nThis might be due to:\n- GitHub API rate limits\n- Network connectivity issues\n- Invalid search parameters\n\nPlease try again with different search terms or wait a moment before retrying.`
          }]
        };
      }
    }
  );

  logger.info("DeepWiki search tool registered successfully");
}
