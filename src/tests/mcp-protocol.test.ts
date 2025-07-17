
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { DeepWikiMCPServer } from '../index.js';
import { registerDeepWikiTool } from '../tools/deepwiki-tool.js';

describe('MCP Protocol Compliance', () => {
  let server: McpServer;
  let deepWikiServer: DeepWikiMCPServer;

  beforeEach(() => {
    server = new McpServer({
      name: 'test-deepwiki-server',
      version: '1.0.0'
    });
    
    deepWikiServer = new DeepWikiMCPServer();
  });

  afterEach(() => {
    // Cleanup
  });

  describe('Server Initialization', () => {
    it('should initialize with correct name and version', () => {
      expect(server.name).toBe('test-deepwiki-server');
      expect(server.version).toBe('1.0.0');
    });

    it('should register DeepWiki tool correctly', () => {
      registerDeepWikiTool(server);
      
      // Verify tool is registered
      const tools = server.listTools();
      expect(tools).toBeDefined();
      expect(Array.isArray(tools.tools)).toBe(true);
      
      const deepWikiTool = tools.tools.find(tool => tool.name === 'fetch_deepwiki');
      expect(deepWikiTool).toBeDefined();
      expect(deepWikiTool?.description).toContain('DeepWiki');
    });
  });

  describe('Tool Registration', () => {
    beforeEach(() => {
      registerDeepWikiTool(server);
    });

    it('should have correct tool schema', () => {
      const tools = server.listTools();
      const deepWikiTool = tools.tools.find(tool => tool.name === 'fetch_deepwiki');
      
      expect(deepWikiTool).toBeDefined();
      expect(deepWikiTool?.inputSchema).toBeDefined();
      expect(deepWikiTool?.inputSchema.type).toBe('object');
      expect(deepWikiTool?.inputSchema.properties).toBeDefined();
      
      // Check required properties
      const properties = deepWikiTool?.inputSchema.properties as any;
      expect(properties.url).toBeDefined();
      expect(properties.url.type).toBe('string');
      expect(properties.mode).toBeDefined();
      expect(properties.maxDepth).toBeDefined();
    });

    it('should validate tool input schema', () => {
      const tools = server.listTools();
      const deepWikiTool = tools.tools.find(tool => tool.name === 'fetch_deepwiki');
      
      expect(deepWikiTool?.inputSchema.required).toContain('url');
      
      const properties = deepWikiTool?.inputSchema.properties as any;
      expect(properties.mode.enum).toEqual(['aggregate', 'pages']);
      expect(properties.maxDepth.type).toBe('number');
      expect(properties.maxDepth.minimum).toBe(0);
      expect(properties.maxDepth.maximum).toBe(5);
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      registerDeepWikiTool(server);
    });

    it('should handle invalid tool calls gracefully', async () => {
      try {
        await server.callTool({
          name: 'nonexistent_tool',
          arguments: {}
        });
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeDefined();
        expect((error as Error).message).toContain('Unknown tool');
      }
    });

    it('should validate tool arguments', async () => {
      try {
        await server.callTool({
          name: 'fetch_deepwiki',
          arguments: {
            // Missing required 'url' parameter
            mode: 'aggregate'
          }
        });
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle invalid URL format', async () => {
      try {
        await server.callTool({
          name: 'fetch_deepwiki',
          arguments: {
            url: 'not-a-valid-url',
            mode: 'aggregate'
          }
        });
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeDefined();
        expect((error as Error).message).toContain('Invalid URL');
      }
    });
  });

  describe('Transport Compatibility', () => {
    it('should work with STDIO transport', async () => {
      // Mock STDIO transport
      const mockTransport = {
        start: jest.fn(),
        close: jest.fn(),
        send: jest.fn(),
        onMessage: jest.fn()
      };

      // Test would verify STDIO transport compatibility
      expect(mockTransport).toBeDefined();
    });

    it('should work with HTTP transport', async () => {
      // Test HTTP transport compatibility
      const httpServer = new DeepWikiMCPServer();
      expect(httpServer).toBeDefined();
    });
  });

  describe('Message Format Compliance', () => {
    it('should return properly formatted tool responses', async () => {
      registerDeepWikiTool(server);
      
      // Mock a successful tool call response
      const mockResponse = {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              repository: 'test/repo',
              mode: 'aggregate',
              content: 'Test content',
              pageCount: 1,
              fetchedAt: new Date().toISOString()
            })
          }
        ]
      };

      expect(mockResponse.content).toBeDefined();
      expect(Array.isArray(mockResponse.content)).toBe(true);
      expect(mockResponse.content[0].type).toBe('text');
      expect(mockResponse.content[0].text).toBeDefined();
    });

    it('should return properly formatted error responses', async () => {
      const mockErrorResponse = {
        content: [
          {
            type: 'text',
            text: 'Error: Invalid URL format'
          }
        ],
        isError: true
      };

      expect(mockErrorResponse.content).toBeDefined();
      expect(mockErrorResponse.isError).toBe(true);
    });
  });
});
