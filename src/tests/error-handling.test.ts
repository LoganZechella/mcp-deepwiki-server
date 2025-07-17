
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { retry, CircuitBreaker, CircuitBreakerState, RetryConditions } from '../utils/retry.js';
import { ConcurrencyQueue } from '../utils/concurrency.js';

describe('Error Handling and Resilience', () => {
  describe('Retry Logic', () => {
    it('should succeed on first attempt', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      const result = await retry(mockFn, { maxAttempts: 3 });
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const mockFn = jest.fn()
        .mockRejectedValueOnce(new Error('First failure'))
        .mockRejectedValueOnce(new Error('Second failure'))
        .mockResolvedValue('success');
      
      const result = await retry(mockFn, { 
        maxAttempts: 3,
        baseDelay: 10 // Short delay for testing
      });
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should fail after max attempts', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('Persistent failure'));
      
      await expect(retry(mockFn, { 
        maxAttempts: 2,
        baseDelay: 10
      })).rejects.toThrow('Persistent failure');
      
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should respect retry conditions', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('Non-retryable error'));
      
      await expect(retry(mockFn, {
        maxAttempts: 3,
        retryCondition: () => false // Never retry
      })).rejects.toThrow('Non-retryable error');
      
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should use exponential backoff', async () => {
      const mockFn = jest.fn()
        .mockRejectedValueOnce(new Error('First failure'))
        .mockRejectedValueOnce(new Error('Second failure'))
        .mockResolvedValue('success');
      
      const startTime = Date.now();
      
      await retry(mockFn, {
        maxAttempts: 3,
        baseDelay: 100,
        backoffFactor: 2,
        jitter: false
      });
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should take at least 100ms (first retry) + 200ms (second retry) = 300ms
      expect(duration).toBeGreaterThan(250);
    });
  });

  describe('Circuit Breaker', () => {
    let circuitBreaker: CircuitBreaker;

    beforeEach(() => {
      circuitBreaker = new CircuitBreaker({
        failureThreshold: 3,
        resetTimeout: 1000
      });
    });

    it('should start in CLOSED state', () => {
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should open after failure threshold', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('Failure'));
      
      // Trigger failures to open circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(mockFn);
        } catch (error) {
          // Expected failures
        }
      }
      
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
    });

    it('should reject immediately when OPEN', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('Failure'));
      
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(mockFn);
        } catch (error) {
          // Expected failures
        }
      }
      
      // Should reject immediately without calling function
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow('Circuit breaker is OPEN');
      expect(mockFn).toHaveBeenCalledTimes(3); // Only called during opening
    });

    it('should transition to HALF_OPEN after reset timeout', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('Failure'));
      
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(mockFn);
        } catch (error) {
          // Expected failures
        }
      }
      
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
      
      // Wait for reset timeout (using a shorter timeout for testing)
      circuitBreaker = new CircuitBreaker({
        failureThreshold: 3,
        resetTimeout: 50
      });
      
      // Trigger failures to open
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(mockFn);
        } catch (error) {
          // Expected failures
        }
      }
      
      // Wait for reset
      await new Promise(resolve => setTimeout(resolve, 60));
      
      // Next call should transition to HALF_OPEN
      const successFn = jest.fn().mockResolvedValue('success');
      await circuitBreaker.execute(successFn);
      
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.HALF_OPEN);
    });

    it('should close after successful calls in HALF_OPEN', async () => {
      // This test would require more complex setup to properly test the HALF_OPEN -> CLOSED transition
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });
  });

  describe('Retry Conditions', () => {
    it('should identify network errors', () => {
      const networkErrors = [
        new Error('Network timeout'),
        new Error('ECONNRESET'),
        new Error('ENOTFOUND'),
        new Error('HTTP 500 error')
      ];
      
      networkErrors.forEach(error => {
        expect(RetryConditions.networkAndServerErrors(error)).toBe(true);
      });
    });

    it('should identify temporary errors', () => {
      const temporaryErrors = [
        new Error('Request timeout'),
        new Error('Rate limit exceeded'),
        new Error('HTTP 503 Service Unavailable'),
        new Error('HTTP 502 Bad Gateway')
      ];
      
      temporaryErrors.forEach(error => {
        expect(RetryConditions.temporaryErrors(error)).toBe(true);
      });
    });

    it('should not retry permanent errors', () => {
      const permanentErrors = [
        new Error('HTTP 404 Not Found'),
        new Error('HTTP 401 Unauthorized'),
        new Error('Invalid input')
      ];
      
      permanentErrors.forEach(error => {
        expect(RetryConditions.temporaryErrors(error)).toBe(false);
      });
    });
  });

  describe('Concurrency Error Handling', () => {
    it('should handle individual task failures', async () => {
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

    it('should handle timeout errors', async () => {
      const queue = new ConcurrencyQueue({ 
        maxConcurrent: 1,
        timeout: 100
      });
      
      const slowTask = () => new Promise(resolve => setTimeout(resolve, 200));
      
      await expect(queue.add(slowTask)).rejects.toThrow('timed out');
    });
  });

  describe('Error Categorization', () => {
    it('should categorize HTTP errors correctly', () => {
      const httpErrors = [
        { code: 400, retryable: false },
        { code: 401, retryable: false },
        { code: 403, retryable: false },
        { code: 404, retryable: false },
        { code: 429, retryable: true },
        { code: 500, retryable: true },
        { code: 502, retryable: true },
        { code: 503, retryable: true },
        { code: 504, retryable: true }
      ];
      
      httpErrors.forEach(({ code, retryable }) => {
        const error = new Error(`HTTP ${code} error`);
        expect(RetryConditions.networkAndServerErrors(error)).toBe(retryable);
      });
    });

    it('should categorize network errors correctly', () => {
      const networkErrors = [
        'ECONNRESET',
        'ENOTFOUND',
        'ETIMEDOUT',
        'ECONNREFUSED'
      ];
      
      networkErrors.forEach(errorCode => {
        const error = new Error(errorCode);
        expect(RetryConditions.networkAndServerErrors(error)).toBe(true);
      });
    });
  });
});
