# Post-processors (AI)

Post-processors let you send page HTML or a screenshot to **any AI endpoint** — local Ollama or any ChatGPT-compatible API — and get clean markdown back. Any model that speaks OpenAI `chat/completions` works.

Configure them in the console:

> [Open Settings → POST_PROCESSOR_MODELS](http://localhost:1994/console/manage?focus=POST_PROCESSOR_MODELS){target="_blank"}

If the model fails or isn't configured, Navigator falls back to `html_to_markdown`.

## Overview

```
Extractor ──┬── HTML ──┐
            └── Image ─┤
                       ↓
                Post-processor
                       │
            ┌──────────┴──────────┐
            │ Processor           │
            ├─ Ollama ────────────┤
            └─ MinerU ────────────┘
                       │
                       ↓
                 Output (markdown) ──→ User
```

The extractor provides **HTML or an image**, the post-processor forwards it to the processor — either **Ollama** or **MinerU** — and returns markdown.

## Configuring Post-processors

Add models to `POST_PROCESSOR_MODELS` in your `.env` or use the console link above. Each entry is a JSON object:

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

MinerU is an open-source document parsing engine that turns PDFs, images, and Office docs into LLM-ready markdown and JSON. It runs in its own container with GPU support for fast, local extraction.

Provided by Navigator — see the [MinerU page](/guides/extraction/mineru) to set it up. Sidecar container `navigator-mineru`, built on [MinerU](https://github.com/opendatalab/MinerU).

### Custom API

Any API can be used as a post-processor — customize how the request is built and how the response is parsed. The extractor's output is sent to the post-processor, and the post-processor's response is sent back to the agent.

```json
{
  "kind": "api",
  "baseUrl": "http://localhost:8000",
  "body": {"html": "{{html}}", "task": "extract"},
  "outputField": "result",
  "outputType": "text"
}
```

`body` controls the request payload (`{{html}}` is replaced with the page HTML), `outputField` picks the field in the response, and `outputType` sets how it is parsed — any API that follows this can be used.

## Using Post-processors

Select the model in the web console — **Extraction Methods** dropdown when testing domain hints, or set `default.postProcessor` in your domain hint (`domain: "*"` for the default, or per-site).

## Fallback Behavior

If the post-processor is unreachable or fails, the extractor's output is passed directly to the agent — whatever the extractor returned is what you get.

- Connection error → fallback to extractor output
- Timeout → fallback to extractor output
- Empty response → fallback to extractor output
- Model not configured → fallback to extractor output

You'll see a warning in the server logs, but the fetch still succeeds.

## Tips

- **Start without AI** — the default `readability_to_markdown` works well for most pages
- **Use AI for complex pages** — SPAs, heavily styled content, non-standard layouts
- **Monitor logs** — silent fallbacks are logged, check `logs/tool-errors.log`
- **GPU helps** — MinerU with GPU is significantly faster than CPU

## Next Steps

- [Screenshot Overview](/guides/screenshots/overview) — Capture pages visually
- [Self-Hosting Overview](/guides/self-hosting/overview) — Deploy Navigator
