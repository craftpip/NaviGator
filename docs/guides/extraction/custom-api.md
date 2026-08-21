# Custom API

Use any API as a post-processor — customize how the request is built and how the response is parsed.

Configure it in [Post-processors → Overview](/guides/extraction/ai-extractors) via `POST_PROCESSOR_MODELS` with `kind: "api"`:

```json
{
  "kind": "api",
  "baseUrl": "http://localhost:8000",
  "body": {"html": "{{html}}", "task": "extract"},
  "outputField": "result",
  "outputType": "text"
}
```

`body` controls the request payload (`{{html}}` is replaced with the page HTML), `outputField` picks the field in the response, and `outputType` sets how it is parsed.

> Detailed examples for custom endpoints will be documented here.
