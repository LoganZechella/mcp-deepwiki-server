
#!/bin/bash

# MCP DeepWiki Server Startup Script
# Optimized for Claude Desktop compatibility

set -e

echo "Starting MCP DeepWiki Server (Claude Desktop Optimized)..."

# Set Claude Desktop compatible environment variables
export MCP_TIMEOUT=45000  # 45 seconds timeout
export LOG_LEVEL=info
export NODE_ENV=production

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed or not in PATH"
    exit 1
fi

# Check Node.js version (require 18+)
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "Error: Node.js version 18 or higher is required (current: $(node -v))"
    exit 1
fi

# Build the project if dist doesn't exist
if [ ! -d "dist" ]; then
    echo "Building TypeScript project..."
    npm run build
fi

# Check if build was successful
if [ ! -f "dist/index.js" ]; then
    echo "Error: Build failed - dist/index.js not found"
    exit 1
fi

echo "MCP DeepWiki Server starting..."
echo "Timeout: ${MCP_TIMEOUT}ms"
echo "Log Level: ${LOG_LEVEL}"

# Start the server
exec node dist/index.js "$@"

