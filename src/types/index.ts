
/**
 * TypeScript type definitions for the MCP DeepWiki Server
 */

/**
 * Information extracted from a DeepWiki URL
 */
export interface DeepWikiUrlInfo {
  originalInput: string;
  fullUrl: string;
  owner: string;
  repo: string;
  domain: string;
}

/**
 * A single page from DeepWiki
 */
export interface DeepWikiPage {
  url: string;
  title: string;
  content: string;
  depth: number;
  rawHtml: string;
  fetchedAt: string;
}

/**
 * Result from DeepWiki fetching operation
 */
export interface DeepWikiResult {
  repository: string;
  mode: "aggregate" | "pages";
  content?: string; // For aggregate mode
  pages?: DeepWikiPage[]; // For pages mode
  pageCount: number;
  fetchedAt: string;
}

/**
 * Configuration for the MCP server
 */
export interface ServerConfig {
  name: string;
  version: string;
  allowedDomains: string[];
  maxDepth: number;
  timeout: number;
  userAgent: string;
}

/**
 * Error types for better error handling
 */
export class DeepWikiError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'DeepWikiError';
  }
}

export class ValidationError extends DeepWikiError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class NetworkError extends DeepWikiError {
  constructor(message: string, details?: any) {
    super(message, 'NETWORK_ERROR', details);
    this.name = 'NetworkError';
  }
}

export class ContentError extends DeepWikiError {
  constructor(message: string, details?: any) {
    super(message, 'CONTENT_ERROR', details);
    this.name = 'ContentError';
  }
}

/**
 * Transport mode for the server
 */
export type TransportMode = 'stdio' | 'http';

/**
 * Server runtime configuration
 */
export interface RuntimeConfig {
  mode: TransportMode;
  port?: number;
  debug: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
