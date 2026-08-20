# Security

Secure your Navigator deployment — authentication, network isolation, and best practices.

## Authentication

### API Key Authentication

By default, anyone on your network can use Navigator. Enable API key authentication:

```bash
# In .env
MCP_ALLOW_UNAUTHENTICATED=0
MCP_API_KEYS=your-secret-key-here
```

### Adding Keys to Your Client

```json
{
  "mcpServers": {
    "navigator": {
      "transport": "http",
      "url": "http://localhost:1994/mcp",
      "headers": {
        "Authorization": "Bearer your-secret-key-here"
      }
    }
  }
}
```

### Multiple API Keys

Separate keys with commas:

```bash
MCP_API_KEYS=key1,key2,key3
```

Each key is independent — revoking one doesn't affect others.

### Managing Keys via Console

The web console at `/console` provides a UI for:

- Creating new API keys
- Revoking existing keys
- Setting tool-specific permissions

## Network Security

### Don't Expose to Public Internet

Navigator drives a real browser with live web access. Don't expose port 1994 to untrusted networks without authentication.

### Use a Reverse Proxy

For production, put Navigator behind a reverse proxy:

```nginx
# nginx.conf
server {
    listen 443 ssl;
    server navigator.example.com;

    ssl_certificate /etc/ssl/certs/navigator.crt;
    ssl_certificate_key /etc/ssl/private/navigator.key;

    location / {
        proxy_pass http://navigator:1994;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Network Isolation

Run Navigator in an isolated Docker network:

```yaml
networks:
  navigator:
    driver: bridge
    internal: true  # No outbound internet (if not needed)
```

## Browser Security

### Headless Mode

Default (`HEADLESS=true`) — no visible browser window. Recommended for production.

### VNC Mode

Optional remote desktop access (port 1996). Only enable for debugging:

```bash
ENABLE_VNC=1
```

### Browser Profile

The browser profile persists cookies and session data. If you need fresh sessions:

```bash
# Delete the profile volume
docker compose down -v
docker compose up -d
```

## Data Security

### SQLite Database

The `data/navigator.db` file contains:

- Activity logs (7-day retention)
- API keys (hashed)
- Reference ID mappings

### Screenshot Storage

Screenshots may contain sensitive content. Configure storage carefully:

```bash
# File output (default: /app/screenshots)
ENABLE_SCREENSHOT_PATH=1

# URL output (temporary, expires after 1 hour)
ENABLE_SCREENSHOT_DOWNLOAD_LINK=1
```

### Logs

Tool errors are logged to `logs/tool-errors.log`. Sensitive data (passwords, API keys) is automatically redacted.

## Best Practices

1. **Enable authentication** in production (`MCP_ALLOW_UNAUTHENTICATED=0`)
2. **Use a reverse proxy** with TLS for external access
3. **Run in an isolated network** if possible
4. **Monitor activity** via `/console` or `./navigator.js statistics`
5. **Rotate API keys** periodically
6. **Keep updated** — pull the latest code and rebuild regularly
7. **Don't commit secrets** — keep `.env` out of version control

## Next Steps

- [Monitoring](/guides/self-hosting/monitoring) — Health checks and activity logs
