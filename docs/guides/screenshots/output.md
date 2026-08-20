# Output Options

Control how screenshots are returned — inline, saved to disk, or as a download URL.

## Output Modes

| Mode | Description | Requires |
|------|-------------|----------|
| `base64` | Inline base64-encoded JPEG | Nothing (default) |
| `file` | Save to disk, return file path | `ENABLE_SCREENSHOT_PATH=1` |
| `url` | Return a download URL | `ENABLE_SCREENSHOT_DOWNLOAD_LINK=1` |

## Base64 (Default)

The screenshot is returned as a base64-encoded string directly in the response:

```json
{
  "urls": ["https://example.com"],
  "output": "base64"
}
```

Pros:
- No configuration needed
- Works everywhere
- Immediate — no file I/O

Cons:
- Large responses for high-quality screenshots
- Can't reference later

## File Output

Save the screenshot to disk and return the path:

```json
{
  "urls": ["https://example.com"],
  "output": "file"
}
```

Returns:

```
Screenshot saved: /app/screenshots/abc123.jpg
```

### Configuration

```bash
# In .env
ENABLE_SCREENSHOT_PATH=1
```

### Storage Location

Screenshots are saved to the `screenshots/` directory. In Docker, this is mapped to `/tmp/screenshots` on the host.

### Cleanup

Files are not automatically cleaned up. You can:
- Set up a cron job to delete old files
- Use the `/console` to view and manage screenshots
- Mount a temporary volume

## URL Output

Return a temporary download URL:

```json
{
  "urls": ["https://example.com"],
  "output": "url"
}
```

Returns:

```
Screenshot: http://localhost:3000/download/abc123
```

### Configuration

```bash
# In .env
ENABLE_SCREENSHOT_DOWNLOAD_LINK=1
```

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
