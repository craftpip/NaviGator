# Screenshot Output

Control how screenshots are returned — inline, saved to disk, or as a download URL.

## Output Modes

| Mode | Description | Requires |
|------|-------------|----------|
| `base64` | Inline base64-encoded JPEG | Nothing (default) |
| `file` | Save to disk, return file path | `ENABLE_SCREENSHOT_PATH=/tmp/screenshots` (absolute) |
| `url` | Return a download URL | `ENABLE_SCREENSHOT_DOWNLOAD_LINK=1` |

## 1. Base64 (Default)

The screenshot is returned as a base64-encoded string directly in the response:

```
Captured 1 screenshot(s); 1 succeeded.

### [Example Domain](2)
- Status: Success
- URL: https://example.com/
- Content-Type: image/jpeg

![Example Domain](data:image/jpeg;base64,/9j/...)
```

Pros:
- No configuration needed
- Works everywhere
- Immediate — no file I/O

Cons:
- Large responses for high-quality screenshots
- Can't reference later

## 2. File Output

Save the screenshot to disk and return the path. Returns:

```
Captured 1 screenshot(s); 1 succeeded.

### [Example Domain](2)
- Status: Success
- URL: https://example.com/
- Content-Type: image/jpeg
- File: /tmp/screenshots/screenshot-550e8400-e29b-41d4-a716-446655440000.jpg
```

> **Note:** The `File:` path is display-only — the agent must have access to the same host path where Navigator writes.

### Configuration

Enable in `.env` / Configs ([http://localhost:1994/console/manage](http://localhost:1994/console/manage)):

#### Node.js — local install

```bash
# Always use an absolute path
ENABLE_SCREENSHOT_PATH=/absolute/path/to/navigator/screenshots
# e.g. /home/user/navigator/screenshots
```

#### Docker Compose

```bash
ENABLE_SCREENSHOT_PATH=/tmp/screenshots
```

Add the bind mount (already in the default `docker-compose.yml:101`):

```yaml
volumes:
  - /tmp/screenshots:/app/screenshots
```

Then `docker compose up -d`.

### Storage Location

Screenshots are written to `process.cwd()/screenshots` (`/app/screenshots` in the container). With Docker, that container path is bind-mounted to the host's `/tmp/screenshots` — the `File:` path in the response is that host-visible path. Always use an absolute `ENABLE_SCREENSHOT_PATH`.

### Cleanup

Files are automatically pruned after 1 hour (same TTL as download URLs, up to 200 files) via `pruneStoredScreenshotFiles()` (`src/mcp-server.js:1141`). No manual cron needed — old `screenshot-*.jpg` files are deleted on every new screenshot.

## 3. URL Output

Return a temporary download URL. Returns:

```
Captured 1 screenshot(s); 1 succeeded.

### [Example Domain](2)
- Status: Success
- URL: https://example.com/
- Content-Type: image/jpeg
- Download: http://localhost:1994/download/550e8400-e29b-41d4-a716-446655440000
```

The `Download:` URL is a valid endpoint served by Navigator at `GET /download/<uuid>` (`src/mcp-server.js:3420`) — not a file listing. Each screenshot gets a random UUID, so URLs are unguessable.

### Configuration

Enable in `.env` / Configs ([http://localhost:1994/console/manage](http://localhost:1994/console/manage)):

```bash
ENABLE_SCREENSHOT_DOWNLOAD_LINK=1
```

Then `docker compose up -d`. Without this, `output: "url"` falls back to `base64`.

### Expiration

Download URLs expire after 1 hour. Up to 200 URLs can be active at once.

### Access

Anyone with the URL can download the screenshot. Don't expose this to untrusted networks without authentication.

## Choosing an Output Mode

| Situation | Mode |
|-----------|------|
| Quick visual check | `base64` (default) |
| Saving for later | `file` |
| Sharing with others | `url` |
| Embedding in a page | `base64` or `url` |
| Automated workflows | `file` |

## Tips

- `base64` is the safest default — no configuration, no cleanup
- Use `file` for automated workflows that need to process screenshots
- Use `url` when you need to share screenshots with other services
- Monitor disk usage if using `file` output in production
- Download URLs expire automatically — no manual cleanup needed

## Next Steps

- [DevTools Overview](/guides/devtools/overview) — Interact with pages
- [Self-Hosting Overview](/guides/self-hosting/overview) — Deploy Navigator
