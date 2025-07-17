
#!/bin/bash

# MCP DeepWiki Server Test Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🧪 Testing MCP DeepWiki Server...${NC}"

# Check if dist directory exists
if [ ! -d "dist" ]; then
    echo -e "${YELLOW}⚠️  Building project first...${NC}"
    npm run build 2>/dev/null || npx tsc
fi

# Check if test file exists
if [ ! -f "dist/test.js" ]; then
    echo -e "${RED}❌ dist/test.js not found. Please run 'npm run build' first.${NC}"
    exit 1
fi

# Set permissions
chmod +x dist/test.js

echo -e "${GREEN}✅ Running comprehensive tests...${NC}"

# Run the test suite
if node dist/test.js; then
    echo
    echo -e "${GREEN}🎉 All tests passed successfully!${NC}"
    echo -e "${YELLOW}💡 The server is ready to use.${NC}"
    exit 0
else
    echo
    echo -e "${RED}❌ Some tests failed.${NC}"
    echo -e "${YELLOW}💡 Check the output above for details.${NC}"
    exit 1
fi
