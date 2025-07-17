
#!/bin/bash

# MCP DeepWiki Server Startup Script
# Usage: ./start.sh [stdio|http] [port]

set -e

# Default values
MODE="${1:-stdio}"
PORT="${2:-4000}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting MCP DeepWiki Server...${NC}"

# Check if dist directory exists
if [ ! -d "dist" ]; then
    echo -e "${YELLOW}⚠️  Building project first...${NC}"
    npm run build 2>/dev/null || npx tsc
fi

# Check if main file exists
if [ ! -f "dist/index.js" ]; then
    echo -e "${RED}❌ dist/index.js not found. Please run 'npm run build' first.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Project built successfully${NC}"

# Set permissions
chmod +x dist/index.js

case "$MODE" in
    "stdio")
        echo -e "${BLUE}📡 Starting in STDIO mode (for local editors)...${NC}"
        echo -e "${YELLOW}💡 Use Ctrl+C to stop the server${NC}"
        node dist/index.js --stdio
        ;;
    "http")
        echo -e "${BLUE}🌐 Starting in HTTP mode on port ${PORT}...${NC}"
        echo -e "${YELLOW}💡 Health check: http://localhost:${PORT}/health${NC}"
        echo -e "${YELLOW}💡 MCP endpoint: http://localhost:${PORT}/mcp${NC}"
        export PORT="$PORT"
        node dist/index.js
        ;;
    *)
        echo -e "${RED}❌ Invalid mode: $MODE${NC}"
        echo -e "${YELLOW}Usage: $0 [stdio|http] [port]${NC}"
        echo -e "${YELLOW}Examples:${NC}"
        echo -e "${YELLOW}  $0 stdio           # Start in STDIO mode${NC}"
        echo -e "${YELLOW}  $0 http            # Start in HTTP mode on port 4000${NC}"
        echo -e "${YELLOW}  $0 http 3000       # Start in HTTP mode on port 3000${NC}"
        exit 1
        ;;
esac
