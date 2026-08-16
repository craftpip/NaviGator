# MinerU-HTML v1.1 Hunyuan 0.5B Compact as an "AI Model" Extractor

## Plan Status

**Status: DRAFT** — server + console integration implemented and tested; GPU container built and smoke-tested on this box's GTX 1650. Remaining: point `READER_LM_MODELS` at the sidecar.

### Checklist

- [x] 1. Build the standalone **GPU container** (`navigator-mineru` service): vLLM backend + FastAPI wrapper, NVIDIA runtime, model weights baked into the image, port `8001`. Image `navigator-mineru:latest` built and running (`docker run --gpus all -p 8001:8001`); `POST /extract` returns clean markdown (nav/footer stripped), `/health` shows `backend=vllm`, KV cache 13,424 tokens.
- [ ] 2. Verify container on the GPU host: `curl localhost:8001/extract` with a nav-heavy HTML → clean markdown, GPU used (`nvidia-smi` shows process). Then point this VM's `READER_LM_MODELS` mineru entry at the GPU host's `baseUrl` (`http://<gpu-host>:8000`; the `http://navigator-mineru:8000` compose-DNS name only works when both are on the same compose network).
- [x] 3. Add `kind` field to `READER_LM_MODELS` entries in `src/config.js` (`parseAiModelKind`, `AI_MODEL_KINDS`) + `src/config-schema.js` (enum + license note). `config-manager.js` unchanged (`applies: "recreate"`).
- [x] 4. Extended `src/reader-lm.js` — `extractWithMineru` POSTs `{html}` to `<baseUrl>/extract`, `MINERU_MAX_INPUT_CHARS` safety cap, concurrency gate reused.
- [x] 5. `src/search.js`: dispatch centralized in `extractHtmlWithAiModel` (`entry.kind === "mineru" ? mineru : chat`); `search.js` calls it unchanged.
- [x] 6. `src/mcp-server.js`: `usesAiExtractor` covers any configured AI model id (both kinds) — cache bypass already in place, verified.
- [x] 7. Console (`src/web-console/src/main.jsx`): `aiModelOptionLabel`/`aiModelKindLabel`/`aiModelIdLabel` — dropdowns label reader-lm vs MinerU-HTML, block-editor warning names the model, prop chain passes entries (`aiModels`) not ids.
- [x] 8. Tests: `tests/reader-lm.test.js` — dispatch (chat/mineru), fallback-on-error, empty-content, safety cap, helper units. 10 tests, all pass.
- [x] 9. Docs: `AGENTS.md` (extractor entry, env var table, license note) + `README.md` env table.
- [x] 10. Restart server, verify schema + config parse. (console rebuilt, container restarted, health OK; live mineru flow blocked on item 1)

## Goal

Evaluate and, if viable, make **MinerU-HTML v1.1** (`opendatalab/MinerU-HTML-v1.1-hunyuan0.5B-compact`) available as
an *extractor* in `web_fetch`, side by side with the existing reader-lm AI extractor.

**MinerU-HTML is NOT a drop-in reader-lm replacement.** Its workflow differs fundamentally:

| | reader-lm-0.5b | MinerU-HTML v1.1 |
|---|---|---|
| Input | raw HTML | raw HTML |
| Output | clean **Markdown**, direct | classification → main-content HTML → **Markdown/JSON/TXT** via MinerU-Webkit |
| Model call | one OpenAI-compatible `/chat/completions` POST | LLM classifies each `_item_id`'d element as `main`/`other` (compact or JSON format) |
| Pipeline | none (pure model) | multi-stage Python: `simplify_html` → `build_prompt` → inference → `parse_result` → `extract_main_html` → `convert2content` |
| Context | 8192 default | 256k native (plan ~32k window) |

This plan documents what the tool does, why it behaves differently, and the integration options.
Decision D2 below is the recommended path.

## Research Summary (2026-08-16)

### The model

- **HF:** `opendatalab/MinerU-HTML-v1.1-hunyuan0.5B-compact` — a **Tencent Hunyuan 0.5B** derivative (not Qwen, not the v1.0 0.8B Qwen3). Supports **256k context**, "compact" output format for local inference.
- **License:** Tencent Hunyuan Community License (model). Repo code is Apache-2.0. Note the difference vs reader-lm's CC-BY-NC.
- **v1.1** released 2026-03-19, integrated with MinerU-Webkit.
- **arxiv:** 2511.23119, 2511.16397.
- **Repo:** `github.com/opendatalab/MinerU-HTML` (internal name "Dripper" — `from dripper.api import Dripper`).

### What the pipeline actually does

1. `simplify_html` — strips scripts/styles, assigns `_item_id` to every element.
2. `build_prompt` — wraps the simplified HTML in a classification prompt (`short_compact` for local compact inference, `v2` JSON for the OpenAI backend).
3. LLM inference — returns element ids classified `main`/`other`.
4. `parse_result` — parse compact (`1main2other…`) or JSON output.
5. `extract_main_html` — rebuilds the main-content HTML subset from the **original** HTML.
6. `convert2content` — converts that main HTML → Markdown/JSON/TXT via MinerU-Webkit.
7. Fallback — trafilatura / bypass / empty result when the LLM fails or classifies nothing.

Result object: `result[0].main_html` (HF card v1.1) / `result[0].output_data.main_content` (GitHub README). Output is **main-content HTML, not markdown**, until `convert2content` runs.

### Backends (Python)

- **vLLM** (GPU, recommended — the chosen backend, see D2).
- **Transformers** (local, CPU-capable — fallback only).
- **OpenAI API** (`MinerUHTML_OpenAI(base_url, sk, model)` — replaces only the LLM call; pipeline still runs in Python).

### Serving reality

- The v1.1 repo has **no shipped REST/HTTP server** (v1.0's `app/api_server.py` is gone). A thin FastAPI HTTP wrapper must be written.
- **No GGUF** confirmed for the v1.1 hunyuan0.5B model (only `mradermacher/MinerU-HTML-GGUF` for v1.0 0.8B Qwen3). So Ollama serving of THIS model is not ready-made.
- This box has an **NVIDIA GPU** and the Docker **nvidia runtime is installed** — the model runs in a GPU container via vLLM (fast), not on CPU.

## Integration Decision (D1–D3)

**D1 — Ship it as a sidecar HTTP service, not a JS reimplementation.**
The pipeline (simplify → prompt → inference → parse → extract → convert) is tuned Python with model-specific prompts. Reimplementing in JS duplicates fragile logic and the model's prompt contract. Rejected: full JS reimplementation.

**D2 — Standalone GPU container, HTTP in/out (RECOMMENDED, user-directed).**
- A **separate Docker container** (`navigator-mineru`), NOT part of the navigator container, runs the whole `mineru_html` pipeline (vLLM backend on the NVIDIA GPU) wrapped in a tiny FastAPI server.
- Exposed on port `8001` (host network). Contract: `POST /extract` `{html}` → `{text}` (markdown via `convert2content`).
- Navigator (unchanged container) calls it over HTTP at `http://10.69.1.164:8001/extract` — Node stays pure, Python owns the pipeline. GPU makes vLLM fast, so concurrency >1 is fine.
- Navigator gets a **`kind` field** on `READER_LM_MODELS` entries: default `"chat"` (existing reader-lm path) vs `"mineru"` (POST to the container). No new env var shape needed — one model list, two client flavors.
- Add the model id to the extractor dropdowns exactly like reader-lm (the dropdown is already "Extractor", AI ids already appear).
- Cache: AI-model fetches already bypass the web_fetch cache (per-call re-run). Keep that. The container result is per-request anyway.

**D3 — Not recommended now: point the OpenAI backend at Ollama.**
`MinerUHTML_OpenAI(base_url=…/v1)` needs the model served at that endpoint. No v1.1 GGUF exists, so Ollama can't host this model today. Also, the Python pipeline is still required regardless — the OpenAI backend only swaps the LLM call. Revisit only if a v1.1 GGUF appears.

## Config / Code Changes

| File | Change |
|---|---|
| `src/config.js` | Parse optional `kind` (`"chat"` default / `"mineru"`) per `READER_LM_MODELS` entry |
| `src/config-schema.js` | Document `kind` on the model entry schema |
| `src/config-manager.js` | Pass `kind` through to runtime config |
| `src/reader-lm.js` (or new `src/mineru.js`) | Branch: `chat` → existing `/chat/completions`; `mineru` → POST `{html}` to `${baseUrl}/extract`, timeout from `READER_LM_TIMEOUT_MS` |
| `src/search.js` | `extractHtmlWithAiModel` (line 1038) + block path (line 812) resolve the model entry and dispatch on `kind`; fallback to `html_to_markdown` on error stays |
| `src/mcp-server.js` | Cache bypass for AI models already handles both; verify `getAiModels` (line 32) passthrough of `kind` |
| `src/web-console/src/main.jsx` | AI-model dropdown options unchanged (ids come from config); optionally label kind |
| `.env` | Example entry: `{"id":"mineru_lm","label":"MinerU-HTML v1.1","model":"MinerU-HTML-v1.1-hunyuan0.5B-compact","kind":"mineru","baseUrl":"http://10.69.1.164:8001"}` |
| `docker-compose.yml` | No new vars needed for navigator (kind rides inside `READER_LM_MODELS` JSON); the `navigator-mineru` container is a **separate compose service** (see below) |

## Standalone GPU Container (`navigator-mineru`)

Deliberately separate from the navigator container: GPU runtime, its own image, its own lifecycle. If it's down,
navigator's AI extractor falls back to `html_to_markdown` (existing fallback semantics) — navigator is never blocked.

**Dockerfile** (lives in its own dir, `/www1/navigator/docker/navigator-mineru/`):

```dockerfile
FROM python:3.11-slim + nvidia runtime
WORKDIR /app
RUN pip install "mineru_html[vllm]==1.1.2"          # installs mineru_html + vllm==0.11.1 + webkit
# Model weights baked into the image (decision: BAKE IN). ~1.1GB BF16, fast cold start.
RUN huggingface-cli download opendatalab/MinerU-HTML-v1.1-hunyuan0.5B-compact
COPY sidecar.py /app/sidecar.py
EXPOSE 8001
CMD ["uvicorn", "sidecar:app", "--host", "0.0.0.0", "--port", "8001"]
```

**compose addition** (same `docker-compose.yml`, new top-level service — all runtime knobs exposed as
`MINERU_*` env vars, see the compose file and `.env.example`):

```yaml
  navigator-mineru:
    build: ./docker/navigator-mineru
    runtime: nvidia
    environment:
      - NVIDIA_VISIBLE_DEVICES=all
      - MINERU_BACKEND=vllm
      - MINERU_CONTEXT_WINDOW=13312
      - MINERU_GPU_MEM_UTIL=0.95
    ports:
      - "8001:8001"
    restart: unless-stopped
```

**Sidecar** (`docker/navigator-mineru/sidecar.py`) — **verified against v1.1 source** (api.py, base.py, implementations/vllm_api.py, process/convert2content.py). The shipped version is fully env-configurable (every knob from the compose service block); this sketch shows the core wiring:

```python
# thin FastAPI wrapper around mineru_html v1.1 (vLLM backend, GPU)
from fastapi import FastAPI, Request
from mineru_html import MinerUHTML, MinerUHTMLConfig

config = MinerUHTMLConfig(
    use_fall_back='trafilatura',
    prompt_version='short_compact',   # v1.1 local format
    response_format='compact',        # v1.1 local format
    output_format='plain_md',         # see "output formats" below
    early_load=True,
)
extractor = MinerUHTML(model_path='/app/model', config=config)

app = FastAPI()

@app.post("/extract")
async def extract(req: Request):
    body = await req.json()
    result = extractor.process(body["html"])     # full pipeline runs inside process()
    return {"text": result[0].output_data.main_content}  # already markdown!
```

**Verified API facts (no more unknowns):**

1. **Entry point** — `mineru_html` exports `MinerUHTML` (vLLM), `MinerUHTML_Transformers`, `MinerUHTML_OpenAI`, all with `extractor.process(html_or_list)` → `List[MinerUHTMLCase]`. The "Dripper" name is legacy (the old `dripper.api` import); v1.1 is `mineru_html`. Confirmed in `mineru_html/__init__.py`.
2. **Result field** — `result[0].main_html` is a **property** returning `output_data.main_html` (main-content HTML). But `process()` already runs `convert2content` as its **final internal step** (`MinerUHTMLConfig.output_format`, default `'mm_md'`), so `result[0].output_data.main_content` is **already the converted markdown** — no separate converter call needed in the sidecar. Confirmed in `api.py` (pipeline order) + `base.py` (`main_html` property).
3. **Output formats** — `convert_html_to_structured_data()` (MinerU-Webkit) supports `md`, `mm_md`, `plain_md`, `json`, `txt`. For navigator, use **`plain_md`** (clean markdown). `mm_md` is MinerU's multimodal markdown (image tokens) — only if raw images must be preserved. Confirmed in `webpage_converter/convert.py`.
4. **Generation limits** — vLLM backend defaults: `top_k=1, top_p=0.95, temperature=0, max_tokens=16*1024`; `MinerUHTML` vLLM impl hardcodes `max_context_window=256*1024`, `gpu_memory_utilization=0.8`, `tensor_parallel_size=1`. Compact output uses regex-guided structured output (`StructuredOutputsParams(regex='<answer>\s*1(main|other)2(main|other)…')`) — the model output is only the per-element classification, so 16k generation tokens is plenty; the main content is **extracted**, not generated. `DEFALUT_MODEL` in base.py = the HF id (no model_path needed if not baking in).

**Config note:** `output_format='plain_md'` overrides the default `'mm_md'` (MinerU multimodal markdown with image references). Set explicitly in the sidecar's `MinerUHTMLConfig`. The `use_fall_back='trafilatura'` default already covers LLM-failure fallback inside `process()`.

## Testing / Verification

1. Container smoke test: `docker compose up -d navigator-mineru`, then `curl -X POST localhost:8001/extract -d '{"html":"<html>…"}'` → clean markdown, no nav/footer noise; `nvidia-smi` shows the process using the GPU.
2. NSE India option chain (the page that motivated reader-lm) — tables must survive the main-HTML extraction + MinerU-Webkit conversion.
3. MCP `web_fetch` with `format: "mineru_lm"` — success path, error fallback (container down → `html_to_markdown` + console warning), no cache reuse.
4. Console: extractor dropdown shows the new model; both default-extraction and flow-block paths work.
5. `/extract?hint=` test pane with the model as `default.format`.

## Out of Scope (v1)

- GGUF/Ollama serving of the v1.1 model (no artifact exists).
- CPU/transformers deployment (GPU container is the chosen route; transformers is only a dev fallback).
- Replacing reader-lm — both AI extractors coexist.
- Anything in the interactive-flow record-field render modes (unchanged, same as plan 22).
