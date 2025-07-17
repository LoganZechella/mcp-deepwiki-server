
# MCP DeepWiki Server

A Model Context Protocol (MCP) server that provides AI assistants with structured access to GitHub repository documentation via [DeepWiki](https://deepwiki.com). This server enables LLMs like Claude, GPT-4, and others to fetch and understand repository documentation on-demand during conversations.

## Features

- 🔌 **Full MCP Compatibility**: Built with the official MCP TypeScript SDK
- 🚀 **Dual Transport Support**: Automatic detection between STDIO (local) and HTTP (remote) modes
- 🛡️ **Security First**: Domain allowlisting and HTML sanitization
- 📖 **Flexible Content Modes**: Aggregate content or structured page-by-page results
- 🔧 **Easy Integration**: Works with Claude Desktop, Cursor, VS Code, and other MCP clients
- 📊 **Comprehensive Error Handling**: Detailed error messages and validation
- 🐳 **Docker Ready**: Containerized deployment support

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

### DeepWiki Fetch Tool

The server provides a `deepwiki_fetch` tool with the following parameters:

- **url** (required): DeepWiki URL or GitHub repository identifier
  - Full URL: `https://deepwiki.com/owner/repo`
  - Shorthand: `owner/repo`
- **mode** (optional): Output format
  - `"aggregate"` (default): Combined content in a single markdown text
  - `"pages"`: Structured list of individual pages with metadata
- **maxDepth** (optional): Maximum crawling depth (1-50, default: 10)

### Example Tool Calls

```typescript
// Aggregate mode - get all content as single markdown
{
  "url": "https://deepwiki.com/modelcontextprotocol/typescript-sdk",
  "mode": "aggregate",
  "maxDepth": 5
}

// Pages mode - get structured page data
{
  "url": "neka-nat/freecad-mcp",
  "mode": "pages",
  "maxDepth": 3
}
```

## Integration Guide

### Claude Desktop

Add the following to your Claude Desktop configuration:

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
