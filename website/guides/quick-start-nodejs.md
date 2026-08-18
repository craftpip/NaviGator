# Quick Start with Node.js

Run Navigator directly with Node.js if you prefer not to use Docker.

## Prerequisites

- Node.js 20 or later
- Chromium browser installed on your system

## Steps

### 1. Clone and install

```bash
git clone https://github.com/craftpip/navigator.git
cd navigator
npm install
```

### 2. Configure

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and set the path to your Chromium binary:

```bash
CHROME_PATH=/usr/bin/chromium
```

On macOS with Chrome installed:
```bash
CHROME_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome
```

### 3. Start the server

```bash
npm start
```

The server starts on port 3000 by default.

### 4. Verify

```bash
curl -s http://localhost:3000/health
```

### 5. Connect your MCP client

```json
{
  "mcpServers": {
    "navigator": {
      "command": "node",
      "args": ["/absolute/path/to/navigator/src/mcp-server.js"]
    }
  }
}
```

Replace `/absolute/path/to/navigator` with the actual path on your system.

## Development Mode

If you're developing or modifying Navigator:

```bash
# Run with file watching
npm run dev

# Run tests
npm test

# Lint
npm run lint
```

## Next Steps

- [First Search](/guides/first-search) — Test your first web search
- [Client Configuration](/guides/client-config) — Set up your MCP client
