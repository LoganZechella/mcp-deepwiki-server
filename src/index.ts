
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { randomUUID } from "node:crypto";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { registerDeepWikiTool } from "./tools/deepwiki-tool.js";
import { registerDeepWikiSummarizeTool } from "./tools/deepwiki-summarize-tool.js";
import { registerDeepWikiSearchTool } from "./tools/deepwiki-search-tool.js";
import { createLogger } from "./utils/logger.js";

const logger = createLogger("main");

/**
 * Main MCP Server for DeepWiki integration
 * Supports both STDIO and HTTP transports with automatic detection
 */
class DeepWikiMCPServer {
  private server: McpServer;
  private transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

  constructor() {
    this.server = new McpServer({
      name: "deepwiki-server",
      version: "1.0.0"
    });

    // Register all DeepWiki tools
    registerDeepWikiTool(this.server);
    registerDeepWikiSummarizeTool(this.server);
    registerDeepWikiSearchTool(this.server);

    logger.info("DeepWiki MCP Server initialized with all Phase 2 tools");
  }

  /**
   * Start server in STDIO mode (for local editors like Claude Desktop, Cursor)
   */
  async startStdio(): Promise<void> {
    logger.info("Starting server in STDIO mode...");
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info("MCP DeepWiki Server running in STDIO mode");
  }

  /**
   * Start server in HTTP mode (for remote connections)
   */
  async startHttp(port: number = 4000): Promise<void> {
    logger.info(`Starting server in HTTP mode on port ${port}...`);
    
    const app = express();
    app.use(express.json());

    // CORS middleware for browser-based clients
    app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id');
      res.header('Access-Control-Expose-Headers', 'Mcp-Session-Id');
      
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
      }
      next();
    });

    // Handle POST requests for client-to-server communication
    app.post('/mcp', async (req, res) => {
      try {
        await this.handleHttpRequest(req, res);
      } catch (error) {
        logger.error("Error handling HTTP request:", error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Internal server error',
            },
            id: null,
          });
        }
      }
    });

    // Handle GET requests for server-to-client notifications via SSE
    app.get('/mcp', async (req, res) => {
      await this.handleSessionRequest(req, res);
    });

    // Handle DELETE requests for session termination
    app.delete('/mcp', async (req, res) => {
      await this.handleSessionRequest(req, res);
    });

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({ status: 'ok', server: 'deepwiki-mcp-server', version: '1.0.0' });
    });

    app.listen(port, () => {
      logger.info(`MCP DeepWiki Server running in HTTP mode on port ${port}`);
    });
  }

  private async handleHttpRequest(req: express.Request, res: express.Response): Promise<void> {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && this.transports[sessionId]) {
      // Reuse existing transport
      transport = this.transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      // New initialization request
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sessionId) => {
          this.transports[sessionId] = transport;
          logger.info(`New session initialized: ${sessionId}`);
        },
        enableDnsRebindingProtection: true,
        allowedHosts: ['127.0.0.1', 'localhost'],
      });

      // Clean up transport when closed
      transport.onclose = () => {
        if (transport.sessionId) {
          delete this.transports[transport.sessionId];
          logger.info(`Session closed: ${transport.sessionId}`);
        }
      };

      // Connect to the MCP server
      await this.server.connect(transport);
    } else {
      // Invalid request
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: No valid session ID provided',
        },
        id: null,
      });
      return;
    }

    // Handle the request
    await transport.handleRequest(req, res, req.body);
  }

  private async handleSessionRequest(req: express.Request, res: express.Response): Promise<void> {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !this.transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    
    const transport = this.transports[sessionId];
    await transport.handleRequest(req, res);
  }
}

/**
 * Automatic transport detection based on environment
 */
async function main(): Promise<void> {
  const server = new DeepWikiMCPServer();
  
  // Check for environment variables and command line arguments
  const isStdio = process.argv.includes('--stdio') || !process.env.PORT;
  const port = parseInt(process.env.PORT || '4000', 10);

  if (isStdio) {
    await server.startStdio();
  } else {
    await server.startHttp(port);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

// Start the server
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error('Server error:', error);
    process.exit(1);
  });
}

export { DeepWikiMCPServer };
