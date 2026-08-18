# Network & Console

Monitor what's happening behind the scenes — network requests, console output, and page errors.

## Network Requests

View all network requests the page has made:

```json
{
  "targetId": "ABC"
}
```

Returns the last 200 requests (newest first):

```
GET https://api.example.com/data (200) - 145ms - fetch
POST https://analytics.example.com/event (204) - 23ms - xhr
GET https://cdn.example.com/style.css (304) - 5ms - stylesheet
Failed: GET https://broken.example.com/image.png (404) - image
```

### Filter by URL

```json
{
  "targetId": "ABC",
  "filter": "api.example.com"
}
```

### Show Only Failures

```json
{
  "targetId": "ABC",
  "failedOnly": true
}
```

### Filter by Status Code

```json
{
  "targetId": "ABC",
  "status": 404
}
```

### Limit Results

```json
{
  "targetId": "ABC",
  "limit": 10
}
```

## Console Messages

Read captured console output, page errors, and request failures:

```json
{
  "targetId": "ABC"
}
```

Returns the last 30 messages:

```
log: "User clicked button" (09:23:45)
warn: "Deprecated API called" (09:23:42)
error: "Failed to load resource" (09:23:40)
info: "Page loaded in 1.2s" (09:23:38)
```

### Message Types

| Type | Description |
|------|-------------|
| `log` | Regular console.log output |
| `warn` | Console warnings |
| `error` | Errors and failed requests |
| `info` | Console info messages |

## Example: Debugging a Failed Request

```json
// 1. Open the page
Target.createTarget({ "url": "https://example.com" })

// 2. Check for failed requests
Network.getRequests({ "targetId": "ABC", "failedOnly: true })

// 3. See what's in the console
Runtime.getConsoleMessages({ "targetId": "ABC" })

// 4. Run custom diagnostics
Runtime.evaluate({
  "targetId": "ABC",
  "expression": "JSON.stringify({ title: document.title, links: document.querySelectorAll('a').length })"
})
```

## Example: Monitoring API Calls

```json
// 1. Open a page with an API
Target.createTarget({ "url": "https://example.com/dashboard" })

// 2. Wait a moment for API calls
Runtime.evaluate({ "targetId": "ABC", "expression": "await new Promise(r => setTimeout(r, 2000))" })

// 3. Check what API calls were made
Network.getRequests({ "targetId": "ABC", "filter": "api" })
```

## Buffer Limits

| Buffer | Max Size | Behavior |
|--------|----------|----------|
| Network requests | 200 | Rolling buffer, oldest dropped |
| Console messages | 100 | Rolling buffer, oldest dropped |

## Tips

- **Check network first** when a page isn't loading — failed requests are often the cause
- **Use `failedOnly: true`** to quickly find problems
- **Console errors** often reveal JavaScript issues that aren't visible on the page
- **Use `filter`** to focus on specific API endpoints
- **Combine with DOM inspection** — see what the page shows, then check what it fetched

## Next Steps

- [Self-Hosting Overview](/guides/self-hosting/overview) — Deploy Navigator
- [Monitoring](/guides/self-hosting/monitoring) — Server health and activity
