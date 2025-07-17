import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { CacheService } from '../services/cache-service';
import { retry, CircuitBreaker, RetryConditions } from '../utils/retry';
import { ConcurrencyQueue, RateLimiter } from '../utils/concurrency';
import { createEnhancedLogger } from '../utils/enhanced-logger';

describe('Phase 1 Integration Tests', () => {
  let cacheService: CacheService;
  let tempCacheDir: string;

  beforeAll(async () => {
    tempCacheDir = '.test-cache-integration';
    cacheService = new CacheService(tempCacheDir, {
      ttl: 5000, // 5 seconds for testing
      cleanupInterval: 2000 // 2 seconds for testing
    });
  });

  afterAll(async () => {
    cacheService.shutdown();
    // Cleanup test cache directory
    try {
      const { promises: fs } = await import('fs');
      await fs.rm(tempCacheDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Cache Service Integration', () => {
    it('should cache and retrieve data successfully', async () => {
      const key = 'test-integration-key';
      const data = { message: 'Integration test data', timestamp: Date.now() };
      
      // Set data in cache
      await cacheService.set(key, data);
      
      // Retrieve data from cache
      const retrieved = await cacheService.get(key);
      
      expect(retrieved).toEqual(data);
    });

    it('should handle cache expiration', async () => {
      const key = 'expiring-integration-key';
      const data = { message: 'This will expire' };
      
      // Set with short TTL
      await cacheService.set(key, data, 100); // 100ms
      
      // Should be available immediately
      let result = await cacheService.get(key);
      expect(result).toEqual(data);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Should be expired
      result = await cacheService.get(key);
      expect(result).toBeNull();
    });

    it('should provide cache statistics', async () => {
      await cacheService.set('stats-key-1', 'data1');
      await cacheService.set('stats-key-2', 'data2');
      
      const stats = await cacheService.getStats();
      
      expect(stats.memoryEntries).toBeGreaterThanOrEqual(2);
      expect(stats.totalSize).toBeGreaterThan(0);
    });
  });

  describe('Retry Logic Integration', () => {
    it('should retry failed operations and eventually succeed', async () => {
      let attempts = 0;
      const mockOperation = async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error(`Attempt ${attempts} failed`);
        }
        return 'success';
      };

      const result = await retry(mockOperation, {
        maxAttempts: 5,
        baseDelay: 10,
        retryCondition: RetryConditions.always
      });

      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    it('should respect retry conditions', async () => {
      const mockOperation = async () => {
        throw new Error('Non-retryable error');
      };

      await expect(retry(mockOperation, {
        maxAttempts: 3,
        retryCondition: RetryConditions.never
      })).rejects.toThrow('Non-retryable error');
    });
  });

  describe('Circuit Breaker Integration', () => {
    it('should open circuit after failure threshold', async () => {
      const circuitBreaker = new CircuitBreaker({
        failureThreshold: 2,
        resetTimeout: 1000
      });

      const failingOperation = async () => {
        throw new Error('Operation failed');
      };

      // Trigger failures to open circuit
      for (let i = 0; i < 2; i++) {
        try {
          await circuitBreaker.execute(failingOperation);
        } catch (error) {
          // Expected failures
        }
      }

      // Circuit should be open now
      await expect(circuitBreaker.execute(failingOperation))
        .rejects.toThrow('Circuit breaker is OPEN');
    });
  });

  describe('Concurrency Management Integration', () => {
    it('should process tasks with concurrency limits', async () => {
      const queue = new ConcurrencyQueue({ maxConcurrent: 2, timeout: 5000 });
      
      let runningCount = 0;
      let maxRunning = 0;
      
      const createTask = (id: number) => async () => {
        runningCount++;
        maxRunning = Math.max(maxRunning, runningCount);
        
        await new Promise(resolve => setTimeout(resolve, 50));
        
        runningCount--;
        return `task-${id}`;
      };

      const tasks = Array.from({ length: 4 }, (_, i) => createTask(i));
      const results = await queue.addAll(tasks);

      expect(results).toHaveLength(4);
      expect(maxRunning).toBeLessThanOrEqual(2); // Should respect concurrency limit
    });

    it('should handle task failures gracefully', async () => {
      const queue = new ConcurrencyQueue({ maxConcurrent: 2 });

      const tasks = [
        () => Promise.resolve('success1'),
        () => Promise.reject(new Error('failure')),
        () => Promise.resolve('success2')
      ];

      const results = await queue.addAllSettled(tasks);

      expect(results).toHaveLength(3);
      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('rejected');
      expect(results[2].status).toBe('fulfilled');
    });
  });

  describe('Rate Limiter Integration', () => {
    it('should enforce rate limits', async () => {
      const rateLimiter = new RateLimiter(2, 10); // 2 tokens, 10 per second

      // Use up tokens
      await rateLimiter.acquire();
      await rateLimiter.acquire();

      expect(rateLimiter.getTokens()).toBe(0);

      // Next acquisition should wait
      const startTime = Date.now();
      await rateLimiter.acquire();
      const endTime = Date.now();

      expect(endTime - startTime).toBeGreaterThan(50); // Should have waited
    });
  });

  describe('Enhanced Logger Integration', () => {
    it('should create logger with correlation support', () => {
      const logger = createEnhancedLogger('test-component');
      
      logger.setCorrelationId('test-correlation-id');
      expect(logger.getCorrelationId()).toBe('test-correlation-id');
    });

    it('should time operations and collect metrics', async () => {
      const logger = createEnhancedLogger('test-metrics');
      
      const result = await logger.time('test-operation', async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'operation-result';
      });

      expect(result).toBe('operation-result');
      
      const metrics = logger.getMetrics();
      expect(metrics['test-operation']).toBeDefined();
      expect(metrics['test-operation'].count).toBe(1);
      expect(metrics['test-operation'].averageDuration).toBeGreaterThan(40);
    });
  });

  describe('End-to-End Integration', () => {
    it('should integrate cache, retry, and concurrency together', async () => {
      const cache = new CacheService('.test-e2e-cache', { ttl: 10000 });
      const queue = new ConcurrencyQueue({ maxConcurrent: 3 });
      
      // Simulate fetching data with caching and retry
      const fetchWithCache = async (id: number): Promise<string> => {
        const cacheKey = `data-${id}`;
        
        // Check cache first
        const cached = await cache.get<string>(cacheKey);
        if (cached) {
          return cached;
        }
        
        // Simulate network operation with retry
        const result = await retry(async () => {
          // Simulate occasional failures
          if (Math.random() < 0.3) {
            throw new Error('Network error');
          }
          return `fetched-data-${id}`;
        }, {
          maxAttempts: 3,
          baseDelay: 10,
          retryCondition: RetryConditions.always
        });
        
        // Cache the result
        await cache.set(cacheKey, result);
        return result;
      };

      // Process multiple requests concurrently
      const tasks = Array.from({ length: 5 }, (_, i) => () => fetchWithCache(i));
      const results = await queue.addAll(tasks);

      expect(results).toHaveLength(5);
      results.forEach((result, index) => {
        expect(result).toBe(`fetched-data-${index}`);
      });

      // Cleanup
      cache.shutdown();
      try {
        const { promises: fs } = await import('fs');
        await fs.rm('.test-e2e-cache', { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
      }
    });
  });
});
