import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DeepWikiFetcher } from "../services/deepwiki-fetcher.js";
import { createLogger } from "../utils/logger.js";
import { validateDeepWikiUrl } from "../utils/url-validator.js";

const logger = createLogger("deepwiki-tool");

// Input schema for the deepwiki_fetch tool
const DeepWikiFetchSchema = z.object({
  url: z.string().min(1, "URL is required"),
  mode: z.enum(["aggregate", "pages"]).optional().default("aggregate"),
  maxDepth: z.number().int().min(1).max(50).optional().default(10)
});

type DeepWikiFetchInput = z.infer<typeof DeepWikiFetchSchema>;

/**
 * Register the DeepWiki fetch tool with the MCP server
 */
export function registerDeepWikiTool(server: McpServer): void {
  const fetcher = new DeepWikiFetcher();

  server.registerTool(
    "deepwiki_fetch",
    {
      title: "DeepWiki Documentation Fetcher",
      description: "Retrieves GitHub repository documentation from DeepWiki. Supports fetching either aggregated content or individual pages.",
      inputSchema: {
        url: z.string().describe("DeepWiki URL or GitHub repository identifier (e.g., 'https://deepwiki.com/owner/repo' or 'owner/repo')"),
        mode: z.enum(["aggregate", "pages"]).optional().describe("Output mode: 'aggregate' returns combined content, 'pages' returns structured page list"),
        maxDepth: z.number().int().min(1).max(50).optional().describe("Maximum depth for crawling pages (default: 10)")
      }
    },
    async (args: { url: string; mode?: "aggregate" | "pages" | undefined; maxDepth?: number | undefined }) => {
      try {
        // Validate input using Zod for runtime validation
        const validated = DeepWikiFetchSchema.parse({
          url: args.url,
          mode: args.mode,
          maxDepth: args.maxDepth
        });

        logger.info(`DeepWiki fetch requested: ${validated.url} (mode: ${validated.mode}, maxDepth: ${validated.maxDepth})`);
        
        // Validate the URL and extract repository information
        const urlInfo = validateDeepWikiUrl(validated.url);
        
        // Fetch the content using the appropriate mode
        let result;
        
        if (validated.mode === "aggregate") {
          result = await fetcher.fetchAggregated(urlInfo, validated.maxDepth);
          
          return {
            content: [{
              type: "text" as const,
              text: result.content || "No content found"
            }]
          };
        } else {
          result = await fetcher.fetchPages(urlInfo, validated.maxDepth);
          
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify(result, null, 2)
            }]
          };
        }

      } catch (error) {
        logger.error("Error in deepwiki_fetch tool:", error);
        
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

  logger.info("DeepWiki fetch tool registered successfully");
}
