
# Claude Desktop Setup Guide

## Quick Setup

1. **Deploy the server:**
   ```bash
   chmod +x deploy.sh
   ./deploy.sh
   ```

2. **Restart Claude Desktop**

3. **Test the integration:**
   ```
   Use deepwiki_fetch to get documentation for facebook/react
   ```

## Manual Setup

### 1. Build the Server

```bash
npm install
npm run build
chmod +x start.sh
```

### 2. Configure Claude Desktop

Edit your Claude Desktop configuration file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
**Linux:** `~/.config/claude-desktop/claude_desktop_config.json`

Add this configuration:

```json
{
  "mcpServers": {
    "deepwiki-optimized": {
      "command": "node",
      "args": [
        "/full/path/to/mcp-deepwiki-optimized/dist/index.js"
      ],
      "env": {
        "MCP_TIMEOUT": "45000",
        "LOG_LEVEL": "info",
        "NODE_ENV": "production",
        "GITHUB_TOKEN": "your_github_token_optional"
      }
    }
  }
}
```

### 3. Restart Claude Desktop

Close and reopen Claude Desktop to load the new server.

## Verification

### Check Server Status

In Claude Desktop, go to Settings → MCP Servers. You should see:
- ✅ `deepwiki-optimized` - Connected

### Test Commands

Try these commands in Claude Desktop:

```
Use deepwiki_fetch to get documentation for microsoft/typescript
```

```
Use deepwiki_summarize to create an overview of the React library
```

```
Search for Python web frameworks using deepwiki_search
```

## Troubleshooting

### Common Issues

1. **Server not appearing in Claude Desktop**
   - Check the config file path and syntax
   - Verify Node.js path: `which node`
   - Check Claude Desktop logs

2. **"Loading page" errors**
   - The optimized server automatically handles this
   - Falls back to GitHub API when needed
   - Increase timeout if needed: `"MCP_TIMEOUT": "60000"`

3. **Permission errors**
   - Ensure the script is executable: `chmod +x start.sh`
   - Check file permissions: `ls -la dist/index.js`

4. **Node.js version issues**
   - Requires Node.js 18+
   - Check version: `node --version`
   - Update if needed

### Debug Mode

Enable debug logging:

```json
{
  "env": {
    "LOG_LEVEL": "debug"
  }
}
```

### Test Server Manually

```bash
# Test the server directly
npm run test

# Start server manually
./start.sh

# Test MCP protocol
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{}}}' | node dist/index.js
```

## Advanced Configuration

### Environment Variables

- `MCP_TIMEOUT`: Request timeout in milliseconds (default: 45000)
- `LOG_LEVEL`: Logging level (error, warn, info, debug)
- `GITHUB_TOKEN`: GitHub API token for fallback (optional)
- `NODE_ENV`: Environment (production, development)

### GitHub Token Setup

For better GitHub API rate limits:

1. Go to GitHub Settings → Developer settings → Personal access tokens
2. Generate a new token with `public_repo` scope
3. Add to configuration:
   ```json
   "env": {
     "GITHUB_TOKEN": "ghp_your_token_here"
   }
   ```

### Performance Tuning

For slower connections:
```json
"env": {
  "MCP_TIMEOUT": "90000"
}
```

For faster responses:
```json
"env": {
  "MCP_TIMEOUT": "30000"
}
```

## Features

### ✅ Optimizations for Claude Desktop

- **Never returns loading pages** - Validates content before returning
- **45-second timeout** - Optimized for Claude Desktop expectations
- **Automatic GitHub fallback** - When DeepWiki is unavailable
- **Content size limits** - 500KB max for optimal performance
- **Retry logic** - Exponential backoff for reliability
- **Progress reporting** - Keeps Claude Desktop informed

### 🛠️ Available Tools

1. **deepwiki_fetch** - Retrieve repository documentation
   - Modes: aggregate, pages, structured
   - Content filtering: all, documentation, code, examples
   - Metadata inclusion option

2. **deepwiki_summarize** - Generate AI-powered summaries
   - Types: overview, technical, quickstart, api
   - Configurable length (100-5000 words)

3. **deepwiki_search** - Search for repositories
   - Topic filtering
   - Language filtering
   - Configurable result limits

## Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review Claude Desktop logs
3. Test the server manually: `npm run test`
4. Verify your configuration file syntax

