# Quick Start with Docker

Get Navigator running in under a minute with Docker.

## Prerequisites

- Docker and Docker Compose installed
- An MCP client (Claude Desktop, Cursor, OpenCode, or any MCP-compatible client)

## Steps

### 1. Clone and configure

```bash
git clone https://github.com/craftpip/navigator.git
cd navigator
cp .env.example .env
```

The defaults work out of the box. No changes needed for a basic setup.

### 2. Start the server

```bash
docker compose up --build -d
```

This builds the image, starts the browser, and launches the MCP server on port 3000.

### 3. Verify it's running

```bash
curl -s http://localhost:3000/health
```

You should see:

```json
{"ok":true,"backend":"cloakbrowser",...}
```

### 4. Open the web console

Visit **http://localhost:3000/console** in your browser. You'll see:

- Engine health status (which search engines are working)
- Browser instance info
- Live activity feed
- Configuration editor
- Domain hints editor

### 5. Connect your MCP client

Add this to your MCP client configuration:

```json
{
  "mcpServers": {
    "navigator": {
      "transport": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

That's it. Your agent can now search the web, read pages, and take screenshots.

## What's Running

| Component | Port | Purpose |
|-----------|------|---------|
| MCP Server | 3000 | Tool calls and HTTP endpoints |
| Web Console | 3000/console | Management UI |
| noVNC (optional) | 7900 | Remote desktop browser |

## Troubleshooting

**Server won't start:**
```bash
docker compose logs navigator
```

**Port 3000 already in use:**
Change `MCP_API_PORT` in `.env` and update your client config.

**Browser fails to launch:**
The Docker image includes Chromium. If it fails, check that your system has enough memory (2GB+ recommended).

## Next Steps

- [First Search](/guides/first-search) — Test your first web search
- [Client Configuration](/guides/client-config) — Set up Claude Desktop, Cursor, or other clients
- [Self-Hosting](/guides/self-hosting/overview) — Production deployment guide
