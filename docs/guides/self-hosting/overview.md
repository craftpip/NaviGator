# Self-Hosting Overview

Deploy Navigator on your own infrastructure. One Docker container gives your team a private, self-hosted browser for AI agents.

## Why Self-Host?

- **Privacy** — All searches, pages, and screenshots stay on your network
- **Control** — Configure engines, timeouts, and extraction to your needs
- **Reliability** — No dependency on third-party APIs
- **Security** — API key authentication, network isolation

## Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 2 cores | 4 cores |
| Memory | 2 GB | 4 GB |
| Disk | 10 GB | 50 GB |
| Network | Outbound internet | Low-latency to target sites |

## Deployment Options

### Docker (Recommended)

The simplest way to run Navigator:

```bash
git clone https://github.com/craftpip/navigator.git
cd navigator
cp .env.example .env
docker compose up --build -d
```

See [Docker Configuration](/guides/self-hosting/docker) for details.

### Docker Compose with GPU

For AI extractors (MinerU-HTML):

```yaml
services:
  navigator-mineru:
    image: navigator-mineru:latest
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

### Kubernetes

For production deployments at scale, see the Kubernetes examples in the repository.

## Architecture

```
┌─────────────────────────────────────────────┐
│                Navigator                    │
├─────────────────────────────────────────────┤
│  MCP Server (port 1994)                     │
│  ├── web_search  → Search engines           │
│  ├── web_fetch   → Browser + extraction     │
│  ├── screenshots → Browser rendering        │
│  └── DevTools    → CDP browser control      │
├─────────────────────────────────────────────┤
│  Browser (Chromium/CloakBrowser)            │
│  ├── Headless mode (default)                │
│  └── VNC mode (optional)                    │
├─────────────────────────────────────────────┤
│  SQLite (data/navigator.db)                 │
│  ├── Activity logs                          │
│  ├── API keys                               │
│  └── Reference IDs                          │
└─────────────────────────────────────────────┘
```

## What's Included

| Component | Purpose |
|-----------|---------|
| MCP Server | Tool dispatch, HTTP endpoints, caching |
| Browser | Chromium with anti-bot fingerprinting |
| Search Engine Router | 12 routes across 5 engines |
| Extraction Pipeline | Readability, domain hints, AI models |
| Web Console | Management UI at `/console` |
| SQLite DB | Activity logs, API keys, reference memory |
| Navigator CLI | Host-side monitoring (`./navigator.js`) |

## Quick Health Check

```bash
curl -s http://localhost:1994/health
```

Returns:

```json
{
  "ok": true,
  "backend": "cloakbrowser",
  "browserConnected": true,
  "pageLimiter": { "maxConcurrentPageOps": 30, "inUse": 0 }
}
```

## Next Steps

- [Docker Configuration](/guides/self-hosting/docker) — docker-compose.yml explained
- [Environment Variables](/guides/self-hosting/env-vars) — All configuration options
- [Security](/guides/self-hosting/security) — API keys and authentication
- [Monitoring](/guides/self-hosting/monitoring) — Health checks and activity logs
