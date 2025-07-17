
/**
 * AI Service abstraction layer
 * Supports OpenAI and Anthropic APIs with provider fallback
 */

import { createEnhancedLogger } from '../utils/enhanced-logger.js';
import { retry, RetryConditions } from '../utils/retry.js';
import { config } from '../config.js';

const logger = createEnhancedLogger('ai-service');

export interface AIProvider {
  name: string;
  generateText(prompt: string, options?: GenerationOptions): Promise<string>;
  isAvailable(): boolean;
}

export interface GenerationOptions {
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

/**
 * OpenAI API provider implementation
 */
class OpenAIProvider implements AIProvider {
  name = 'openai';
  
  constructor(
    private apiKey: string, 
    private model: string, 
    private baseUrl: string = 'https://api.openai.com/v1'
  ) {}
  
  async generateText(prompt: string, options: GenerationOptions = {}): Promise<string> {
    const {
      maxTokens = 2000,
      temperature = 0.7,
      systemPrompt
    } = options;

    const messages: any[] = [];
    
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    
    messages.push({ role: 'user', content: prompt });

    const requestBody = {
      model: this.model,
      messages,
      max_tokens: maxTokens,
      temperature,
      stream: false
    };

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid response format from OpenAI API');
    }

    return data.choices[0].message.content.trim();
  }
  
  isAvailable(): boolean {
    return !!this.apiKey;
  }
}

/**
 * Anthropic API provider implementation
 */
class AnthropicProvider implements AIProvider {
  name = 'anthropic';
  
  constructor(
    private apiKey: string, 
    private model: string, 
    private baseUrl: string = 'https://api.anthropic.com'
  ) {}
  
  async generateText(prompt: string, options: GenerationOptions = {}): Promise<string> {
    const {
      maxTokens = 2000,
      temperature = 0.7,
      systemPrompt
    } = options;

    const requestBody: any = {
      model: this.model,
      max_tokens: maxTokens,
      temperature,
      messages: [{ role: 'user', content: prompt }]
    };

    if (systemPrompt) {
      requestBody.system = systemPrompt;
    }

    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    
    if (!data.content || !data.content[0] || !data.content[0].text) {
      throw new Error('Invalid response format from Anthropic API');
    }

    return data.content[0].text.trim();
  }
  
  isAvailable(): boolean {
    return !!this.apiKey;
  }
}

/**
 * AI Service with provider fallback and retry logic
 */
export class AIService {
  private providers: AIProvider[] = [];
  private primaryProvider?: AIProvider;
  
  constructor() {
    this.initializeProviders();
  }
  
  private initializeProviders(): void {
    const availableProviders: AIProvider[] = [];

    // Initialize OpenAI provider if configured
    if (config.ai.openai?.apiKey) {
      const openaiProvider = new OpenAIProvider(
        config.ai.openai.apiKey,
        config.ai.openai.model || 'gpt-4o-mini',
        config.ai.openai.baseUrl
      );
      availableProviders.push(openaiProvider);
      logger.info('OpenAI provider initialized');
    }

    // Initialize Anthropic provider if configured
    if (config.ai.anthropic?.apiKey) {
      const anthropicProvider = new AnthropicProvider(
        config.ai.anthropic.apiKey,
        config.ai.anthropic.model || 'claude-3-haiku-20240307',
        config.ai.anthropic.baseUrl
      );
      availableProviders.push(anthropicProvider);
      logger.info('Anthropic provider initialized');
    }

    if (availableProviders.length === 0) {
      logger.warn('No AI providers configured. AI-powered features will be unavailable.');
      return;
    }

    this.providers = availableProviders;

    // Set primary provider based on configuration
    const defaultProvider = config.ai.defaultProvider || 'openai';
    this.primaryProvider = this.providers.find(p => p.name === defaultProvider) || this.providers[0];
    
    logger.info(`AI Service initialized with ${this.providers.length} providers. Primary: ${this.primaryProvider.name}`);
  }
  
  async generateText(prompt: string, options: GenerationOptions = {}): Promise<string> {
    if (this.providers.length === 0) {
      throw new Error('No AI providers available. Please configure OpenAI or Anthropic API keys.');
    }

    const providersToTry = config.ai.fallbackEnabled 
      ? [this.primaryProvider!, ...this.providers.filter(p => p !== this.primaryProvider)]
      : [this.primaryProvider!];

    let lastError: Error | undefined;

    for (const provider of providersToTry) {
      if (!provider.isAvailable()) {
        logger.debug(`Skipping unavailable provider: ${provider.name}`);
        continue;
      }

      try {
        logger.debug(`Attempting text generation with provider: ${provider.name}`);
        
        const result = await retry(
          () => provider.generateText(prompt, options),
          {
            maxAttempts: 3,
            baseDelay: 1000,
            retryCondition: RetryConditions.networkAndServerErrors
          }
        );

        logger.info(`Text generation successful with provider: ${provider.name}`);
        return result;
        
      } catch (error) {
        lastError = error as Error;
        logger.warn(`Provider ${provider.name} failed: ${lastError.message}`, { provider: provider.name, error: lastError.message });
        
        if (!config.ai.fallbackEnabled) {
          throw lastError;
        }
      }
    }

    throw new Error(`All AI providers failed. Last error: ${lastError?.message || 'Unknown error'}`);
  }
  
  getAvailableProviders(): string[] {
    return this.providers.filter(p => p.isAvailable()).map(p => p.name);
  }

  getPrimaryProvider(): string | undefined {
    return this.primaryProvider?.name;
  }

  isAvailable(): boolean {
    return this.providers.some(p => p.isAvailable());
  }
}
