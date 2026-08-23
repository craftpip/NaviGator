# Custom API

Plug your own extractor into Navigator.

If you already have an extraction flow or custom code, you don't need to rewrite it — wrap it as a Custom API post-processor and get Navigator's web search, domain hints, extraction pipeline, and console ecosystem on top. Your code receives the page HTML (or text/screenshot) as a request, returns markdown, and Navigator handles the rest.

## Purpose

- **Reuse existing code** — if you have already created an extractor of your own, a cleaning pipeline, or an LLM chain tailored to your pages, just expose it as an HTTP endpoint and plug it in.
- **Keep Navigator's ecosystem** — web search with circuit breakers, `web_fetch` caching, domain hints (including interactive flows), link refs, and the console's testing UI all stay in front of your extractor.
- **Plug-and-play** — no changes to Navigator core; just add a `kind: "api"` entry in `POST_PROCESSOR_MODELS` and select it as a post-processor in any domain hint.

## How It Works

Navigator sends the extractor output (HTML/text/screenshot) to your API and reads the response back as markdown:

1. Page → Extractor (`html` / `screenshot` / `text`)
2. Extractor output → `POST {baseUrl}{path}` with your `body` template (`{{input}}` is replaced with the page HTML/text, JSON-encoded)
3. Your API → `{ "result": "<markdown>" }` (or any shape)
4. Navigator extracts `outputField` (dot-path, default `text`) as `outputType` (`json` or `text`) and returns it as the fetch result. Falls back to the extractor output on failure.

Configure it in [Post-processors → Overview](/guides/extraction/ai-extractors) via `POST_PROCESSOR_MODELS` with `kind: "api"`:

```json
{
  "kind": "api",
  "baseUrl": "http://localhost:8000",
  "body": {"html": "{{input}}", "task": "extract"},
  "outputField": "result",
  "outputType": "text"
}
```

`body` controls the request payload, `outputField` picks the field in the JSON response, and `outputType` sets how it is parsed — any HTTP endpoint that follows this contract can be used.

## Detailed Endpoint Examples

### Headers & Auth

Pass API keys or custom headers via `headers` (merged with `Content-Type: application/json`):

```json
{
  "id": "my_extractor",
  "kind": "api",
  "baseUrl": "https://api.example.com",
  "headers": {
    "Authorization": "Bearer sk-...",
    "X-Custom": "my-value"
  },
  "body": {"html": "{{input}}"},
  "outputField": "markdown"
}
```

Navigator sends `Authorization: Bearer sk-...` with every request. Rotate the key in the console without restarting.

### Custom Path & Method

Append a path to `baseUrl` and override the HTTP method:

```json
{
  "id": "my_api_get",
  "kind": "api",
  "baseUrl": "https://api.example.com",
  "path": "/v2/extract",
  "method": "POST",
  "body": {"content": "{{input}}", "mode": "markdown"},
  "outputField": "data.markdown"
}
```

- `path` is appended to `baseUrl` (`https://api.example.com` + `/v2/extract`)
- `method` defaults to `POST` — set to `GET`, `PUT`, etc. if your endpoint requires it
- `{{input}}` is JSON-encoded (quotes and escapes handled) — use it inside any string field

### Nested outputField (dot-path)

Pick a nested field from the JSON response via dot notation:

```json
// Response: { "status": "ok", "data": { "result": { "markdown": "# Hello" } } }
{
  "id": "nested_api",
  "kind": "api",
  "baseUrl": "http://localhost:8000",
  "body": {"html": "{{input}}"},
  "outputField": "data.result.markdown"
}
```

Default `outputField` is `text`. If the field is missing or empty, Navigator falls back to the extractor output and logs a warning.

### Raw Text Response

If your endpoint returns plain markdown (not JSON), set `outputType: "text"` to return the raw body:

```json
// Response body: "# Hello\n\nWorld" (text/plain)
{
  "id": "text_api",
  "kind": "api",
  "baseUrl": "http://localhost:8000",
  "body": "{{input}}",
  "outputType": "text"
}
```

- `outputType: "json"` (default) — parse JSON and extract `outputField`
- `outputType: "text"` — return the raw response body as-is

> **Tip:** Test your endpoint with `curl` first, then paste the working `baseUrl`/`body`/`outputField` into the console at [http://localhost:1994/console/manage?focus=POST_PROCESSOR_MODELS](http://localhost:1994/console/manage?focus=POST_PROCESSOR_MODELS) and use the domain hint **Test** panel to verify the markdown.
