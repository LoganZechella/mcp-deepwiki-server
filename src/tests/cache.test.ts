
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'fs';
import { join } from 'path';
import { CacheService } from '../services/cache-service.js';

describe('Cache Service', () => {
  let cacheService: CacheService;
  let tempCacheDir: string;

  beforeEach(async () => {
    tempCacheDir = join(process.cwd(), '.test-cache');
    cacheService = new CacheService(tempCacheDir, {
      ttl: 1000, // 1 second for testing
      cleanupInterval: 500 // 0.5 seconds for testing
    });
  });

  afterEach(async () => {
    cacheService.shutdown();
    try {
      await fs.rm(tempCacheDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Basic Operations', () => {
    it('should set and get cached data', async () => {
      const key = 'test-key';
      const data = { message: 'Hello, World!' };
      
      await cacheService.set(key, data);
      const result = await cacheService.get(key);
      
      expect(result).toEqual(data);
    });

    it('should return null for non-existent keys', async () => {
      const result = await cacheService.get('non-existent-key');
      expect(result).toBeNull();
    });

    it('should delete cached data', async () => {
      const key = 'test-key';
      const data = { message: 'Hello, World!' };
      
      await cacheService.set(key, data);
      await cacheService.delete(key);
      
      const result = await cacheService.get(key);
      expect(result).toBeNull();
    });

    it('should clear all cached data', async () => {
      await cacheService.set('key1', 'data1');
      await cacheService.set('key2', 'data2');
      
      await cacheService.clear();
      
      const result1 = await cacheService.get('key1');
      const result2 = await cacheService.get('key2');
      
      expect(result1).toBeNull();
      expect(result2).toBeNull();
    });
  });

  describe('TTL (Time To Live)', () => {
    it('should expire data after TTL', async () => {
      const key = 'expiring-key';
      const data = { message: 'This will expire' };
      
      await cacheService.set(key, data, 100); // 100ms TTL
      
      // Should be available immediately
      let result = await cacheService.get(key);
      expect(result).toEqual(data);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Should be expired
      result = await cacheService.get(key);
      expect(result).toBeNull();
    });

    it('should use default TTL when not specified', async () => {
      const key = 'default-ttl-key';
      const data = { message: 'Default TTL' };
      
      await cacheService.set(key, data);
      
      // Should be available (default TTL is 1000ms in test setup)
      const result = await cacheService.get(key);
      expect(result).toEqual(data);
    });

    it('should handle custom TTL per entry', async () => {
      await cacheService.set('short-ttl', 'data1', 50);
      await cacheService.set('long-ttl', 'data2', 200);
      
      // Wait for short TTL to expire
      await new Promise(resolve => setTimeout(resolve, 75));
      
      const shortResult = await cacheService.get('short-ttl');
      const longResult = await cacheService.get('long-ttl');
      
      expect(shortResult).toBeNull();
      expect(longResult).toBe('data2');
    });
  });

  describe('Memory and File Cache', () => {
    it('should serve from memory cache when available', async () => {
      const key = 'memory-test';
      const data = { source: 'memory' };
      
      await cacheService.set(key, data);
      
      // First get should populate memory cache
      const result1 = await cacheService.get(key);
      expect(result1).toEqual(data);
      
      // Second get should serve from memory (faster)
      const result2 = await cacheService.get(key);
      expect(result2).toEqual(data);
    });

    it('should fall back to file cache when memory cache misses', async () => {
      const key = 'file-test';
      const data = { source: 'file' };
      
      await cacheService.set(key, data);
      
      // Create new cache instance to simulate memory cache miss
      const newCacheService = new CacheService(tempCacheDir);
      
      const result = await newCacheService.get(key);
      expect(result).toEqual(data);
      
      newCacheService.shutdown();
    });
  });

  describe('Cache Statistics', () => {
    it('should provide accurate cache statistics', async () => {
      await cacheService.set('key1', 'data1');
      await cacheService.set('key2', 'data2');
      
      const stats = await cacheService.getStats();
      
      expect(stats.memoryEntries).toBe(2);
      expect(stats.fileEntries).toBeGreaterThanOrEqual(2);
      expect(stats.totalSize).toBeGreaterThan(0);
      expect(stats.newestEntry).toBeDefined();
    });

    it('should track oldest and newest entries', async () => {
      await cacheService.set('old-key', 'old-data');
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));
      
      await cacheService.set('new-key', 'new-data');
      
      const stats = await cacheService.getStats();
      
      expect(stats.oldestEntry).toBeDefined();
      expect(stats.newestEntry).toBeDefined();
      expect(stats.newestEntry!.getTime()).toBeGreaterThan(stats.oldestEntry!.getTime());
    });
  });

  describe('Cache Cleanup', () => {
    it('should clean up expired entries', async () => {
      await cacheService.set('expiring1', 'data1', 50);
      await cacheService.set('expiring2', 'data2', 50);
      await cacheService.set('persistent', 'data3', 1000);
      
      // Wait for some entries to expire
      await new Promise(resolve => setTimeout(resolve, 75));
      
      // Trigger cleanup
      await cacheService.cleanup();
      
      const result1 = await cacheService.get('expiring1');
      const result2 = await cacheService.get('expiring2');
      const result3 = await cacheService.get('persistent');
      
      expect(result1).toBeNull();
      expect(result2).toBeNull();
      expect(result3).toBe('data3');
    });

    it('should automatically clean up expired entries', async () => {
      // Set very short cleanup interval for testing
      const fastCleanupCache = new CacheService(tempCacheDir + '-fast', {
        ttl: 50,
        cleanupInterval: 100
      });
      
      await fastCleanupCache.set('auto-expire', 'data');
      
      // Wait for expiration and cleanup
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const result = await fastCleanupCache.get('auto-expire');
      expect(result).toBeNull();
      
      fastCleanupCache.shutdown();
    });
  });

  describe('Hierarchical Storage', () => {
    it('should create hierarchical directory structure', async () => {
      await cacheService.set('test-hierarchy', 'data');
      
      // Check that cache directory exists and has subdirectories
      const cacheExists = await fs.access(tempCacheDir).then(() => true).catch(() => false);
      expect(cacheExists).toBe(true);
      
      // The hierarchical structure should create subdirectories
      const entries = await fs.readdir(tempCacheDir);
      expect(entries.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle file system errors gracefully', async () => {
      // Try to use an invalid cache directory
      const invalidCache = new CacheService('/invalid/path/cache');
      
      // Should not throw, but should handle errors gracefully
      await expect(invalidCache.set('key', 'data')).resolves.not.toThrow();
      
      const result = await invalidCache.get('key');
      // Should return null since file couldn't be written
      expect(result).toBeNull();
      
      invalidCache.shutdown();
    });

    it('should handle corrupted cache files', async () => {
      const key = 'corrupted-key';
      await cacheService.set(key, 'data');
      
      // Corrupt the cache file
      const cacheKey = require('crypto').createHash('sha256').update(key).digest('hex');
      const dir1 = cacheKey.substring(0, 2);
      const dir2 = cacheKey.substring(2, 4);
      const filename = cacheKey.substring(4) + '.json';
      const filePath = join(tempCacheDir, dir1, dir2, filename);
      
      await fs.writeFile(filePath, 'invalid json');
      
      // Should handle corrupted file gracefully
      const result = await cacheService.get(key);
      expect(result).toBeNull();
    });
  });
});
