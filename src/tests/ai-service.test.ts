
/**
 * Tests for AI Service
 */

import { AIService } from '../services/ai-service.js';

describe('AIService', () => {
  let aiService: AIService;

  beforeEach(() => {
    aiService = new AIService();
  });

  describe('initialization', () => {
    it('should initialize without errors', () => {
      expect(aiService).toBeDefined();
    });

    it('should return available providers', () => {
      const providers = aiService.getAvailableProviders();
      expect(Array.isArray(providers)).toBe(true);
    });
  });

  describe('text generation', () => {
    it('should handle text generation requests', async () => {
      // TODO: Implement test when AI service is complete
      await expect(aiService.generateText('test prompt')).rejects.toThrow();
    });
  });
});
