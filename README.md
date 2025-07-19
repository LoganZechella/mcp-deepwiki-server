# MCP DeepWiki Server - Production Ready

A fully functional Model Context Protocol (MCP) server for DeepWiki integration with **real GitHub search capabilities**. This server provides comprehensive repository search and documentation fetching optimized for Claude Desktop.

## 🚀 Key Features

### ✅ **Real Repository Search**
- **GitHub Integration**: Uses GitHub's search API for real repository results
- **Advanced Filtering**: Search by language, topics, stars, and more
- **Rich Metadata**: Comprehensive repository information including stars, forks, license, topics
- **Rate Limiting**: Intelligent handling of GitHub API limits with token support

### ✅ **DeepWiki Documentation Fetching**
- **Multi-mode Content**: Aggregate, pages, and structured content retrieval
- **Loading Detection**: Automatically detects and retries when content is still generating
- **Content Validation**: Ensures substantial content before returning results
- **Fallback Mechanisms**: GitHub API fallback when DeepWiki is unavailable

### ✅ **Claude Desktop Optimized**
- **45-second timeout** (configurable via `MCP_TIMEOUT`)
- **Content size limits** (500KB max for Claude Desktop compatibility)
- **Exponential backoff** retry mechanism
- **Progress reporting** for long-running operations

## Installation & Setup

### Prerequisites
- Node.js 18+ 
- GitHub Personal Access Token (for search functionality)

### 1. Clone and Install
```bash
git clone <repository-url>
cd mcp-deepwiki-server
npm install
npm run build
```

### 2. Environment Configuration
```bash
# Copy example environment file
cp .env.example .env

# Edit .env and add your GitHub token
GITHUB_TOKEN=your_github_personal_access_token_here
```

**Get GitHub Token:**
1. Go to https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Select scope: `public_repo` (for public repositories)
4. Copy the generated token to your `.env` file

### 3. Claude Desktop Configuration
Add to your Claude Desktop config file:

```json
{
  "mcpServers": {
    "deepwiki": {
      "command": "node",
      "args": [
        "/path/to/mcp-deepwiki-server/dist/index.js"
      ],
      "env": {
        "GITHUB_TOKEN": "your_github_token_here",
        "MCP_TIMEOUT": "45000",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

## Usage Examples

### Repository Search
```
Search for Python machine learning repositories with the deepwiki_search tool
```

**Example Result:**
- Real repositories like `scikit-learn/scikit-learn`, `tensorflow/tensorflow`
- Rich metadata: stars, forks, topics, license information
- DeepWiki URLs for documentation access

### Documentation Fetching
```
Use deepwiki_fetch to get comprehensive documentation for facebook/react
```

### AI-Powered Summaries
```
Generate a technical summary of the numpy documentation using deepwiki_summarize
```

## API Reference

### `deepwiki_search`
Search for GitHub repositories with DeepWiki documentation.

**Parameters:**
- `query` (string, required): Search query
- `language` (string, optional): Filter by programming language
- `topics` (array, optional): Filter by repository topics
- `limit` (number, optional): Maximum results (default: 10, max: 50)

**Example:**
```json
{
  "name": "deepwiki_search",
  "arguments": {
    "query": "web framework",
    "language": "JavaScript",
    "topics": ["react", "frontend"],
    "limit": 5
  }
}
```

### `deepwiki_fetch`
Retrieve repository documentation from DeepWiki.

**Parameters:**
- `url` (string, required): DeepWiki URL or owner/repo format
- `mode` (enum, optional): 'aggregate', 'pages', or 'structured'
- `maxDepth` (number, optional): Maximum crawling depth
- `includeMetadata` (boolean, optional): Include repository metadata
- `contentFilter` (enum, optional): 'all', 'documentation', 'code', 'examples'

### `deepwiki_summarize`
Generate AI-powered summaries of repository documentation.

**Parameters:**
- `url` (string, required): Repository URL
- `summaryType` (enum, optional): 'overview', 'technical', 'quickstart', 'api'
- `maxLength` (number, optional): Maximum summary length in words

## Rate Limits & Performance

### GitHub API Limits
- **Without Token**: 60 requests/hour
- **With Token**: 5,000 requests/hour
- **Automatic Handling**: Exponential backoff and meaningful error messages

### Performance Optimization
- **Content Caching**: Reduces API calls for repeated requests
- **Size Limits**: 500KB max content for Claude Desktop compatibility
- **Timeout Management**: 45-second default timeout with configurable limits

## Testing

### Run All Tests
```bash
npm test
```

### Unit Tests Only
```bash
npm run test:unit
```

### Integration Tests (requires GitHub token)
```bash
GITHUB_TOKEN=your_token npm run test:integration
```

### Test Coverage
```bash
npm run test:coverage
```

## Troubleshooting

### Common Issues

#### "Repository search failed" Error
- **Cause**: Missing or invalid GitHub token
- **Solution**: Add valid `GITHUB_TOKEN` to environment variables
- **Check**: Verify token has `public_repo` scope

#### "GitHub API rate limit exceeded"
- **Cause**: Too many requests without token or token quota exhausted
- **Solution**: Add GitHub token or wait for rate limit reset
- **Prevention**: Use caching and avoid rapid successive requests

#### "No repositories found"
- **Cause**: Search query too specific or no matching repositories
- **Solution**: Try broader search terms or remove filters

#### "DeepWiki content not ready"
- **Cause**: Repository documentation still being generated
- **Solution**: Wait a few minutes and retry, or use GitHub fallback

### Debug Mode
```bash
LOG_LEVEL=debug npm start
```

### Health Check
```bash
# Test basic functionality
npm run test:unit

# Test GitHub integration
GITHUB_TOKEN=your_token npm run test:integration
```

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Claude        │    │  MCP DeepWiki    │    │   GitHub API    │
│   Desktop       │◄──►│  Server          │◄──►│   (Search)      │
│                 │    │                  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │   DeepWiki      │
                       │ (Documentation) │
                       └─────────────────┘
```

## Development

### Setup Development Environment
```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Lint code
npm run lint

# Fix linting issues
npm run lint:fix
```

### Build for Production
```bash
npm run build
npm start
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_TOKEN` | **Yes** | GitHub Personal Access Token for search |
| `MCP_TIMEOUT` | No | Request timeout in milliseconds (default: 45000) |
| `LOG_LEVEL` | No | Logging level: error, warn, info, debug |
| `SEARCH_MAX_RESULTS` | No | Maximum search results per query (default: 50) |
| `REQUEST_TIMEOUT` | No | HTTP request timeout (default: 30000) |

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes
4. Run tests: `npm test`
5. Commit changes: `git commit -am 'Add your feature'`
6. Push to branch: `git push origin feature/your-feature`
7. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

- **Documentation**: Check this README and inline code comments
- **Issues**: Open an issue on GitHub with detailed error messages
- **Testing**: Use `npm run test:unit` for quick validation
- **Logs**: Set `LOG_LEVEL=debug` for detailed debugging information
