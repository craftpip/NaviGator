# Client Configuration

Add Navigator to your MCP client. The configuration depends on which client you're using.

## Universal Config

For any MCP client that supports HTTP transport:

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

## Claude Desktop

Edit `claude_desktop_config.json`:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

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

Restart Claude Desktop after saving.

## Cursor

Open Cursor Settings → MCP → Add new MCP server:

```json
{
  "navigator": {
    "transport": "http",
    "url": "http://localhost:1994/mcp"
  }
}
```

Or edit `.cursor/mcp.json` in your project.

## OpenCode

Add to your `opencode.json`:

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

## Windsurf

Open Windsurf Settings → MCP → Add server:

```json
{
  "navigator": {
    "transport": "http",
    "url": "http://localhost:1994/mcp"
  }
}
```

## Stdio Mode (Local)

If you're running Navigator locally without Docker:

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

## With Authentication

If you've enabled API key authentication (`MCP_ALLOW_UNAUTHENTICATED=0`):

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

## Remote Server

If Navigator is running on a different machine:

```json
{
  "mcpServers": {
    "navigator": {
      "transport": "http",
      "url": "http://192.168.1.100:1994/mcp"
    }
  }
}
```

::: warning
Don't expose Navigator to the public internet without authentication. See the [Security guide](/guides/self-hosting/security) for details.
:::

## Verifying the Connection

After adding the config and restarting your client:

1. Ask your agent: "Search for something"
2. If it returns search results, Navigator is connected
3. If not, check the [Troubleshooting](/guides/getting-started#troubleshooting) section

## Next Steps

- [First Search](/guides/first-search) — Test that everything works
- [Security](/guides/self-hosting/security) — Add authentication for production
