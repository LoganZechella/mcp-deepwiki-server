
import { DeepWikiUrlInfo } from "../types/index.js";

/**
 * Allowed domains for security
 */
const ALLOWED_DOMAINS = ['deepwiki.com'];

/**
 * Validate and parse a DeepWiki URL
 */
export function validateDeepWikiUrl(input: string): DeepWikiUrlInfo {
  let url: string;
  
  // Handle different input formats
  if (input.startsWith('http://') || input.startsWith('https://')) {
    url = input;
  } else if (input.includes('/')) {
    // Assume it's owner/repo format
    url = `https://deepwiki.com/${input}`;
  } else {
    throw new Error(`Invalid URL format. Expected 'https://deepwiki.com/owner/repo' or 'owner/repo', got: ${input}`);
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch (error) {
    throw new Error(`Invalid URL format: ${input}`);
  }

  // Validate domain
  if (!ALLOWED_DOMAINS.includes(parsedUrl.hostname)) {
    throw new Error(`Domain not allowed. Only ${ALLOWED_DOMAINS.join(', ')} are permitted. Got: ${parsedUrl.hostname}`);
  }

  // Parse owner/repo from path
  const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
  
  if (pathParts.length < 2) {
    throw new Error(`Invalid DeepWiki URL. Expected format: https://deepwiki.com/owner/repo, got: ${url}`);
  }

  const owner = pathParts[0];
  const repo = pathParts[1];

  // Validate owner and repo names (basic GitHub username/repo rules)
  const validNamePattern = /^[a-zA-Z0-9._-]+$/;
  
  if (!owner || !validNamePattern.test(owner)) {
    throw new Error(`Invalid owner name: ${owner}. Must contain only alphanumeric characters, dots, hyphens, and underscores.`);
  }
  
  if (!repo || !validNamePattern.test(repo)) {
    throw new Error(`Invalid repository name: ${repo}. Must contain only alphanumeric characters, dots, hyphens, and underscores.`);
  }

  return {
    originalInput: input,
    fullUrl: url,
    owner,
    repo,
    domain: parsedUrl.hostname
  };
}

/**
 * Validate that a URL belongs to an allowed domain
 */
export function isUrlAllowed(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return ALLOWED_DOMAINS.includes(parsedUrl.hostname);
  } catch {
    return false;
  }
}

/**
 * Sanitize a URL to ensure it's safe
 */
export function sanitizeUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    
    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error(`Unsupported protocol: ${parsedUrl.protocol}`);
    }
    
    // Validate domain
    if (!ALLOWED_DOMAINS.includes(parsedUrl.hostname)) {
      throw new Error(`Domain not allowed: ${parsedUrl.hostname}`);
    }
    
    return parsedUrl.toString();
  } catch (error) {
    throw new Error(`Invalid or unsafe URL: ${url}. ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
