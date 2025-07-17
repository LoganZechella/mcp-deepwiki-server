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
  private isStdioMode: boolean;

  constructor(private component: string) {
    // Detect if we're in STDIO mode (no PORT env var and --stdio arg or default)
    this.isStdioMode = process.argv.includes('--stdio') || !process.env.PORT;
  }

  private log(level: LogLevel, message: string, ...args: any[]): void {
    // Skip logging in STDIO mode unless DEBUG is explicitly set
    if (this.isStdioMode && !process.env.DEBUG) {
      return;
    }

    const timestamp = new Date().toISOString();
    const prefix = `${timestamp} [${this.component}] [${level}]`;
    
    // Always use stderr to avoid interfering with JSON-RPC on stdout
    const logMessage = `${prefix} ${message}`;
    const additionalArgs = args.length > 0 ? ` ${args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ')}` : '';

    switch (level) {
      case 'debug':
        if (process.env.DEBUG || process.env.LOG_LEVEL === 'debug') {
          process.stderr.write(`${logMessage}${additionalArgs}\n`);
        }
        break;
      case 'info':
        if (!this.isStdioMode || process.env.DEBUG) {
          process.stderr.write(`${logMessage}${additionalArgs}\n`);
        }
        break;
      case 'warn':
        process.stderr.write(`${logMessage}${additionalArgs}\n`);
        break;
      case 'error':
        process.stderr.write(`${logMessage}${additionalArgs}\n`);
        break;
    }
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
