
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerDeepWikiTool } from '../tools/deepwiki-tool.js';
import { DeepWikiFetcher } from '../services/deepwiki-fetcher.js';

// Mock the fetcher
jest.mock('../services/deepwiki-fetcher.js');

describe('Tool Invocation Tests', () => {
  let server: McpServer;
  let mockFetcher: jest.Mocked<DeepWikiFetcher>;

  beforeEach(() => {
    server = new McpServer({
      name: 'test-server',
      version: '1.0.0'
    });
    
    registerDeepWikiTool(server);
    
    // Setup mock fetcher
    mockFetcher = new DeepWikiFetcher() as jest.Mocked<DeepWikiFetcher>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('fetch_deepwiki Tool', () => {
    it('should successfully fetch in aggregate mode', async () => {
      const mockResult = {
        repository: 'test/repo',
        mode: 'aggregate' as const,
        content: 'Test aggregated content',
        pageCount: 3,
        fetchedAt: '2024-01-01T00:00:00.000Z'
      };

      mockFetcher.fetchAggregated = jest.fn().mockResolvedValue(mockResult);

      const response = await server.callTool({
        name: 'fetch_deepwiki',
        arguments: {
          url: 'https://deepwiki.com/test/repo',
          mode: 'aggregate',
          maxDepth: 2
        }
      });

      expect(response.content).toBeDefined();
      expect(Array.isArray(response.content)).toBe(true);
      expect(response.content[0].type).toBe('text');
      
      const result = JSON.parse(response.content[0].text);
      expect(result.repository).toBe('test/repo');
      expect(result.mode).toBe('aggregate');
      expect(result.content).toBe('Test aggregated content');
      expect(result.pageCount).toBe(3);
    });

    it('should successfully fetch in pages mode', async () => {
      const mockResult = {
        repository: 'test/repo',
        mode: 'pages' as const,
        pages: [
          {
            url: 'https://deepwiki.com/test/repo',
            title: 'Test Page',
            content: 'Test content',
            depth: 0,
            rawHtml: '<html>Test</html>',
            fetchedAt: '2024-01-01T00:00:00.000Z'
          }
        ],
        pageCount: 1,
        fetchedAt: '2024-01-01T00:00:00.000Z'
      };

      mockFetcher.fetchPages = jest.fn().mockResolvedValue(mockResult);

      const response = await server.callTool({
        name: 'fetch_deepwiki',
        arguments: {
          url: 'https://deepwiki.com/test/repo',
          mode: 'pages',
          maxDepth: 1
        }
      });

      expect(response.content).toBeDefined();
      const result = JSON.parse(response.content[0].text);
      expect(result.repository).toBe('test/repo');
      expect(result.mode).toBe('pages');
      expect(result.pages).toBeDefined();
      expect(Array.isArray(result.pages)).toBe(true);
      expect(result.pages[0].title).toBe('Test Page');
    });

    it('should handle invalid URLs', async () => {
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

    it('should handle non-DeepWiki URLs', async () => {
      try {
        await server.callTool({
          name: 'fetch_deepwiki',
          arguments: {
            url: 'https://example.com/test',
            mode: 'aggregate'
          }
        });
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeDefined();
        expect((error as Error).message).toContain('deepwiki.com');
      }
    });

    it('should validate maxDepth parameter', async () => {
      try {
        await server.callTool({
          name: 'fetch_deepwiki',
          arguments: {
            url: 'https://deepwiki.com/test/repo',
            mode: 'aggregate',
            maxDepth: 10 // Exceeds maximum
          }
        });
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle fetcher errors gracefully', async () => {
      mockFetcher.fetchAggregated = jest.fn().mockRejectedValue(new Error('Network error'));

      try {
        await server.callTool({
          name: 'fetch_deepwiki',
          arguments: {
            url: 'https://deepwiki.com/test/repo',
            mode: 'aggregate'
          }
        });
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeDefined();
        expect((error as Error).message).toContain('Network error');
      }
    });

    it('should use default values for optional parameters', async () => {
      const mockResult = {
        repository: 'test/repo',
        mode: 'aggregate' as const,
        content: 'Test content',
        pageCount: 1,
        fetchedAt: '2024-01-01T00:00:00.000Z'
      };

      mockFetcher.fetchAggregated = jest.fn().mockResolvedValue(mockResult);

      const response = await server.callTool({
        name: 'fetch_deepwiki',
        arguments: {
          url: 'https://deepwiki.com/test/repo'
          // mode and maxDepth should use defaults
        }
      });

      expect(response.content).toBeDefined();
      expect(mockFetcher.fetchAggregated).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'test',
          repo: 'repo'
        }),
        2 // Default maxDepth
      );
    });
  });

  describe('Tool Response Format', () => {
    it('should return consistent response structure', async () => {
      const mockResult = {
        repository: 'test/repo',
        mode: 'aggregate' as const,
        content: 'Test content',
        pageCount: 1,
        fetchedAt: '2024-01-01T00:00:00.000Z'
      };

      mockFetcher.fetchAggregated = jest.fn().mockResolvedValue(mockResult);

      const response = await server.callTool({
        name: 'fetch_deepwiki',
        arguments: {
          url: 'https://deepwiki.com/test/repo',
          mode: 'aggregate'
        }
      });

      expect(response).toHaveProperty('content');
      expect(Array.isArray(response.content)).toBe(true);
      expect(response.content.length).toBe(1);
      expect(response.content[0]).toHaveProperty('type', 'text');
      expect(response.content[0]).toHaveProperty('text');

      const result = JSON.parse(response.content[0].text);
      expect(result).toHaveProperty('repository');
      expect(result).toHaveProperty('mode');
      expect(result).toHaveProperty('pageCount');
      expect(result).toHaveProperty('fetchedAt');
    });

    it('should include error information in response', async () => {
      mockFetcher.fetchAggregated = jest.fn().mockRejectedValue(new Error('Test error'));

      try {
        await server.callTool({
          name: 'fetch_deepwiki',
          arguments: {
            url: 'https://deepwiki.com/test/repo',
            mode: 'aggregate'
          }
        });
      } catch (error) {
        expect(error).toBeDefined();
        expect((error as Error).message).toContain('Test error');
      }
    });
  });
});
