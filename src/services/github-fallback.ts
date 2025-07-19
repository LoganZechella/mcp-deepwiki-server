
import fetch from 'node-fetch';
import { Logger } from '../utils/logger.js';

export class GitHubFallbackService {
  private logger: Logger;
  private baseUrl = 'https://api.github.com';
  private userAgent = 'MCP-DeepWiki-Server/1.0.0 (GitHub Fallback)';

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async fetchContent(params: {
    url: string;
    mode: string;
    maxDepth: number;
    includeMetadata: boolean;
    contentFilter: string;
  }): Promise<any> {
    const { owner, repo } = this.parseGitHubUrl(params.url);
    this.logger.info(`Fetching GitHub fallback for: ${owner}/${repo}`);

    try {
      // Get repository information
      const repoInfo = await this.getRepositoryInfo(owner, repo);
      
      // Get README content
      const readmeContent = await this.getReadmeContent(owner, repo);
      
      // Get repository structure if needed
      let structure = null;
      if (params.mode === 'structured' || params.mode === 'pages') {
        structure = await this.getRepositoryStructure(owner, repo);
      }

      const result: any = {
        url: params.url,
        mode: params.mode,
        source: 'github-api',
        repository: repoInfo,
        content: readmeContent,
        timestamp: new Date().toISOString(),
      };

      if (structure) {
        result.structure = structure;
      }

      if (params.includeMetadata) {
        result.metadata = {
          ...repoInfo,
          fetchedFrom: 'GitHub API',
          fallbackReason: 'DeepWiki unavailable',
        };
      }

      return result;
    } catch (error) {
      this.logger.error('GitHub fallback failed:', error);
      throw new Error(`GitHub API fallback failed: ${(error as Error).message}`);
    }
  }

  private parseGitHubUrl(url: string): { owner: string; repo: string } {
    // Handle different URL formats
    let cleanUrl = url;
    
    // Remove deepwiki.com prefix if present
    if (url.includes('deepwiki.com/')) {
      cleanUrl = url.split('deepwiki.com/')[1];
    }
    
    // Remove github.com prefix if present
    if (cleanUrl.includes('github.com/')) {
      cleanUrl = cleanUrl.split('github.com/')[1];
    }
    
    // Remove leading slash
    cleanUrl = cleanUrl.replace(/^\//, '');
    
    const parts = cleanUrl.split('/');
    if (parts.length < 2) {
      throw new Error(`Invalid GitHub URL format: ${url}`);
    }
    
    return {
      owner: parts[0],
      repo: parts[1].replace(/\.git$/, ''), // Remove .git suffix if present
    };
  }

  private async getRepositoryInfo(owner: string, repo: string): Promise<any> {
    const url = `${this.baseUrl}/repos/${owner}/${repo}`;
    const response = await this.makeRequest(url);
    const data = await response.json();

    return {
      name: data.name,
      fullName: data.full_name,
      owner: data.owner.login,
      description: data.description || '',
      language: data.language || '',
      stars: data.stargazers_count || 0,
      forks: data.forks_count || 0,
      topics: data.topics || [],
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      defaultBranch: data.default_branch || 'main',
      htmlUrl: data.html_url,
      cloneUrl: data.clone_url,
      size: data.size,
      openIssues: data.open_issues_count || 0,
      license: data.license ? data.license.name : null,
    };
  }

  private async getReadmeContent(owner: string, repo: string): Promise<string> {
    // Try different README file names
    const readmeFiles = ['README.md', 'README.rst', 'README.txt', 'README', 'readme.md'];
    
    for (const filename of readmeFiles) {
      try {
        const url = `${this.baseUrl}/repos/${owner}/${repo}/contents/${filename}`;
        const response = await this.makeRequest(url);
        const data = await response.json();
        
        if (data.content && data.encoding === 'base64') {
          const content = Buffer.from(data.content, 'base64').toString('utf-8');
          this.logger.info(`Found README: ${filename}`);
          return this.processMarkdown(content);
        }
      } catch (error) {
        // Continue to next README file
        continue;
      }
    }
    
    // If no README found, try to get repository description
    this.logger.warn('No README file found, using repository description');
    const repoInfo = await this.getRepositoryInfo(owner, repo);
    return repoInfo.description || 'No documentation available for this repository.';
  }

  private async getRepositoryStructure(owner: string, repo: string): Promise<any> {
    try {
      const url = `${this.baseUrl}/repos/${owner}/${repo}/contents`;
      const response = await this.makeRequest(url);
      const data = await response.json();
      
      if (Array.isArray(data)) {
        return data.map(item => ({
          name: item.name,
          path: item.path,
          type: item.type,
          size: item.size,
          downloadUrl: item.download_url,
        }));
      }
      
      return [];
    } catch (error) {
      this.logger.warn('Could not fetch repository structure:', error);
      return [];
    }
  }

  private processMarkdown(content: string): string {
    // Basic markdown processing for better readability
    return content
      .replace(/^#{1,6}\s+/gm, '') // Remove markdown headers
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold formatting
      .replace(/\*(.*?)\*/g, '$1') // Remove italic formatting
      .replace(/`(.*?)`/g, '$1') // Remove inline code formatting
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Convert links to text
      .replace(/^\s*[-*+]\s+/gm, '• ') // Convert list items
      .replace(/\n{3,}/g, '\n\n') // Normalize line breaks
      .trim();
  }

  private async makeRequest(url: string): Promise<any> {
    const headers: any = {
      'User-Agent': this.userAgent,
      'Accept': 'application/vnd.github.v3+json',
    };

    // Add GitHub token if available
    const githubToken = process.env.GITHUB_TOKEN;
    if (githubToken) {
      headers['Authorization'] = `token ${githubToken}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    try {
      const response = await fetch(url, {
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Repository not found');
        } else if (response.status === 403) {
          throw new Error('GitHub API rate limit exceeded or access denied');
        } else {
          throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
        }
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
}

