# Network & Console

Monitor what's happening behind the scenes — network requests, console output, and page errors. Our network/console tools aggregate into rolling buffers — not per-request CDP events.

## Network.getRequests

Aggregated view of the last 200 requests (newest first) with our `method`, `url`, `status`, `resourceType`, `ok`/`failed`/`fromCache` fields.

**Request**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `targetId` | `string` | — | Target id |
| `filter` | `string` | — | Substring to match against URL |
| `failedOnly` | `boolean` | `false` | Only failed requests |
| `status` | `number` | — | Exact HTTP status to filter |
| `limit` | `number` | `25` | Max requests to return (1–200) |


Response:

```json
{
  "targetId": "ABC",
  "url": "https://example.com/",
  "total": 42,
  "shown": 1,
  "failed": 1,
  "requests": [
    {
      "method": "GET",
      "url": "https://api.example.com/data",
      "status": 404,
      "resourceType": "xhr",
      "ok": false,
      "failed": true,
      "fromCache": false
    }
  ]
}
```

Results are `entries.slice(-limit).reverse()` — newest first, oldest dropped when over 200.

## Runtime.getConsoleMessages

Last 100 console/page-error/request-failure messages — our buffer, not CDP `Console.messageAdded`.

**Request**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `targetId` | `string` | — | Target id |
| `limit` | `number` | `30` | Max messages (1–100) |


Response:

```json
{
  "targetId": "ABC",
  "count": 12,
  "messages": [
    { "type": "log", "text": "User clicked button", "timestamp": 1710000000000 },
    { "type": "error", "text": "Failed to load resource: 404", "timestamp": 1710000000000 }
  ]
}
```

`count` is total buffered, `messages` is `slice(-limit)`.

## Runtime.evaluate

Run JavaScript in the page. We serialize the result safely — objects/arrays capped at 25 entries and depth 4, with `[Circular]` and `[MaxDepth]` markers; Elements become our descriptor.

**Request**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `targetId` | `string` | — | Target id |
| `expression` | `string` | — | JavaScript expression to evaluate |


Response:

```json
{
  "targetId": "ABC",
  "result": "Example Domain"
}
```

For an element: `Runtime.evaluate({ targetId: "ABC", expression: "document.querySelector('h1')" })` returns:

```json
{
  "targetId": "ABC",
  "result": {
    "tagName": "h1",
    "text": "Example Domain",
    "value": "",
    "selector": "html > body > div > h1",
    "xpath": "/html[1]/body[1]/div[1]/h1[1]",
    "attributes": {},
    "rect": { "x": 0, "y": 0, "width": 100, "height": 20 }
  }
}
```

Standard CDP `Runtime.evaluate` returns `{ result: { type, value, objectId } }` — we return the serialized `result` directly.

## Example: Debugging a Failed Request





## Buffer Limits

| Buffer | Max | Behavior |
|--------|-----|----------|
| Network requests | 200 | Rolling, oldest dropped |
| Console messages | 100 | Rolling, oldest dropped |

## Tips

- **Check network first** when a page isn't loading — `failedOnly: true` finds 404s fast
- **Use `filter`** to focus on `api` or `cdn` hosts
- **Console errors** reveal JS issues not visible in DOM
- **Combine with `DOM.getDocument`** — see what the page shows, then check what it fetched

## Next Steps

- [Self-Hosting Overview](/guides/self-hosting/overview) — Deploy Navigator
- [Monitoring](/guides/self-hosting/monitoring) — Server health and activity
