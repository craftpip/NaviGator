# AI Extractors

Use AI models to extract clean content from complex pages. Navigator can send page HTML to an LLM, which returns structured markdown.

## How It Works

1. Navigator opens the page in a browser
2. The full HTML is sent to an AI model
3. The model extracts and formats the content
4. You get clean markdown output

If the model fails or isn't configured, Navigator falls back to `html_to_markdown`.

## Configuring AI Models

Add models to `POST_PROCESSOR_MODELS` in your `.env`:

```bash
POST_PROCESSOR_MODELS=[{"id":"reader_lm","label":"reader-lm","model":"jinaai/reader-lm-0.5b","baseUrl":"http://host.docker.internal:8000/v1"}]
```

### Model Entry Fields

| Field | Description |
|-------|-------------|
| `id` | Unique identifier for the model |
| `label` | Display name in the web console |
| `model` | Model name (for OpenAI-compatible APIs) |
| `baseUrl` | API endpoint URL |
| `kind` | `chat` (default), `mineru`, or `api` |
| `timeoutMs` | Request timeout (optional) |
| `maxInputChars` | Max HTML to send (optional) |
| `maxTokens` | Max output tokens (optional) |

## Model Kinds

### Chat (OpenAI-compatible)

POST to `<baseUrl>/chat/completions`:

```json
{
  "model": "jinaai/reader-lm-0.5b",
  "messages": [{"role": "user", "content": "<html>...</html>"}]
}
```

Works with reader-lm, GPT-4, Claude, or any OpenAI-compatible API.

### MinerU

POST `{html}` to `<baseUrl>/extract`:

```json
{
  "html": "<html>...</html>"
}
```

Uses the MinerU-HTML GPU sidecar for extraction. See [MinerU Sidecar](/guides/extraction/ai-extractors#mineru-sidecar) below.

### Custom API

Custom endpoint with configurable body and output field:

```json
{
  "kind": "api",
  "baseUrl": "http://localhost:8000",
  "body": {"html": "{{html}}", "task": "extract"},
  "outputField": "result",
  "outputType": "text"
}
```

## Using AI Extractors

In the web console, select the model from the Extractor dropdown when testing domain hints.

Via MCP, use the model's `id` as the format:

```json
{
  "urls": ["https://example.com/complex-page"],
  "format": "reader_lm"
}
```

## MinerU Sidecar

The MinerU-HTML sidecar is a separate Docker container with GPU acceleration:

```yaml
# In docker-compose.yml
navigator-mineru:
  image: navigator-mineru:latest
  ports:
    - "8000:8000"
  deploy:
    resources:
      reservations:
        devices:
          - driver: nvidia
            count: 1
            capabilities: [gpu]
```

The pipeline:
1. Simplify HTML (strip noise)
2. Build extraction prompt
3. LLM classification
4. Extract main content
5. Convert to markdown

For large pages (300KB+), it falls back to trafilatura automatically.

## Fallback Behavior

If the AI model fails:
- Connection error → silent fallback to `html_to_markdown`
- Timeout → silent fallback
- Empty response → silent fallback
- Model not configured → silent fallback

You'll see a warning in the server logs, but the fetch still succeeds.

## Performance

| Page Size | Model | Time |
|-----------|-------|------|
| 100KB Wikipedia | reader-lm-0.5b | ~4s |
| 100KB Wikipedia | MinerU-HTML | ~2s |
| 300KB+ | MinerU-HTML | Falls back to trafilatura (~0.6s) |

## Tips

- **Start without AI** — the default `readability_to_markdown` works well for most pages
- **Use AI for complex pages** — SPAs, heavily styled content, non-standard layouts
- **Monitor logs** — silent fallbacks are logged, check `logs/tool-errors.log`
- **GPU helps** — MinerU with GPU is significantly faster than CPU

## Next Steps

- [Screenshot Overview](/guides/screenshots/overview) — Capture pages visually
- [Self-Hosting Overview](/guides/self-hosting/overview) — Deploy Navigator
