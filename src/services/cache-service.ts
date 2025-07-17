
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { createHash } from 'crypto';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('cache-service');

export interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number;
  key: string;
}

export interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  maxSize?: number; // Maximum cache size in MB
  cleanupInterval?: number; // Cleanup interval in milliseconds
}

/**
 * File-based caching service with TTL support and hierarchical storage
 */
export class CacheService {
  private readonly cacheDir: string;
  private readonly defaultTtl: number;
  private readonly maxSize: number;
  private readonly cleanupInterval: number;
  private cleanupTimer?: NodeJS.Timeout;
  private memoryCache = new Map<string, CacheEntry>();

  constructor(cacheDir: string = '.cache', options: CacheOptions = {}) {
    this.cacheDir = cacheDir;
    this.defaultTtl = options.ttl || 24 * 60 * 60 * 1000; // 24 hours
    this.maxSize = options.maxSize || 100; // 100MB
    this.cleanupInterval = options.cleanupInterval || 60 * 60 * 1000; // 1 hour

    this.initializeCache();
    this.startCleanupTimer();
  }

  /**
   * Get cached data by key
   */
  async get<T>(key: string): Promise<T | null> {
    const cacheKey = this.generateCacheKey(key);
    
    // Check memory cache first
    const memoryEntry = this.memoryCache.get(cacheKey);
    if (memoryEntry && !this.isExpired(memoryEntry)) {
      logger.debug(`Cache hit (memory): ${key}`);
      return memoryEntry.data as T;
    }

    // Check file cache
    try {
      const filePath = this.getCacheFilePath(cacheKey);
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const entry: CacheEntry<T> = JSON.parse(fileContent);

      if (this.isExpired(entry)) {
        logger.debug(`Cache expired: ${key}`);
        await this.delete(key);
        return null;
      }

      // Update memory cache
      this.memoryCache.set(cacheKey, entry);
      logger.debug(`Cache hit (file): ${key}`);
      return entry.data;
    } catch (error) {
      logger.debug(`Cache miss: ${key}`);
      return null;
    }
  }

  /**
   * Set cached data with optional TTL
   */
  async set<T>(key: string, data: T, ttl?: number): Promise<void> {
    const cacheKey = this.generateCacheKey(key);
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTtl,
      key: cacheKey
    };

    // Store in memory cache
    this.memoryCache.set(cacheKey, entry);

    // Store in file cache
    try {
      const filePath = this.getCacheFilePath(cacheKey);
      await fs.mkdir(dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, JSON.stringify(entry, null, 2));
      logger.debug(`Cache set: ${key}`);
    } catch (error) {
      logger.error(`Failed to write cache file for ${key}:`, error);
    }
  }

  /**
   * Delete cached data by key
   */
  async delete(key: string): Promise<void> {
    const cacheKey = this.generateCacheKey(key);
    
    // Remove from memory cache
    this.memoryCache.delete(cacheKey);

    // Remove from file cache
    try {
      const filePath = this.getCacheFilePath(cacheKey);
      await fs.unlink(filePath);
      logger.debug(`Cache deleted: ${key}`);
    } catch (error) {
      // File might not exist, which is fine
      logger.debug(`Cache file not found for deletion: ${key}`);
    }
  }

  /**
   * Clear all cached data
   */
  async clear(): Promise<void> {
    this.memoryCache.clear();
    
    try {
      await fs.rm(this.cacheDir, { recursive: true, force: true });
      await this.initializeCache();
      logger.info('Cache cleared');
    } catch (error) {
      logger.error('Failed to clear cache:', error);
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    memoryEntries: number;
    fileEntries: number;
    totalSize: number;
    oldestEntry?: Date;
    newestEntry?: Date;
  }> {
    const memoryEntries = this.memoryCache.size;
    let fileEntries = 0;
    let totalSize = 0;
    let oldestTimestamp = Infinity;
    let newestTimestamp = 0;

    try {
      const files = await this.getAllCacheFiles();
      fileEntries = files.length;

      for (const file of files) {
        const stats = await fs.stat(file);
        totalSize += stats.size;

        try {
          const content = await fs.readFile(file, 'utf-8');
          const entry: CacheEntry = JSON.parse(content);
          oldestTimestamp = Math.min(oldestTimestamp, entry.timestamp);
          newestTimestamp = Math.max(newestTimestamp, entry.timestamp);
        } catch {
          // Skip invalid files
        }
      }
    } catch (error) {
      logger.error('Failed to get cache stats:', error);
    }

    return {
      memoryEntries,
      fileEntries,
      totalSize,
      ...(oldestTimestamp !== Infinity && { oldestEntry: new Date(oldestTimestamp) }),
      ...(newestTimestamp > 0 && { newestEntry: new Date(newestTimestamp) })
    };
  }

  /**
   * Cleanup expired entries
   */
  async cleanup(): Promise<void> {
    logger.debug('Starting cache cleanup');
    let cleanedCount = 0;

    // Cleanup memory cache
    for (const [key, entry] of this.memoryCache.entries()) {
      if (this.isExpired(entry)) {
        this.memoryCache.delete(key);
        cleanedCount++;
      }
    }

    // Cleanup file cache
    try {
      const files = await this.getAllCacheFiles();
      
      for (const file of files) {
        try {
          const content = await fs.readFile(file, 'utf-8');
          const entry: CacheEntry = JSON.parse(content);
          
          if (this.isExpired(entry)) {
            await fs.unlink(file);
            cleanedCount++;
          }
        } catch (error) {
          // Remove invalid files
          await fs.unlink(file);
          cleanedCount++;
        }
      }
    } catch (error) {
      logger.error('Failed to cleanup cache files:', error);
    }

    if (cleanedCount > 0) {
      logger.info(`Cache cleanup completed: ${cleanedCount} entries removed`);
    }
  }

  /**
   * Shutdown the cache service
   */
  shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined as any;
    }
    logger.info('Cache service shutdown');
  }

  private async initializeCache(): Promise<void> {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
      logger.info(`Cache initialized at ${this.cacheDir}`);
    } catch (error) {
      logger.error('Failed to initialize cache directory:', error);
    }
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup().catch(error => {
        logger.error('Cache cleanup failed:', error);
      });
    }, this.cleanupInterval);
  }

  private generateCacheKey(key: string): string {
    return createHash('sha256').update(key).digest('hex');
  }

  private getCacheFilePath(cacheKey: string): string {
    // Create hierarchical structure: first 2 chars / next 2 chars / rest
    const dir1 = cacheKey.substring(0, 2);
    const dir2 = cacheKey.substring(2, 4);
    const filename = cacheKey.substring(4) + '.json';
    return join(this.cacheDir, dir1, dir2, filename);
  }

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  private async getAllCacheFiles(): Promise<string[]> {
    const files: string[] = [];
    
    const scanDirectory = async (dir: string): Promise<void> => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          
          if (entry.isDirectory()) {
            await scanDirectory(fullPath);
          } else if (entry.isFile() && entry.name.endsWith('.json')) {
            files.push(fullPath);
          }
        }
      } catch (error) {
        // Directory might not exist
      }
    };

    await scanDirectory(this.cacheDir);
    return files;
  }
}

// Global cache instance
let globalCache: CacheService | null = null;

/**
 * Get or create the global cache instance
 */
export function getCache(): CacheService {
  if (!globalCache) {
    globalCache = new CacheService();
  }
  return globalCache;
}

/**
 * Initialize cache with custom options
 */
export function initializeCache(cacheDir?: string, options?: CacheOptions): CacheService {
  if (globalCache) {
    globalCache.shutdown();
  }
  globalCache = new CacheService(cacheDir, options);
  return globalCache;
}
