
/**
 * Configuration management for MCP DeepWiki Server
 * Handles environment variables and service configuration
 */

export interface AIServiceConfig {
  openai?: {
    apiKey: string;
    baseUrl?: string;
    model?: string;
  };
  anthropic?: {
    apiKey: string;
    baseUrl?: string;
    model?: string;
  };
  defaultProvider?: 'openai' | 'anthropic';
  fallbackEnabled?: boolean;
}

export interface ServerConfig {
  ai: AIServiceConfig;
  cache: {
    enabled: boolean;
    ttl: number;
    maxSize: number;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    enableCorrelation: boolean;
    enableMetrics: boolean;
  };
}

/**
 * Load configuration from environment variables
 */
export function loadConfig(): ServerConfig {
  return {
    ai: {
      openai: process.env.OPENAI_API_KEY ? {
        apiKey: process.env.OPENAI_API_KEY,
        baseUrl: process.env.OPENAI_BASE_URL,
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini'
      } : undefined,
      anthropic: process.env.ANTHROPIC_API_KEY ? {
        apiKey: process.env.ANTHROPIC_API_KEY,
        baseUrl: process.env.ANTHROPIC_BASE_URL,
        model: process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307'
      } : undefined,
      defaultProvider: (process.env.AI_DEFAULT_PROVIDER as 'openai' | 'anthropic') || 'openai',
      fallbackEnabled: process.env.AI_FALLBACK_ENABLED !== 'false'
    },
    cache: {
      enabled: process.env.CACHE_ENABLED !== 'false',
      ttl: parseInt(process.env.CACHE_TTL || '3600000', 10), // 1 hour
      maxSize: parseInt(process.env.CACHE_MAX_SIZE || '100', 10)
    },
    logging: {
      level: (process.env.LOG_LEVEL as any) || 'info',
      enableCorrelation: process.env.LOG_CORRELATION !== 'false',
      enableMetrics: process.env.LOG_METRICS !== 'false'
    }
  };
}

export const config = loadConfig();
