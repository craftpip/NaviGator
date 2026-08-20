# Docker Configuration

Navigator runs as a single Docker container with everything included — Chromium, the MCP server, and the web console.

## docker-compose.yml

The compose file is the source of truth. Here are the key sections:

### Basic Setup

```yaml
services:
  navigator:
    build: .
    ports:
      - "3000:3000"    # MCP server + web console
      - "7900:7900"    # noVNC (optional)
    volumes:
      - ./:/app        # Source code (bind mount)
      - chrome_data:/data/chrome  # Persistent browser profile
    environment:
      - NODE_ENV=production
    shm_size: "2g"     # Required for Chromium
    deploy:
      resources:
        limits:
          cpus: "4"
          memory: 4G
```

### Ports

| Port | Service | Required |
|------|---------|----------|
| 3000 | MCP Server + Web Console | Yes |
| 7900 | noVNC Remote Desktop | Optional |

### Volumes

| Volume | Purpose |
|--------|---------|
| `./:/app` | Source code (bind mount for development) |
| `chrome_data:/data/chrome` | Persistent browser profile |
| `./screenshots:/app/screenshots` | Screenshot storage (optional) |

### Shared Memory

Chromium needs shared memory. The `shm_size: "2g"` setting is required for stable browser operation.

### Resource Limits

```yaml
deploy:
  resources:
    limits:
      cpus: "4"       # Max CPU cores
      memory: 4G      # Max memory
    reservations:
      cpus: "2"       # Guaranteed CPU
      memory: 2G      # Guaranteed memory
```

## Starting

```bash
# Build and start
docker compose up --build -d

# View logs
docker compose logs -f navigator

# Stop
docker compose down

# Restart
docker compose restart navigator
```

## Updating

```bash
# Pull latest code
git pull

# Rebuild and restart
docker compose build
docker compose down
docker compose up -d
```

::: warning
The container runs `npm install --omit=dev` on every start, which prunes dev dependencies from the bind-mounted `node_modules`. After a restart, reinstall dev deps if you need them:

```bash
docker compose exec navigator npm install --include=dev
```
:::

## Environment File

Copy `.env.example` to `.env` and edit as needed:

```bash
cp .env.example .env
```

See [Environment Variables](/guides/self-hosting/env-vars) for all options.

## Networking

### Container-to-Internet

Navigator needs outbound internet for search engines. If you're behind a firewall:

```bash
# Test from inside the container
docker compose exec navigator curl -s https://duckduckgo.com
```

If this fails, check your Docker network configuration and iptables rules.

### Container-to-Host

To access services on the host machine from inside the container:

```bash
# Use host.docker.internal (Docker Desktop)
# Or use the host's IP address
```

## Troubleshooting

**Container won't start:**
```bash
docker compose logs navigator
```

**Browser fails to launch:**
```bash
docker compose exec navigator ps aux | grep chrome
# Check if Chromium is running
```

**Out of memory:**
```bash
docker stats navigator
# Monitor memory usage
# Increase shm_size or memory limit
```

**Port conflicts:**
Change `MCP_API_PORT` in `.env` and update the port mapping in `docker-compose.yml`.

## Next Steps

- [Environment Variables](/guides/self-hosting/env-vars) — All configuration options
- [Security](/guides/self-hosting/security) — API keys and authentication
