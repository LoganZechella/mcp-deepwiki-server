
import { randomUUID } from 'crypto';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  correlationId?: string;
  metadata?: Record<string, any>;
  duration?: number;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export interface LoggerOptions {
  level?: LogLevel;
  enableCorrelation?: boolean;
  enableMetrics?: boolean;
  enableFileLogging?: boolean;
  logFile?: string;
}

/**
 * Enhanced logger with structured logging, correlation IDs, and performance metrics
 */
export class EnhancedLogger {
  private component: string;
  private correlationId?: string;
  private options: Required<LoggerOptions>;
  private metrics = new Map<string, { count: number; totalDuration: number }>();

  constructor(component: string, options: LoggerOptions = {}) {
    this.component = component;
    this.options = {
      level: options.level || (process.env.LOG_LEVEL as LogLevel) || 'info',
      enableCorrelation: options.enableCorrelation ?? true,
      enableMetrics: options.enableMetrics ?? true,
      enableFileLogging: options.enableFileLogging ?? false,
      logFile: options.logFile || 'mcp-deepwiki.log'
    };
  }

  /**
   * Set correlation ID for request tracing
   */
  setCorrelationId(id?: string): void {
    this.correlationId = id || (this.options.enableCorrelation ? randomUUID() : undefined);
  }

  /**
   * Get current correlation ID
   */
  getCorrelationId(): string | undefined {
    return this.correlationId;
  }

  /**
   * Create a child logger with the same correlation ID
   */
  child(component: string): EnhancedLogger {
    const child = new EnhancedLogger(component, this.options);
    child.setCorrelationId(this.correlationId);
    return child;
  }

  /**
   * Log debug message
   */
  debug(message: string, metadata?: Record<string, any>): void {
    this.log('debug', message, metadata);
  }

  /**
   * Log info message
   */
  info(message: string, metadata?: Record<string, any>): void {
    this.log('info', message, metadata);
  }

  /**
   * Log warning message
   */
  warn(message: string, metadata?: Record<string, any>): void {
    this.log('warn', message, metadata);
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error, metadata?: Record<string, any>): void {
    const errorMetadata = error ? {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      }
    } : {};

    this.log('error', message, { ...metadata, ...errorMetadata });
  }

  /**
   * Time a function execution
   */
  async time<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const startTime = Date.now();
    const operationId = randomUUID();
    
    this.debug(`Starting operation: ${operation}`, { operationId });
    
    try {
      const result = await fn();
      const duration = Date.now() - startTime;
      
      this.info(`Operation completed: ${operation}`, { 
        operationId, 
        duration,
        success: true 
      });
      
      if (this.options.enableMetrics) {
        this.updateMetrics(operation, duration);
      }
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.error(`Operation failed: ${operation}`, error as Error, { 
        operationId, 
        duration,
        success: false 
      });
      
      throw error;
    }
  }

  /**
   * Time a synchronous function execution
   */
  timeSync<T>(operation: string, fn: () => T): T {
    const startTime = Date.now();
    const operationId = randomUUID();
    
    this.debug(`Starting operation: ${operation}`, { operationId });
    
    try {
      const result = fn();
      const duration = Date.now() - startTime;
      
      this.info(`Operation completed: ${operation}`, { 
        operationId, 
        duration,
        success: true 
      });
      
      if (this.options.enableMetrics) {
        this.updateMetrics(operation, duration);
      }
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.error(`Operation failed: ${operation}`, error as Error, { 
        operationId, 
        duration,
        success: false 
      });
      
      throw error;
    }
  }

  /**
   * Get performance metrics
   */
  getMetrics(): Record<string, { count: number; averageDuration: number; totalDuration: number }> {
    const result: Record<string, { count: number; averageDuration: number; totalDuration: number }> = {};
    
    for (const [operation, metrics] of this.metrics.entries()) {
      result[operation] = {
        count: metrics.count,
        totalDuration: metrics.totalDuration,
        averageDuration: metrics.totalDuration / metrics.count
      };
    }
    
    return result;
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics.clear();
  }

  private log(level: LogLevel, message: string, metadata?: Record<string, any>): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      component: this.component,
      message,
      ...(this.correlationId && { correlationId: this.correlationId }),
      ...(metadata && { metadata })
    };

    this.output(entry);
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(this.options.level);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex >= currentLevelIndex;
  }

  private output(entry: LogEntry): void {
    // Skip console output in STDIO mode to avoid corrupting MCP protocol
    if (this.isStdioMode()) {
      return;
    }

    const formatted = this.formatEntry(entry);
    
    switch (entry.level) {
      case 'debug':
        console.debug(formatted);
        break;
      case 'info':
        console.info(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      case 'error':
        console.error(formatted);
        break;
    }

    // TODO: Implement file logging if enabled
    if (this.options.enableFileLogging) {
      // File logging implementation would go here
    }
  }

  /**
   * Check if running in STDIO mode (MCP protocol)
   */
  private isStdioMode(): boolean {
    // Check if we're running in STDIO mode for MCP protocol
    // This prevents console output from corrupting the JSON stream
    return process.argv.includes('--stdio') || 
           !process.env.PORT || 
           process.env.MCP_STDIO === 'true' ||
           (process.stdin.isTTY === false && process.stdout.isTTY === false);
  }

  private formatEntry(entry: LogEntry): string {
    const parts = [
      `[${entry.timestamp}]`,
      `[${entry.level.toUpperCase()}]`,
      `[${entry.component}]`
    ];

    if (entry.correlationId) {
      parts.push(`[${entry.correlationId.substring(0, 8)}]`);
    }

    parts.push(entry.message);

    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      parts.push(JSON.stringify(entry.metadata));
    }

    return parts.join(' ');
  }

  private updateMetrics(operation: string, duration: number): void {
    const existing = this.metrics.get(operation) || { count: 0, totalDuration: 0 };
    this.metrics.set(operation, {
      count: existing.count + 1,
      totalDuration: existing.totalDuration + duration
    });
  }
}

/**
 * Create an enhanced logger instance
 */
export function createEnhancedLogger(component: string, options?: LoggerOptions): EnhancedLogger {
  return new EnhancedLogger(component, options);
}

// Global logger registry for correlation ID management
const loggerRegistry = new Map<string, EnhancedLogger>();

/**
 * Get or create a logger with correlation support
 */
export function getLogger(component: string, options?: LoggerOptions): EnhancedLogger {
  if (!loggerRegistry.has(component)) {
    loggerRegistry.set(component, new EnhancedLogger(component, options));
  }
  return loggerRegistry.get(component)!;
}

/**
 * Set correlation ID for all registered loggers
 */
export function setGlobalCorrelationId(id: string): void {
  for (const logger of loggerRegistry.values()) {
    logger.setCorrelationId(id);
  }
}
