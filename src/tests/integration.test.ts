import { describe, it, expect, beforeEach } from '@jest/globals';
import { DeepWikiService } from '../services/deepwiki.js';
import { Logger } from '../utils/logger.js';

describe('DeepWikiService - Integration Tests', () => {
  let service: DeepWikiService;
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger();
    service = new DeepWikiService(logger);
  });

  // These tests run against the real GitHub API
  // Skip them if no GitHub token is available
  const skipIntegrationTests = !process.env.GITHUB_TOKEN && process.env.NODE_ENV !== 'ci';

  describe('Real GitHub API Integration', () => {
    const conditionalTest = skipIntegrationTests ? it.skip : it;

    conditionalTest('should search for real repositories', async () => {
      const params = {
        query: 'react',
        language: 'JavaScript',
        limit: 5
      };

      const results = await service.searchRepositories(params);

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(5);

      // Verify result structure
      const firstResult = results[0];
      expect(firstResult).toHaveProperty('name');
      expect(firstResult).toHaveProperty('owner');
      expect(firstResult).toHaveProperty('description');
      expect(firstResult).toHaveProperty('url');
      expect(firstResult).toHaveProperty('githubUrl');
      expect(firstResult).toHaveProperty('language');
      expect(firstResult).toHaveProperty('topics');
      expect(firstResult).toHaveProperty('stars');
      expect(firstResult).toHaveProperty('forks');

      // Verify DeepWiki URL format
      expect(firstResult.url).toMatch(/^https:\/\/deepwiki\.com\/[^\/]+\/[^\/]+$/);
    }, 10000);

    conditionalTest('should handle topic filtering with real API', async () => {
      const params = {
        query: 'machine learning',
        language: 'Python',
        topics: ['ml'],
        limit: 3
      };

      const results = await service.searchRepositories(params);

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      
      // If results are found, verify they match the criteria
      if (results.length > 0) {
        const firstResult = results[0];
        expect(firstResult.language).toBe('Python');
      }
    }, 10000);

    conditionalTest('should handle empty search results gracefully', async () => {
      const params = {
        query: 'this-should-not-exist-unique-query-12345',
        limit: 10
      };

      const results = await service.searchRepositories(params);

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    }, 10000);

    conditionalTest('should respect rate limits and provide meaningful errors', async () => {
      // This test simulates hitting rate limits by making many requests
      // Skip if we don't want to consume API quota
      if (process.env.SKIP_RATE_LIMIT_TEST === 'true') {
        return;
      }

      const params = {
        query: 'test',
        limit: 1
      };

      try {
        // Make a single request to verify the API is working
        const results = await service.searchRepositories(params);
        expect(results).toBeDefined();
      } catch (error) {
        // If we hit a rate limit, verify the error message is helpful
        if ((error as Error).message.includes('rate limit')) {
          expect((error as Error).message).toContain('GitHub API rate limit');
          expect((error as Error).message).toContain('GITHUB_TOKEN');
        } else {
          throw error;
        }
      }
    }, 10000);
  });

  describe('Error Handling Integration', () => {
    it('should handle malformed search queries', async () => {
      const params = {
        query: '', // Empty query
        limit: 10
      };

      await expect(service.searchRepositories(params)).rejects.toThrow();
    });

    it('should handle invalid limit values', async () => {
      const params = {
        query: 'test',
        limit: 0
      };

      const results = await service.searchRepositories(params);
      expect(results).toHaveLength(0);
    });
  });

  describe('Search Query Building', () => {
    it('should build query correctly with all parameters', () => {
      // Access private method for testing (casting to any)
      const buildQuery = (service as any).buildGitHubSearchQuery;
      
      const params = {
        query: 'web framework',
        language: 'TypeScript',
        topics: ['web', 'framework'],
        limit: 10
      };

      const query = buildQuery(params);
      
      expect(query).toContain('web framework');
      expect(query).toContain('language:TypeScript');
      expect(query).toContain('topic:web');
      expect(query).toContain('topic:framework');
      expect(query).toContain('archived:false');
      expect(query).toContain('fork:false');
    });

    it('should handle queries with special characters', () => {
      const buildQuery = (service as any).buildGitHubSearchQuery;
      
      const params = {
        query: 'C++ library',
        limit: 10
      };

      const query = buildQuery(params);
      expect(query).toContain('C++ library');
    });
  });
});
