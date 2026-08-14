# navigator examples

These scripts talk to a running navigator server over the Streamable HTTP
MCP transport (default: `http://localhost:3000/mcp`).

Start the server first:

```bash
docker compose up -d
curl -s http://localhost:3000/health
```

Then run an example:

```bash
node examples/web-search.mjs "model context protocol"
node examples/web-fetch.mjs https://example.com
node examples/web-screenshot.mjs https://example.com screenshot.png
```

Point them at a different server with `NAVIGATOR_URL`:

```bash
NAVIGATOR_URL=http://192.168.1.50:3000/mcp node examples/web-search.mjs "hello"
```
