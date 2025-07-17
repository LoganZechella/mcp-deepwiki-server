
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DeepWikiFetcher } from "../services/deepwiki-fetcher.js";
import { createLogger } from "../utils/logger.js";
import { validateDeepWikiUrl } from "../utils/url-validator.js";
import { createEnhancedLogger } from "../utils/enhanced-logger.js";

const logger = createEnhancedLogger("deepwiki-tool");

// Input schema for the deepwiki_fetch tool
const DeepWikiFetchSchema = z.object({
  url: z.string().min(1, "URL is required"),
  mode: z.enum(["aggregate", "pages", "structured"]).optional().default("aggregate"),
  maxDepth: z.number().int().min(1).max(50).optional().default(10),
  includeMetadata: z.boolean().optional().default(false),
  contentFilter: z.enum(["all", "documentation", "code", "examples"]).optional().default("all")
});

type DeepWikiFetchInput = z.infer<typeof DeepWikiFetchSchema>;

/**
 * Content categorization and organization utilities
 */
interface ContentSection {
  title: string;
  content: string;
  type: 'documentation' | 'code' | 'example' | 'reference' | 'guide';
  priority: number;
}

/**
 * Categorize content based on patterns and keywords
 */
function categorizeContent(title: string, content: string): ContentSection['type'] {
  const titleLower = title.toLowerCase();
  const contentLower = content.toLowerCase();
  
  // Code examples and snippets
  if (titleLower.includes('example') || titleLower.includes('sample') || 
      titleLower.includes('snippet') || contentLower.includes('```')) {
    return 'example';
  }
  
  // API reference and technical docs
  if (titleLower.includes('api') || titleLower.includes('reference') || 
      titleLower.includes('endpoint') || titleLower.includes('method')) {
    return 'reference';
  }
  
  // Guides and tutorials
  if (titleLower.includes('guide') || titleLower.includes('tutorial') || 
      titleLower.includes('getting started') || titleLower.includes('quickstart')) {
    return 'guide';
  }
  
  // Code files and implementation
  if (titleLower.includes('.js') || titleLower.includes('.py') || 
      titleLower.includes('.java') || titleLower.includes('implementation')) {
    return 'code';
  }
  
  // Default to documentation
  return 'documentation';
}

/**
 * Organize content into structured sections
 */
function organizeContent(pages: any[]): ContentSection[] {
  const sections: ContentSection[] = [];
  
  for (const page of pages) {
    if (!page.content || page.content.trim().length === 0) continue;
    
    const type = categorizeContent(page.title || '', page.content);
    const priority = getPriorityForType(type);
    
    sections.push({
      title: page.title || 'Untitled',
      content: page.content,
      type,
      priority
    });
  }
  
  // Sort by priority (higher priority first)
  return sections.sort((a, b) => b.priority - a.priority);
}

/**
 * Get priority score for content type
 */
function getPriorityForType(type: ContentSection['type']): number {
  switch (type) {
    case 'guide': return 100;
    case 'documentation': return 90;
    case 'reference': return 80;
    case 'example': return 70;
    case 'code': return 60;
    default: return 50;
  }
}

/**
 * Filter content based on content filter
 */
function filterContent(sections: ContentSection[], filter: string): ContentSection[] {
  if (filter === 'all') return sections;
  
  switch (filter) {
    case 'documentation':
      return sections.filter(s => s.type === 'documentation' || s.type === 'guide');
    case 'code':
      return sections.filter(s => s.type === 'code');
    case 'examples':
      return sections.filter(s => s.type === 'example');
    default:
      return sections;
  }
}

/**
 * Format structured output
 */
function formatStructuredOutput(sections: ContentSection[], metadata?: any): string {
  let output = '# DeepWiki Documentation - Structured View\n\n';
  
  if (metadata) {
    output += '## Repository Information\n\n';
    output += `**Repository:** ${metadata.repository || 'Unknown'}\n`;
    output += `**Total Pages:** ${metadata.totalPages || 0}\n`;
    output += `**Content Types:** ${metadata.contentTypes?.join(', ') || 'Unknown'}\n`;
    output += `**Last Fetched:** ${new Date().toISOString()}\n\n`;
    output += '---\n\n';
  }
  
  // Group by type
  const groupedSections = sections.reduce((groups, section) => {
    if (!groups[section.type]) {
      groups[section.type] = [];
    }
    groups[section.type].push(section);
    return groups;
  }, {} as Record<string, ContentSection[]>);
  
  // Output each type group
  const typeOrder: ContentSection['type'][] = ['guide', 'documentation', 'reference', 'example', 'code'];
  
  for (const type of typeOrder) {
    const typeSections = groupedSections[type];
    if (!typeSections || typeSections.length === 0) continue;
    
    output += `## ${type.charAt(0).toUpperCase() + type.slice(1)} Content\n\n`;
    
    for (const section of typeSections) {
      output += `### ${section.title}\n\n`;
      output += `${section.content}\n\n`;
      output += '---\n\n';
    }
  }
  
  return output;
}

/**
 * Register the DeepWiki fetch tool with the MCP server
 */
export function registerDeepWikiTool(server: McpServer): void {
  const fetcher = new DeepWikiFetcher();

  server.registerTool(
    "deepwiki_fetch",
    {
      title: "DeepWiki Documentation Fetcher",
      description: "Retrieves GitHub repository documentation from DeepWiki with enhanced content organization and filtering capabilities.",
      inputSchema: {
        url: z.string().describe("DeepWiki URL or GitHub repository identifier (e.g., 'https://deepwiki.com/owner/repo' or 'owner/repo')"),
        mode: z.enum(["aggregate", "pages", "structured"]).optional().describe("Output mode: 'aggregate' (combined content), 'pages' (JSON list), 'structured' (organized by content type)"),
        maxDepth: z.number().int().min(1).max(50).optional().describe("Maximum depth for crawling pages (default: 10)"),
        includeMetadata: z.boolean().optional().describe("Include repository metadata in output (default: false)"),
        contentFilter: z.enum(["all", "documentation", "code", "examples"]).optional().describe("Filter content by type (default: 'all')")
      }
    },
    async (args: { 
      url: string; 
      mode?: "aggregate" | "pages" | "structured"; 
      maxDepth?: number; 
      includeMetadata?: boolean;
      contentFilter?: "all" | "documentation" | "code" | "examples";
    }) => {
      try {
        // Apply defaults and validate
        const validated = {
          url: args.url,
          mode: args.mode || "aggregate" as const,
          maxDepth: args.maxDepth || 10,
          includeMetadata: args.includeMetadata || false,
          contentFilter: args.contentFilter || "all" as const
        };

        logger.info(`DeepWiki fetch requested: ${validated.url} (mode: ${validated.mode}, maxDepth: ${validated.maxDepth}, filter: ${validated.contentFilter})`);
        
        // Validate the URL and extract repository information
        const urlInfo = validateDeepWikiUrl(validated.url);
        
        // Fetch the content using the appropriate mode
        let result;
        
        if (validated.mode === "aggregate") {
          result = await logger.time('fetch-aggregated', async () => {
            return await fetcher.fetchAggregated(urlInfo, validated.maxDepth);
          });
          
          return {
            content: [{
              type: "text" as const,
              text: result.content || "No content found"
            }]
          };
          
        } else if (validated.mode === "pages") {
          result = await logger.time('fetch-pages', async () => {
            return await fetcher.fetchPages(urlInfo, validated.maxDepth);
          });
          
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify(result, null, 2)
            }]
          };
          
        } else { // structured mode
          result = await logger.time('fetch-structured', async () => {
            return await fetcher.fetchPages(urlInfo, validated.maxDepth);
          });
          
          // Organize content into structured sections
          const sections = organizeContent(result.pages || []);
          
          // Apply content filter
          const filteredSections = filterContent(sections, validated.contentFilter);
          
          // Prepare metadata if requested
          let metadata;
          if (validated.includeMetadata) {
            const contentTypes = [...new Set(sections.map(s => s.type))];
            metadata = {
              repository: `${urlInfo.owner}/${urlInfo.repo}`,
              totalPages: result.pages?.length || 0,
              contentTypes,
              fetchedAt: new Date().toISOString(),
              filter: validated.contentFilter,
              totalSections: sections.length,
              filteredSections: filteredSections.length
            };
          }
          
          // Format structured output
          const structuredOutput = formatStructuredOutput(filteredSections, metadata);
          
          return {
            content: [{
              type: "text" as const,
              text: structuredOutput
            }]
          };
        }

      } catch (error) {
        logger.error("Error in deepwiki_fetch tool:", error as Error);
        
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        
        return {
          content: [{
            type: "text" as const,
            text: `Error fetching DeepWiki content: ${errorMessage}`
          }]
        };
      }
    }
  );

  logger.info("DeepWiki fetch tool registered successfully with enhanced content organization");
}
