
# MCP DeepWiki Server

A high-performance Model Context Protocol (MCP) server that provides AI assistants with structured access to GitHub repository documentation via [DeepWiki](https://deepwiki.com). This server enables LLMs like Claude, GPT-4, and others to fetch and understand repository documentation on-demand during conversations with enterprise-grade reliability and performance.

## 🚀 Features

### Core Functionality
- 🔌 **Full MCP Compatibility**: Built with the official MCP TypeScript SDK
- 🚀 **Dual Transport Support**: Automatic detection between STDIO (local) and HTTP (remote) modes
- 🛡️ **Security First**: Domain allowlisting and HTML sanitization
- 📖 **Flexible Content Modes**: Aggregate content or structured page-by-page results
- 🔧 **Easy Integration**: Works with Claude Desktop, Cursor, VS Code, and other MCP clients
- 🐳 **Docker Ready**: Containerized deployment support

### 🆕 Phase 1 Enhancements (v1.1.0)
- **🗄️ Intelligent Caching**: Hierarchical file-based caching with TTL support and automatic cleanup
- **⚡ Concurrent Processing**: Parallel page fetching with configurable concurrency limits (5x faster)
- **🔄 Enhanced Resilience**: Retry logic with exponential backoff and circuit breaker pattern
- **📊 Advanced Logging**: Structured logging with correlation IDs and performance metrics

### 🤖 Phase 2 Advanced Features (v2.0.0)
- **🧠 AI-Powered Summarization**: Generate overview, technical, quickstart, or API-focused summaries
- **🔄 Provider Fallback**: Support for both OpenAI and Anthropic APIs with automatic fallback
- **🔍 Repository Search**: Search GitHub repositories with smart filtering and relevance ranking
- **📊 Enhanced Content Organization**: Structured output with content categorization and filtering
- **⚙️ Configuration Management**: Environment-based configuration for API keys and service settings
- **🎯 Rate Limiting**: Intelligent request throttling to respect server limits
- **🧪 Comprehensive Testing**: Full test coverage with integration and performance validation

## Quick Start

### Installation

```bash
# Clone or download the server
git clone <repository-url>
cd mcp-deepwiki-server

# Install dependencies
npm install

# Build the project
npm run build
```

### Running the Server

#### STDIO Mode (for local editors)
```bash
# Development mode
npm run dev

# Production mode
npm start
```

#### HTTP Mode (for remote connections)
```bash
# Set port and start in HTTP mode
PORT=4000 npm start
```

### Testing

```bash
# Run test suite with example repositories
npm test
```

## Usage

### Available Tools

#### 1. DeepWiki Fetch Tool (`deepwiki_fetch`)

Enhanced documentation fetcher with content organization:

- **url** (required): DeepWiki URL or GitHub repository identifier
  - Full URL: `https://deepwiki.com/owner/repo`
  - Shorthand: `owner/repo`
- **mode** (optional): Output format
  - `"aggregate"` (default): Combined content in a single markdown text
  - `"pages"`: Structured list of individual pages with metadata
  - `"structured"`: Organized by content type (guides, references, examples, code)
- **maxDepth** (optional): Maximum crawling depth (1-50, default: 10)
- **includeMetadata** (optional): Include repository metadata (default: false)
- **contentFilter** (optional): Filter content by type
  - `"all"` (default): All content types
  - `"documentation"`: Documentation and guides only
  - `"code"`: Code files and implementations
  - `"examples"`: Code examples and samples

#### 2. DeepWiki Summarize Tool (`deepwiki_summarize`)

AI-powered documentation summarization:

- **url** (required): DeepWiki URL or GitHub repository identifier
- **summaryType** (optional): Type of summary to generate
  - `"overview"` (default): General project overview and features
  - `"technical"`: Technical details and architecture
  - `"quickstart"`: Installation and basic usage guide
  - `"api"`: API reference and endpoints
- **maxLength** (optional): Maximum summary length in words (100-5000, default: 1000)

#### 3. DeepWiki Search Tool (`deepwiki_search`)

Repository discovery and search:

- **query** (required): Search query for repositories
- **topics** (optional): Filter by repository topics/tags (array of strings)
- **language** (optional): Filter by programming language
- **limit** (optional): Maximum results to return (1-50, default: 10)

### Example Tool Calls

```typescript
// 1. Enhanced Fetch Tool Examples

// Structured mode with content filtering
{
  "url": "https://deepwiki.com/modelcontextprotocol/typescript-sdk",
  "mode": "structured",
  "contentFilter": "documentation",
  "includeMetadata": true,
  "maxDepth": 5
}

// Get only code examples
{
  "url": "neka-nat/freecad-mcp",
  "mode": "structured",
  "contentFilter": "examples",
  "maxDepth": 3
}

// 2. AI Summarization Examples

// Generate technical summary
{
  "url": "modelcontextprotocol/typescript-sdk",
  "summaryType": "technical",
  "maxLength": 1500
}

// Create quickstart guide
{
  "url": "microsoft/vscode",
  "summaryType": "quickstart",
  "maxLength": 800
}

// 3. Repository Search Examples

// Search for Python web frameworks
{
  "query": "web framework",
  "language": "Python",
  "topics": ["web", "framework", "api"],
  "limit": 5
}

// Find machine learning libraries
{
  "query": "machine learning",
  "topics": ["ml", "ai", "tensorflow"],
  "limit": 10
}
```

## Configuration

### Environment Variables

For AI-powered features, configure at least one AI provider:

```bash
# Copy the example environment file
cp .env.example .env

# Edit with your API keys
# OpenAI Configuration (recommended)
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4o-mini

# Anthropic Configuration (alternative)
ANTHROPIC_API_KEY=your_anthropic_api_key_here
ANTHROPIC_MODEL=claude-3-haiku-20240307

# AI Service Settings
AI_DEFAULT_PROVIDER=openai
AI_FALLBACK_ENABLED=true

# Cache and Logging
CACHE_ENABLED=true
CACHE_TTL=3600000
LOG_LEVEL=info
```

**Note**: AI features (summarization) require API keys. Search and fetch tools work without AI configuration.

## Integration Guide

### Claude Desktop

Add the following to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "deepwiki": {
      "command": "node",
      "args": ["/path/to/mcp-deepwiki-server/dist/index.js", "--stdio"],
      "env": {
        "OPENAI_API_KEY": "your_openai_api_key_here"
      }
    }
  }
}
```

### Cursor

Create or update `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "deepwiki": {
      "command": "node",
      "args": ["/path/to/mcp-deepwiki-server/dist/index.js", "--stdio"]
    }
  }
}
```

### VS Code GitHub Copilot

Configure in your VS Code settings or workspace:

```json
{
  "github.copilot.mcp.servers": {
    "deepwiki": {
      "command": "node",
      "args": ["/path/to/mcp-deepwiki-server/dist/index.js", "--stdio"]
    }
  }
}
```

### Remote HTTP Usage

For remote connections, start the server in HTTP mode:

```bash
PORT=4000 node dist/index.js
```

Then configure your MCP client to connect to `http://localhost:4000/mcp`.

## Example Conversations

### With Claude Desktop

```
User: How does the MCP TypeScript SDK handle server initialization?

Claude: I'll fetch the documentation for the MCP TypeScript SDK to answer that.

[Claude calls deepwiki_fetch with url="modelcontextprotocol/typescript-sdk"]

Claude: Based on the MCP TypeScript SDK documentation, server initialization involves...
```

### With Cursor

```
User: Explain the architecture of the FreeCAD MCP server

[Cursor automatically calls deepwiki_fetch and provides detailed explanation]
```

## Test Repositories

The server has been tested with these repositories:

- [MCP TypeScript SDK](https://deepwiki.com/modelcontextprotocol/typescript-sdk)
- [FreeCAD MCP Server](https://deepwiki.com/neka-nat/freecad-mcp)
- [OpenAI Agents Python](https://deepwiki.com/openai/openai-agents-python)

## Configuration

### Environment Variables

- `PORT`: Port for HTTP mode (default: 4000)
- `DEBUG`: Enable debug logging
- `LOG_LEVEL`: Set logging level (debug, info, warn, error)

### Security

The server implements several security measures:

- **Domain Allowlisting**: Only `deepwiki.com` domains are allowed
- **HTML Sanitization**: All fetched content is cleaned and sanitized
- **Input Validation**: Strict validation of URLs and parameters
- **Rate Limiting**: Built-in safeguards against excessive requests

## Development

### Project Structure

```
src/
├── index.ts              # Main server entry point
├── tools/
│   └── deepwiki-tool.ts  # DeepWiki fetch tool implementation
├── services/
│   └── deepwiki-fetcher.ts # Content fetching service
├── utils/
│   ├── logger.ts         # Logging utility
│   ├── url-validator.ts  # URL validation and security
│   └── html-sanitizer.ts # HTML cleaning and sanitization
├── types/
│   └── index.ts          # TypeScript type definitions
└── test.ts               # Test suite
```

### Building

```bash
npm run build    # Build TypeScript to dist/
npm run clean    # Clean build directory
npm run watch    # Watch mode for development
```

### Development Mode

```bash
npm run dev      # Run with tsx in development mode
```

## Docker Deployment

### Building the Image

```bash
docker build -t mcp-deepwiki-server .
```

### Running with Docker

```bash
# STDIO mode
docker run -it --rm mcp-deepwiki-server

# HTTP mode
docker run -p 4000:4000 -e PORT=4000 mcp-deepwiki-server
```

## Troubleshooting

### Common Issues

1. **"Domain not allowed" error**: Ensure you're using valid DeepWiki URLs
2. **Connection timeouts**: Check network connectivity to deepwiki.com
3. **Build errors**: Ensure Node.js >= 18 and all dependencies are installed
4. **STDIO not working**: Verify the client is configured correctly

### Debug Mode

Enable debug logging:

```bash
DEBUG=1 npm run dev
```

### Health Check

For HTTP mode, check server health:

```bash
curl http://localhost:4000/health
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:

1. Check the troubleshooting section
2. Review existing issues
3. Create a new issue with detailed information

---

**Built with the [Model Context Protocol](https://modelcontextprotocol.io/) and [DeepWiki](https://deepwiki.com)**
