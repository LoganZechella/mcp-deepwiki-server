
#!/bin/bash

# MCP DeepWiki Server Deployment Script
# Optimized for Claude Desktop

set -e

echo "🚀 Deploying MCP DeepWiki Server (Claude Desktop Optimized)"

# Check prerequisites
echo "📋 Checking prerequisites..."

if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18 or higher is required (current: $(node -v))"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"

# Install dependencies
echo "📦 Installing dependencies..."
npm ci --only=production

# Build the project
echo "🔨 Building TypeScript project..."
npm run build

# Verify build
if [ ! -f "dist/index.js" ]; then
    echo "❌ Build failed - dist/index.js not found"
    exit 1
fi

echo "✅ Build successful"

# Test the server
echo "🧪 Testing server functionality..."
npm run test

# Create Claude Desktop config
echo "⚙️  Creating Claude Desktop configuration..."

CURRENT_DIR=$(pwd)
CONFIG_FILE="$HOME/.config/claude-desktop/claude_desktop_config.json"

# Create config directory if it doesn't exist
mkdir -p "$(dirname "$CONFIG_FILE")"

# Check if config file exists
if [ -f "$CONFIG_FILE" ]; then
    echo "📝 Backing up existing Claude Desktop config..."
    cp "$CONFIG_FILE" "$CONFIG_FILE.backup.$(date +%Y%m%d_%H%M%S)"
fi

# Create or update config
cat > "$CONFIG_FILE" << EOF
{
  "mcpServers": {
    "deepwiki-optimized": {
      "command": "node",
      "args": [
        "$CURRENT_DIR/dist/index.js"
      ],
      "env": {
        "MCP_TIMEOUT": "45000",
        "LOG_LEVEL": "info",
        "NODE_ENV": "production"
      }
    }
  }
}
EOF

echo "✅ Claude Desktop configuration created at: $CONFIG_FILE"

# Create systemd service (optional)
if command -v systemctl &> /dev/null; then
    echo "🔧 Creating systemd service (optional)..."
    
    SERVICE_FILE="/etc/systemd/system/mcp-deepwiki.service"
    
    sudo tee "$SERVICE_FILE" > /dev/null << EOF
[Unit]
Description=MCP DeepWiki Server (Claude Desktop Optimized)
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$CURRENT_DIR
ExecStart=$CURRENT_DIR/start.sh
Restart=always
RestartSec=10
Environment=MCP_TIMEOUT=45000
Environment=LOG_LEVEL=info
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl daemon-reload
    echo "✅ Systemd service created. Enable with: sudo systemctl enable mcp-deepwiki"
fi

echo ""
echo "🎉 Deployment completed successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Restart Claude Desktop to load the new MCP server"
echo "2. In Claude Desktop, you should see 'deepwiki-optimized' in your MCP servers"
echo "3. Test with: 'Use deepwiki_fetch to get documentation for facebook/react'"
echo ""
echo "🔧 Configuration file: $CONFIG_FILE"
echo "📁 Server location: $CURRENT_DIR"
echo "🚀 Start manually: ./start.sh"
echo ""
echo "🐛 Troubleshooting:"
echo "- Check logs in Claude Desktop settings"
echo "- Verify Node.js path: $(which node)"
echo "- Test server: npm run test"

