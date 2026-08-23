# MinerU Sidecar

The sidecar container `navigator-mineru` is provided by Navigator — built on [MinerU](https://github.com/opendatalab/MinerU) / [MinerU-HTML](https://github.com/opendatalab/MinerU-HTML) (v1.1, Hunyuan-0.5B). It runs the full `mineru_html` pipeline on a GPU and exposes it as a tiny HTTP API. Navigator never imports the Python stack — it POSTs raw HTML and gets clean Markdown back.

> **Not a reader-lm replacement.** reader-lm returns Markdown directly from one model call. MinerU-HTML classifies each element as `main`/`other`, rebuilds the main-content HTML from the original page, then renders it via MinerU-Webkit (Cairo). The model never generates the output text.

If the sidecar is down, `web_fetch` with a MinerU extractor falls back to `html_to_markdown` — Navigator is never blocked.

::: tip Already have vLLM / Ollama?
If you already run **vLLM** (or **Ollama**) with an OpenAI-compatible `chat/completions` endpoint, you don't need this sidecar — just add the MinerU-HTML model (`opendatalab/MinerU-HTML-v1.1-hunyuan0.5B-compact`) to your existing server and configure it in Navigator as `kind: "chat"` with your `baseUrl`. This container is just a ready-to-run implementation of the original [MinerU-HTML](https://github.com/opendatalab/MinerU-HTML) project that bundles **vLLM + the model weights + Webkit/Cairo** — useful if you don't already host a VLM.
:::

## APIs Built Inside

The sidecar is a FastAPI server (`docker/navigator-mineru/sidecar.py`, `uvicorn :1998`):

| Endpoint | Request | Response |
|----------|---------|----------|
| `POST /extract` | `{"html": "<html>..."}` | `{"text": "<markdown>"}` |
| `GET /health` | — | `{"ok": true, "backend": "vllm" \| "transformers", "model": "/app/model"}` |

**Examples:**

```bash
# Health — which backend is running
curl http://localhost:1998/health

# Extract — HTML in, Markdown out
curl -X POST http://localhost:1998/extract \
  -H "Content-Type: application/json" \
  -d '{"html": "<html><body><h1>Hello</h1><p>World</p></body></html>"}'
```

- `POST /extract` tail-cuts the input at `MINERU_MAX_INPUT_CHARS` (default 400000, tail kept so tables/footnotes survive), runs the pipeline (see below), and returns `text`. On failure or `InputTooLong` it falls back per `MINERU_USE_FALLBACK` (`trafilatura` / `bypass` / `empty`).
- Concurrency is gated: `MINERU_GATE_CONCURRENCY` (default auto — 2 for vLLM, 1 for transformers). With the default 13K window the GPU holds ~1 full-window request at a time.

## Setup — Where Everything Lives

| File | Role |
|------|------|
| `docker/navigator-mineru/Dockerfile` | Image: `python:3.11-slim` + `gcc`/`libcairo2` + `mineru_html[vllm]==1.1.2` + baked model at `/app/model` (~1.1 GB) |
| `docker/navigator-mineru/sidecar.py` | FastAPI wrapper — backend selection (vLLM vs transformers), concurrency gate, `MAX_INPUT_CHARS` tail-cut, all `MINERU_*` knobs |
| `docker-compose.mineru.yml` | Separate Compose file for the sidecar: `runtime: nvidia`, `:1998`, `shm 2gb`, every knob as `${MINERU_*:-default}` |
| `src/post-processor.js` | `extractWithMineru()` client — tail-cuts at `MINERU_MAX_INPUT_CHARS`, POSTs `{html}` to `${baseUrl}/extract` |
| `src/config.js` | `POST_PROCESSOR_MODELS` entries with `kind: "mineru"` |

### Running the sidecar

It is **not** in the default `docker-compose.yml` — this page is only for the sidecar. Use the overlay file to run the sidecar alone:

```bash
docker compose -f docker-compose.mineru.yml up --build -d
```

Logs: `docker logs navigator-mineru -f` — look for `sidecar ready`.

> **Build cost:** Building the sidecar takes a while — the `Dockerfile` (`docker/navigator-mineru/Dockerfile`) downloads GBs (Python deps, `mineru_html[vllm]`, CUDA wheels, and the ~1.1 GB model at `/app/model`). Budget several GB of disk and 5–10 minutes on first build. Subsequent builds are cached. See the `Dockerfile` for the exact `pip install` and `huggingface-cli download` steps.

## Architecture

```
navigator (Node)                          navigator-mineru (Python, NVIDIA GPU)
  web_fetch format: "mineru"
    -> src/post-processor.js                FastAPI :1998  sidecar.py
       extractWithMineru()  ──POST /extract──>  MinerUHTMLGeneric.process(html)
                {html}  ─────────────────>    1. simplify_html      # _item_id tag
                                              2. build_prompt       # short_compact
                                              3. InferenceBackend   # vLLM / transformers
                                              4. parse_result       # "1main2other..."
                                              5. extract_main_html  # from original html
                                              6. convert2content    # Webkit -> Markdown
                {text}  <─────────────────    plain_md
```

Every `MINERU_*` env var is passed through `docker-compose.mineru.yml` and translated in `sidecar.py` before vLLM imports (e.g. `MINERU_VLLM_ATTENTION_BACKEND` → `VLLM_ATTENTION_BACKEND`).

## Pipeline (what the API does internally)

1. **simplify_html** — parse with selectolax, assign `_item_id` to each element, strip `head/style/script/nav`, produce `simpled_html` (for prompt) and `map_html` (original DOM with ids).
2. **build_prompt** — wrap `simpled_html` in the `short_compact` classification prompt: `1main2other3main...`.
3. **Inference gate** — tokenizes `prompt + dummy_response` and checks against `MINERU_CONTEXT_WINDOW` (default 13312). If it overflows, returns `InputTooLong` and skips the LLM.
4. **vLLM generate** — `max_model_len = CONTEXT_WINDOW`, `gpu_memory_utilization=0.95`, `enforce_eager=true`, regex-guided `main|other` decoding (2 tokens per element).
5. **parse_result** — regex `(\d+)(main|other)` → `{id: label}`.
6. **extract_main_html** — rebuild main HTML from `map_html` (keep `main` elements + ancestors/descendants).
7. **Fallback** — on `InputTooLong` or error, run `trafilatura` on the original HTML (silent, no marker).
8. **convert2content** — MinerU-Webkit `noclip_html` pipe → Markdown (`plain_md`). Requires `libcairo2` for SVG → base64.

See [MinerU-HTML Sidecar — Technical Reference](/extraction/navigator-mineru-sidecar) for full internals, KV cache math (96 KiB/token, 1.22 GiB at 13K), and measured performance (100 KB → ~4.3s LLM, 300 KB → ~0.66s fallback).

## Configuration

All knobs are settable from `.env` via `docker-compose.mineru.yml` (`${MINERU_*:-default}`) — including the context length. The one you most likely want on a bigger GPU is `MINERU_CONTEXT_WINDOW`.

| Var | Default | Meaning |
|-----|---------|---------|
| `MINERU_BACKEND` | `vllm` | `vllm` (primary) or `transformers` — vLLM auto-falls back to transformers on init failure |
| `MINERU_MODEL_PATH` | `/app/model` | Weights dir (baked into image) |
| `MINERU_CONTEXT_WINDOW` | `13312` | Token window (≈1.2 GiB KV at 13K; 32768≈3.0 GiB; 65536≈6.0 GiB) |
| `MINERU_GPU_MEM_UTIL` | `0.95` | vLLM `gpu_memory_utilization` |
| `MINERU_MAX_INPUT_CHARS` | `400000` | Tail-cut HTML before processing |
| `MINERU_TENSOR_PARALLEL_SIZE` | `1` | Multi-GPU tensor parallelism |
| `MINERU_ENFORCE_EAGER` | `true` | `true`=no CUDA graphs (low VRAM); `false` on CC≥8.0 for speed |
| `MINERU_DTYPE` | `""` | `""`=auto (fp16 on CC 7.5), `bfloat16` on CC≥8.0 |
| `MINERU_MAX_TOKENS` | `16384` | Max completion tokens |
| `MINERU_GATE_CONCURRENCY` | `0` | Concurrent `/extract` (0=auto: 2 vLLM / 1 transformers) |
| `MINERU_USE_FALLBACK` | `trafilatura` | `trafilatura` / `bypass` / `empty` |
| `MINERU_OUTPUT_FORMAT` | `plain_md` | `plain_md` / `mm_md` / `md` / `json` / `txt` |
| `MINERU_VLLM_ATTENTION_BACKEND` | `TRITON_ATTN` | `TRITON_ATTN` on CC 7.5, `FLASH_ATTN` on CC≥8.0 |
| `MINERU_PYTORCH_CUDA_ALLOC_CONF` | `expandable_segments:True` | PyTorch allocator |

All sidecar vars are `MINERU_`-prefixed so they never collide with Navigator's.

## Using in Navigator

Add a post-processor with `kind: "mineru"`:

```json
{"id":"mineru","label":"MinerU-HTML","kind":"mineru","baseUrl":"http://localhost:1998"}
```

Configure it at [http://localhost:1994/console/manage?focus=POST_PROCESSOR_MODELS](http://localhost:1994/console/manage?focus=POST_PROCESSOR_MODELS) or in `.env` via `POST_PROCESSOR_MODELS`. Then select it as the extractor in a domain hint (`default.postProcessor: "mineru"`).

> **Tip:** Requires an NVIDIA GPU with ~4 GB+ VRAM at the default window. For larger pages, increase `MINERU_CONTEXT_WINDOW` (and VRAM) or rely on the trafilatura fallback.
