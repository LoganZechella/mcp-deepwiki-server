import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { randomUUID } from "node:crypto";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { registerDeepWikiTool } from "./tools/deepwiki-tool.js";
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

    // Register the DeepWiki fetch tool
    try {
      registerDeepWikiTool(this.server);
      logger.info("DeepWiki MCP Server initialized successfully");
    } catch (error) {
      logger.error("Failed to initialize DeepWiki MCP Server:", error);
      throw error;
    }
  }

  /**
   * Start server in STDIO mode (for local editors like Claude Desktop, Cursor)
   */
  async startStdio(): Promise<void> {
    try {
      logger.info("Starting server in STDIO mode...");
      const transport = new StdioServerTransport();
      
      // Add error handling for the transport
      transport.onerror = (error) => {
        logger.error("STDIO transport error:", error);
      };

      await this.server.connect(transport);
      logger.info("MCP DeepWiki Server running in STDIO mode");
    } catch (error) {
      logger.error("Failed to start STDIO server:", error);
      throw error;
    }
  }

  /**
   * Start server in HTTP mode (for remote connections)
   */
  async startHttp(port: number = 4000): Promise<void> {
    try {
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
              id: req.body?.id || null,
            });
          }
        }
      });

      // Handle GET requests for server-to-client notifications via SSE
      app.get('/mcp', async (req, res) => {
        try {
          await this.handleSessionRequest(req, res);
        } catch (error) {
          logger.error("Error handling session request:", error);
          if (!res.headersSent) {
            res.status(500).send('Internal server error');
          }
        }
      });

      // Handle DELETE requests for session termination
      app.delete('/mcp', async (req, res) => {
        try {
          await this.handleSessionRequest(req, res);
        } catch (error) {
          logger.error("Error handling session deletion:", error);
          if (!res.headersSent) {
            res.status(500).send('Internal server error');
          }
        }
      });

      // Health check endpoint
      app.get('/health', (req, res) => {
        res.json({ status: 'ok', server: 'deepwiki-mcp-server', version: '1.0.0' });
      });

      // Error handling middleware
      app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
        logger.error("Express error:", error);
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
      });

      app.listen(port, () => {
        logger.info(`MCP DeepWiki Server running in HTTP mode on port ${port}`);
      });
    } catch (error) {
      logger.error("Failed to start HTTP server:", error);
      throw error;
    }
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

      // Add error handling for transport
      transport.onerror = (error) => {
        logger.error("HTTP transport error:", error);
      };

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
        id: req.body?.id || null,
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
  try {
    const server = new DeepWikiMCPServer();
    
    // Check for environment variables and command line arguments
    const isStdio = process.argv.includes('--stdio') || !process.env.PORT;
    const port = parseInt(process.env.PORT || '4000', 10);

    if (isStdio) {
      await server.startStdio();
    } else {
      await server.startHttp(port);
    }
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
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

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled promise rejection:', reason);
  process.exit(1);
});

// Start the server
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { DeepWikiMCPServer };
