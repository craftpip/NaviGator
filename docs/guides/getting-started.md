# Getting Started

Get Navigator running in under a minute.

<TabBar values="docker,nodejs" labels="Docker (recommended),Node.js" />

## Prerequisites

<Tabs>
<Tab value="docker">

- Docker and Docker Compose installed
- An MCP client (Claude Desktop, Cursor, OpenCode, or any MCP-compatible client)

</Tab>
<Tab value="nodejs">

- Node.js 20 or later
- Chromium browser installed on your system
- An MCP client (Claude Desktop, Cursor, OpenCode, or any MCP-compatible client)

</Tab>
</Tabs>

## Install

<Tabs>
<Tab value="docker">

Clone and configure:

```bash
git clone https://github.com/craftpip/navigator.git
cd navigator
cp .env.example .env
```

The defaults work out of the box. No changes needed for a basic setup.

Start the server:

```bash
docker compose up --build -d
```

This builds the image, starts the browser, and launches the MCP server on port 1994.

</Tab>
<Tab value="nodejs">

Clone and install:

```bash
git clone https://github.com/craftpip/navigator.git
cd navigator
npm install
```

Copy the example environment file and set the path to your Chromium binary:

```bash
cp .env.example .env
```

```bash
CHROME_PATH=/usr/bin/chromium
```

On macOS with Chrome installed:
```bash
CHROME_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome
```

Start the server:

```bash
npm start
```

</Tab>
</Tabs>

## Verify

```bash
curl -s http://localhost:1994/health
```

You should see:

```json
{"ok":true,"backend":"cloakbrowser",...}
```

## Open the Web Console

Visit **http://localhost:1994/console** in your browser. You'll see:

- Engine health status (which search engines are working)
- Browser instance info
- Live activity feed
- Configuration editor
- Domain hints editor

## Connect Your MCP Client

<Tabs>
<Tab value="docker">

Add this to your MCP client configuration:

```json
{
  "mcpServers": {
    "navigator": {
      "transport": "http",
      "url": "http://localhost:1994/mcp"
    }
  }
}
```

</Tab>
<Tab value="nodejs">

Add this to your MCP client configuration:

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

</Tab>
</Tabs>

That's it. Your agent can now search the web, read pages, and take screenshots.

## What's Running

| Component | Port | Purpose |
|-----------|------|---------|
| MCP Server | 1994 | Tool calls and HTTP endpoints |
| Web Console | 1994/console | Management UI |
| noVNC (optional) | 1996 | Remote desktop browser |

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

## Troubleshooting

**Server won't start:**
```bash
# Docker
docker compose logs navigator

# Node.js
# Check the terminal output for errors
```

**Port 1994 already in use:**
Change `MCP_API_PORT` in `.env` and update your client config.

**Browser fails to launch:**
The Docker image includes Chromium. If running without Docker, ensure Chromium is installed and `CHROME_PATH` is set correctly. Check that your system has enough memory (2GB+ recommended).

## Next Steps

- [First Search](/guides/first-search) -- Test your first web search
- [Client Configuration](/guides/client-config) -- Set up Claude Desktop, Cursor, or other clients
- [Self-Hosting](/guides/self-hosting/overview) -- Production deployment guide
