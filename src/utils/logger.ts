
/**
 * Simple logger utility for the MCP DeepWiki Server
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface Logger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
}

class SimpleLogger implements Logger {
  constructor(private component: string) {}

  private log(level: LogLevel, message: string, ...args: any[]): void {
    // Skip console output in STDIO mode to avoid corrupting MCP protocol
    if (this.isStdioMode()) {
      return;
    }

    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}] [${this.component}]`;
    
    switch (level) {
      case 'debug':
        if (process.env.DEBUG || process.env.LOG_LEVEL === 'debug') {
          console.debug(prefix, message, ...args);
        }
        break;
      case 'info':
        console.info(prefix, message, ...args);
        break;
      case 'warn':
        console.warn(prefix, message, ...args);
        break;
      case 'error':
        console.error(prefix, message, ...args);
        break;
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

  debug(message: string, ...args: any[]): void {
    this.log('debug', message, ...args);
  }

  info(message: string, ...args: any[]): void {
    this.log('info', message, ...args);
  }

  warn(message: string, ...args: any[]): void {
    this.log('warn', message, ...args);
  }

  error(message: string, ...args: any[]): void {
    this.log('error', message, ...args);
  }
}

/**
 * Create a logger instance for a specific component
 */
export function createLogger(component: string): Logger {
  return new SimpleLogger(component);
}
