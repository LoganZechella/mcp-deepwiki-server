
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ConcurrencyQueue, processConcurrently, processConcurrentlySettled, RateLimiter } from '../utils/concurrency.js';

describe('Concurrency Management', () => {
  describe('ConcurrencyQueue', () => {
    let queue: ConcurrencyQueue<any>;

    beforeEach(() => {
      queue = new ConcurrencyQueue({ maxConcurrent: 2, timeout: 1000 });
    });

    it('should process tasks with concurrency limit', async () => {
      let runningCount = 0;
      let maxRunning = 0;
      
      const createTask = (id: number) => async () => {
        runningCount++;
        maxRunning = Math.max(maxRunning, runningCount);
        
        await new Promise(resolve => setTimeout(resolve, 50));
        
        runningCount--;
        return `task-${id}`;
      };

      const tasks = Array.from({ length: 5 }, (_, i) => createTask(i));
      const results = await queue.addAll(tasks);

      expect(results).toHaveLength(5);
      expect(maxRunning).toBeLessThanOrEqual(2); // Should respect concurrency limit
      expect(results).toEqual(['task-0', 'task-1', 'task-2', 'task-3', 'task-4']);
    });

    it('should handle task failures', async () => {
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

    it('should timeout long-running tasks', async () => {
      const longTask = () => new Promise(resolve => setTimeout(resolve, 2000));

      await expect(queue.add(longTask)).rejects.toThrow('timed out');
    });

    it('should provide accurate queue statistics', async () => {
      const slowTask = () => new Promise(resolve => setTimeout(resolve, 100));
      
      // Add tasks without waiting
      const promise1 = queue.add(slowTask);
      const promise2 = queue.add(slowTask);
      const promise3 = queue.add(slowTask);

      const stats = queue.getStats();
      expect(stats.maxConcurrent).toBe(2);
      expect(stats.running).toBeLessThanOrEqual(2);
      expect(stats.queueLength).toBeGreaterThanOrEqual(0);

      await Promise.all([promise1, promise2, promise3]);
    });
  });

  describe('processConcurrently', () => {
    it('should process items concurrently', async () => {
      const items = [1, 2, 3, 4, 5];
      const processor = async (item: number) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return item * 2;
      };

      const results = await processConcurrently(items, processor, { maxConcurrent: 3 });

      expect(results).toEqual([2, 4, 6, 8, 10]);
    });

    it('should pass index to processor', async () => {
      const items = ['a', 'b', 'c'];
      const processor = async (item: string, index: number) => `${item}-${index}`;

      const results = await processConcurrently(items, processor);

      expect(results).toEqual(['a-0', 'b-1', 'c-2']);
    });
  });

  describe('processConcurrentlySettled', () => {
    it('should handle mixed success and failure', async () => {
      const items = [1, 2, 3, 4];
      const processor = async (item: number) => {
        if (item === 2) throw new Error(`Error for ${item}`);
        return item * 2;
      };

      const { results, errors } = await processConcurrentlySettled(items, processor);

      expect(results).toEqual([2, 6, 8]);
      expect(errors).toHaveLength(1);
      expect(errors[0].index).toBe(1);
      expect(errors[0].error.message).toBe('Error for 2');
    });

    it('should return empty arrays when no items', async () => {
      const processor = async (item: any) => item;
      const { results, errors } = await processConcurrentlySettled([], processor);

      expect(results).toEqual([]);
      expect(errors).toEqual([]);
    });
  });

  describe('RateLimiter', () => {
    it('should allow requests within rate limit', async () => {
      const rateLimiter = new RateLimiter(5, 10); // 5 tokens, 10 per second

      // Should allow 5 immediate requests
      for (let i = 0; i < 5; i++) {
        await rateLimiter.acquire();
      }

      expect(rateLimiter.getTokens()).toBe(0);
    });

    it('should block requests exceeding rate limit', async () => {
      const rateLimiter = new RateLimiter(2, 10); // 2 tokens, 10 per second

      // Use up tokens
      await rateLimiter.acquire();
      await rateLimiter.acquire();

      const startTime = Date.now();
      await rateLimiter.acquire(); // Should wait for refill
      const endTime = Date.now();

      expect(endTime - startTime).toBeGreaterThan(50); // Should have waited
    });

    it('should refill tokens over time', async () => {
      const rateLimiter = new RateLimiter(2, 10); // 2 tokens, 10 per second

      // Use up tokens
      await rateLimiter.acquire(2);
      expect(rateLimiter.getTokens()).toBe(0);

      // Wait for refill
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(rateLimiter.getTokens()).toBeGreaterThan(0);
    });

    it('should support tryAcquire for non-blocking attempts', () => {
      const rateLimiter = new RateLimiter(2, 10);

      expect(rateLimiter.tryAcquire()).toBe(true);
      expect(rateLimiter.tryAcquire()).toBe(true);
      expect(rateLimiter.tryAcquire()).toBe(false); // No tokens left
    });

    it('should handle multiple token acquisition', async () => {
      const rateLimiter = new RateLimiter(5, 10);

      await rateLimiter.acquire(3);
      expect(rateLimiter.getTokens()).toBe(2);

      expect(rateLimiter.tryAcquire(3)).toBe(false); // Not enough tokens
      expect(rateLimiter.tryAcquire(2)).toBe(true); // Exactly enough tokens
    });
  });

  describe('Integration Tests', () => {
    it('should combine rate limiting with concurrency control', async () => {
      const rateLimiter = new RateLimiter(3, 5); // 3 tokens, 5 per second
      const queue = new ConcurrencyQueue({ maxConcurrent: 2 });

      const createRateLimitedTask = (id: number) => async () => {
        await rateLimiter.acquire();
        await new Promise(resolve => setTimeout(resolve, 10));
        return `task-${id}`;
      };

      const tasks = Array.from({ length: 5 }, (_, i) => createRateLimitedTask(i));
      
      const startTime = Date.now();
      const results = await queue.addAll(tasks);
      const endTime = Date.now();

      expect(results).toHaveLength(5);
      expect(endTime - startTime).toBeGreaterThan(100); // Should be rate limited
    });

    it('should handle concurrent failures gracefully', async () => {
      const queue = new ConcurrencyQueue({ maxConcurrent: 3 });

      const tasks = Array.from({ length: 10 }, (_, i) => async () => {
        if (i % 3 === 0) throw new Error(`Task ${i} failed`);
        return `success-${i}`;
      });

      const results = await queue.addAllSettled(tasks);

      const successes = results.filter(r => r.status === 'fulfilled');
      const failures = results.filter(r => r.status === 'rejected');

      expect(successes).toHaveLength(7); // 10 - 3 failures (0, 3, 6, 9)
      expect(failures).toHaveLength(3);
    });
  });
});
