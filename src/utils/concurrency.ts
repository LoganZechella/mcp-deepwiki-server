
import { createLogger } from './logger.js';

const logger = createLogger('concurrency');

export interface ConcurrencyOptions {
  maxConcurrent?: number;
  timeout?: number;
  retryOnError?: boolean;
  maxRetries?: number;
}

/**
 * Simple queue for managing concurrent operations
 */
export class ConcurrencyQueue<T> {
  private queue: Array<() => Promise<T>> = [];
  private running = 0;
  private readonly maxConcurrent: number;
  private readonly timeout: number;

  constructor(options: ConcurrencyOptions = {}) {
    this.maxConcurrent = options.maxConcurrent || 5;
    this.timeout = options.timeout || 30000;
  }

  /**
   * Add a task to the queue
   */
  async add<R>(task: () => Promise<R>): Promise<R> {
    return new Promise((resolve, reject) => {
      const wrappedTask = async () => {
        try {
          const result = await this.executeWithTimeout(task);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      };

      this.queue.push(wrappedTask as () => Promise<T>);
      this.processQueue();
    });
  }

  /**
   * Process all tasks in parallel with concurrency limit
   */
  async addAll<R>(tasks: Array<() => Promise<R>>): Promise<R[]> {
    const promises = tasks.map(task => this.add(task));
    return Promise.all(promises);
  }

  /**
   * Process all tasks and return results with error handling
   */
  async addAllSettled<R>(tasks: Array<() => Promise<R>>): Promise<PromiseSettledResult<R>[]> {
    const promises = tasks.map(task => this.add(task));
    return Promise.allSettled(promises);
  }

  private async processQueue(): Promise<void> {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const task = this.queue.shift();
    if (!task) return;

    this.running++;
    
    try {
      await task();
    } catch (error) {
      logger.error('Task failed:', error);
    } finally {
      this.running--;
      this.processQueue(); // Process next task
    }
  }

  private async executeWithTimeout<R>(task: () => Promise<R>): Promise<R> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Task timed out after ${this.timeout}ms`));
      }, this.timeout);

      task()
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Get queue statistics
   */
  getStats(): {
    queueLength: number;
    running: number;
    maxConcurrent: number;
  } {
    return {
      queueLength: this.queue.length,
      running: this.running,
      maxConcurrent: this.maxConcurrent
    };
  }
}

/**
 * Batch process items with concurrency control
 */
export async function processConcurrently<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  options: ConcurrencyOptions = {}
): Promise<R[]> {
  const queue = new ConcurrencyQueue<R>(options);
  
  const tasks = items.map((item, index) => () => processor(item, index));
  return queue.addAll(tasks);
}

/**
 * Batch process items with error handling
 */
export async function processConcurrentlySettled<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  options: ConcurrencyOptions = {}
): Promise<{
  results: R[];
  errors: Array<{ index: number; error: Error }>;
}> {
  const queue = new ConcurrencyQueue<R>(options);
  
  const tasks = items.map((item, index) => () => processor(item, index));
  const settled = await queue.addAllSettled(tasks);
  
  const results: R[] = [];
  const errors: Array<{ index: number; error: Error }> = [];
  
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      results.push(result.value);
    } else {
      errors.push({ index, error: result.reason });
    }
  });
  
  return { results, errors };
}

/**
 * Rate limiter for controlling request frequency
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per second

  constructor(maxTokens: number = 10, refillRate: number = 1) {
    this.maxTokens = maxTokens;
    this.refillRate = refillRate;
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  /**
   * Acquire a token, waiting if necessary
   */
  async acquire(tokens: number = 1): Promise<void> {
    this.refill();
    
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return;
    }
    
    // Wait for tokens to be available
    const waitTime = ((tokens - this.tokens) / this.refillRate) * 1000;
    await new Promise(resolve => setTimeout(resolve, waitTime));
    
    this.refill();
    this.tokens -= tokens;
  }

  /**
   * Try to acquire tokens without waiting
   */
  tryAcquire(tokens: number = 1): boolean {
    this.refill();
    
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }
    
    return false;
  }

  private refill(): void {
    const now = Date.now();
    const timePassed = (now - this.lastRefill) / 1000;
    const tokensToAdd = timePassed * this.refillRate;
    
    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /**
   * Get current token count
   */
  getTokens(): number {
    this.refill();
    return this.tokens;
  }
}
