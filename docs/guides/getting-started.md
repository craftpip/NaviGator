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

The defaults work for a local setup. Authentication is required — you'll create an API key in the next steps.

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
{"ok":true,"browserConnected":true,"headless":true,"enableDevtoolsMcp":true,...}
```

## Create an API Key

Open **http://localhost:1994/console/keys** in your browser and create an API key. Copy it — you'll need it in the next step.

## Connect Your MCP Client

Pick your client and paste the config. Replace `your-api-key-here` with the key you just created.

<TabBar values="universal,hermes,openclaw" labels="Universal,Hermes,OpenClaw" group="client" />

<Tabs group="client">

<Tab value="universal" group="client">

Every MCP client supports this format — including OpenCode, Claude Desktop, Cursor, and Windsurf:

```json
{
  "mcpServers": {
    "navigator": {
      "transport": "http",
      "url": "http://localhost:1994/mcp",
      "headers": {
        "Authorization": "Bearer your-api-key-here"
      }
    }
  }
}
```

Save it to wherever your client keeps its MCP servers file.

</Tab>
<Tab value="hermes" group="client">

Add to `~/.hermes/config.yaml`:

```yaml
mcp_servers:
  navigator:
    url: "http://localhost:1994/mcp"
    headers:
      Authorization: "Bearer your-api-key-here"
```

</Tab>
<Tab value="openclaw" group="client">

Add to your OpenClaw config:

```json5
{
  mcp: {
    servers: {
      navigator: {
        url: "http://localhost:1994/mcp",
        transport: "streamable-http",
      },
    },
  },
}
```

Or add it from the Control UI: **Settings → MCP → Add server**, transport **Streamable HTTP**, URL `http://localhost:1994/mcp`.

</Tab>
</Tabs>

That's it. Your agent can now search the web, read pages, and take screenshots.

## What's Running

| Component | Port | Purpose |
|-----------|------|---------|
| MCP Server | 1994 | Tool calls and HTTP endpoints |
| Web Console | 1994/console | Management UI |
| noVNC (optional) | 1996 | Remote desktop browser |

<TabShow value="nodejs">

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

</TabShow>

## Troubleshooting

<Tabs>

<Tab value="docker">

**Container won't start:**
```bash
docker compose logs navigator
```

**Port 1994 already in use:**
Change `MCP_API_PORT` in `.env` and update your client config.

**Browser fails to launch:**
The Docker image includes Chromium. Ensure your system has enough memory (2GB+ recommended).

</Tab>

<Tab value="nodejs">

**Server won't start:**
Check the terminal output for errors and ensure all dependencies are installed.

**Port 1994 already in use:**
Change `MCP_API_PORT` in your environment and update your client config.

**Browser fails to launch:**
Ensure Chromium is installed and `CHROME_PATH` is set correctly. Check that your system has enough memory (2GB+ recommended).

</Tab>

</Tabs>

## Next Steps

- [First Search](/guides/first-search) -- Test your first web search
- [Development Tools](/guides/dev-tools) -- Try the browser devtools
- [Self-Hosting](/guides/self-hosting/overview) -- Production deployment guide
