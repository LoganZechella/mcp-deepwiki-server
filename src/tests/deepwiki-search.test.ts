import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { DeepWikiService } from '../services/deepwiki.js';
import { Logger } from '../utils/logger.js';

// Mock fetch for testing
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

describe('DeepWikiService - Search Functionality', () => {
  let service: DeepWikiService;
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger();
    service = new DeepWikiService(logger);
    mockFetch.mockClear();
    
    // Mock console methods to suppress logs during testing
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('searchRepositories', () => {
    const mockGitHubResponse = {
      total_count: 2,
      items: [
        {
          id: 1,
          name: 'test-repo-1',
          full_name: 'owner1/test-repo-1',
          owner: {
            login: 'owner1',
            type: 'User'
          },
          description: 'A test repository for testing purposes',
          html_url: 'https://github.com/owner1/test-repo-1',
          language: 'JavaScript',
          topics: ['test', 'javascript'],
          stargazers_count: 150,
          forks_count: 25,
          size: 1024,
          open_issues_count: 5,
          updated_at: '2024-01-15T12:00:00Z',
          created_at: '2024-01-01T10:00:00Z',
          license: {
            name: 'MIT License'
          },
          archived: false,
          fork: false,
          default_branch: 'main'
        },
        {
          id: 2,
          name: 'another-repo',
          full_name: 'owner2/another-repo',
          owner: {
            login: 'owner2',
            type: 'Organization'
          },
          description: 'Another test repository',
          html_url: 'https://github.com/owner2/another-repo',
          language: 'Python',
          topics: ['test', 'python'],
          stargazers_count: 300,
          forks_count: 50,
          size: 2048,
          open_issues_count: 10,
          updated_at: '2024-01-20T15:30:00Z',
          created_at: '2024-01-05T14:00:00Z',
          license: {
            name: 'Apache License 2.0'
          },
          archived: false,
          fork: false,
          default_branch: 'main'
        }
      ]
    };

    it('should successfully search repositories with basic query', async () => {
      // Mock successful GitHub API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'X-RateLimit-Remaining': '4999',
          'X-RateLimit-Limit': '5000'
        }),
        json: async () => mockGitHubResponse
      } as Response);

      const params = {
        query: 'test repository',
        limit: 10
      };

      const results = await service.searchRepositories(params);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        name: 'test-repo-1',
        owner: 'owner1',
        description: 'A test repository for testing purposes',
        url: 'https://deepwiki.com/owner1/test-repo-1',
        githubUrl: 'https://github.com/owner1/test-repo-1',
        language: 'JavaScript',
        topics: ['test', 'javascript'],
        stars: 150,
        forks: 25,
        lastUpdated: '2024-01-15T12:00:00Z',
        createdAt: '2024-01-01T10:00:00Z',
        size: 1024,
        openIssues: 5,
        license: 'MIT License',
        isArchived: false,
        isFork: false,
        defaultBranch: 'main'
      });
    });

    it('should handle language filtering in search query', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'X-RateLimit-Remaining': '4998',
          'X-RateLimit-Limit': '5000'
        }),
        json: async () => mockGitHubResponse
      } as Response);

      const params = {
        query: 'machine learning',
        language: 'Python',
        limit: 5
      };

      await service.searchRepositories(params);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('language:Python'),
        expect.any(Object)
      );
    });

    it('should handle topic filtering in search query', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'X-RateLimit-Remaining': '4997',
          'X-RateLimit-Limit': '5000'
        }),
        json: async () => mockGitHubResponse
      } as Response);

      const params = {
        query: 'web framework',
        topics: ['react', 'frontend'],
        limit: 10
      };

      await service.searchRepositories(params);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('topic:react'),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('topic:frontend'),
        expect.any(Object)
      );
    });

    it('should respect the limit parameter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'X-RateLimit-Remaining': '4996',
          'X-RateLimit-Limit': '5000'
        }),
        json: async () => mockGitHubResponse
      } as Response);

      const params = {
        query: 'test',
        limit: 1
      };

      const results = await service.searchRepositories(params);

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('test-repo-1');
    });

    it('should handle GitHub API rate limit errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        headers: new Headers({
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': '1642681200'
        }),
        statusText: 'Forbidden'
      } as Response);

      const params = {
        query: 'test',
        limit: 10
      };

      await expect(service.searchRepositories(params)).rejects.toThrow(
        /GitHub API rate limit exceeded/
      );
    });

    it('should handle no results found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'X-RateLimit-Remaining': '4995',
          'X-RateLimit-Limit': '5000'
        }),
        json: async () => ({
          total_count: 0,
          items: []
        })
      } as Response);

      const params = {
        query: 'nonexistent-repository-xyz',
        limit: 10
      };

      const results = await service.searchRepositories(params);

      expect(results).toHaveLength(0);
    });

    it('should handle network timeouts', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Request timeout'));

      const params = {
        query: 'test',
        limit: 10
      };

      await expect(service.searchRepositories(params)).rejects.toThrow(
        /Repository search failed.*Request timeout/
      );
    });

    it('should handle malformed GitHub API responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'X-RateLimit-Remaining': '4994',
          'X-RateLimit-Limit': '5000'
        }),
        json: async () => ({
          // Missing items property
          total_count: 1
        })
      } as Response);

      const params = {
        query: 'test',
        limit: 10
      };

      const results = await service.searchRepositories(params);

      expect(results).toHaveLength(0);
    });

    it('should include GitHub token in headers when available', async () => {
      const originalToken = process.env.GITHUB_TOKEN;
      process.env.GITHUB_TOKEN = 'test-token';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'X-RateLimit-Remaining': '4999',
          'X-RateLimit-Limit': '5000'
        }),
        json: async () => mockGitHubResponse
      } as Response);

      const params = {
        query: 'test',
        limit: 10
      };

      await service.searchRepositories(params);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'token test-token'
          })
        })
      );

      // Restore original token
      if (originalToken) {
        process.env.GITHUB_TOKEN = originalToken;
      } else {
        delete process.env.GITHUB_TOKEN;
      }
    });

    it('should build correct search query with all filters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'X-RateLimit-Remaining': '4993',
          'X-RateLimit-Limit': '5000'
        }),
        json: async () => mockGitHubResponse
      } as Response);

      const params = {
        query: 'machine learning',
        language: 'Python',
        topics: ['ml', 'ai'],
        limit: 20
      };

      await service.searchRepositories(params);

      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toContain(encodeURIComponent('machine learning language:Python topic:ml topic:ai archived:false fork:false'));
    });

    it('should handle repositories with missing optional fields', async () => {
      const incompleteResponse = {
        total_count: 1,
        items: [
          {
            id: 1,
            name: 'minimal-repo',
            full_name: 'owner/minimal-repo',
            owner: {
              login: 'owner'
            },
            html_url: 'https://github.com/owner/minimal-repo',
            updated_at: '2024-01-15T12:00:00Z',
            created_at: '2024-01-01T10:00:00Z',
            archived: false,
            fork: false
            // Missing many optional fields
          }
        ]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'X-RateLimit-Remaining': '4992',
          'X-RateLimit-Limit': '5000'
        }),
        json: async () => incompleteResponse
      } as Response);

      const params = {
        query: 'test',
        limit: 10
      };

      const results = await service.searchRepositories(params);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        name: 'minimal-repo',
        owner: 'owner',
        description: 'No description available',
        url: 'https://deepwiki.com/owner/minimal-repo',
        githubUrl: 'https://github.com/owner/minimal-repo',
        language: 'Unknown',
        topics: [],
        stars: 0,
        forks: 0,
        lastUpdated: '2024-01-15T12:00:00Z',
        createdAt: '2024-01-01T10:00:00Z',
        size: 0,
        openIssues: 0,
        license: null,
        isArchived: false,
        isFork: false,
        defaultBranch: 'main'
      });
    });
  });
});
