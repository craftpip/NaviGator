"""Thin FastAPI wrapper around mineru_html v1.1 (vLLM backend, GPU).

Contract:
  POST /extract  {"html": "<html>..."} -> {"text": "<markdown>"}
  GET  /health  -> {"ok": true, "backend": "vllm"|"transformers", "model": "..."}

The vLLM backend is tried first. On init failure (low-VRAM / unsupported arch)
it automatically falls back to the transformers backend (still on GPU via
device_map="auto"), so the container always serves.

Requests are serialized: the transformers pipeline is not safe for concurrent
generate calls, and the vLLM sync engine tolerates a small fan-in (semaphore 2).
"""

import asyncio
import logging
import os

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from mineru_html import MinerUHTMLConfig
from mineru_html import MinerUHTML  # vLLM backend

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("mineru-sidecar")

MODEL_PATH = os.environ.get("MINERU_MODEL_PATH", "/app/model")
MINERU_BACKEND = os.environ.get("MINERU_BACKEND", "vllm")  # "vllm" | "transformers"
MAX_INPUT_CHARS = int(os.environ.get("MINERU_MAX_INPUT_CHARS", "400000"))

app = FastAPI(title="mineru-html sidecar")

extractor = None
backend_name = None
gate = None


def make_config() -> MinerUHTMLConfig:
    return MinerUHTMLConfig(
        use_fall_back="trafilatura",
        prompt_version="short_compact",
        response_format="compact",
        output_format="plain_md",
        early_load=True,
    )


def make_transformers():
    from mineru_html import MinerUHTML_Transformers

    return MinerUHTML_Transformers(
        model_path=MODEL_PATH,
        config=make_config(),
        model_init_kwargs={"device_map": "auto", "dtype": "auto"},
        model_gen_kwargs={"max_new_tokens": 16 * 1024},
    )


def init():
    global extractor, backend_name
    config = make_config()
    if MINERU_BACKEND == "transformers":
        logger.info("Initializing transformers backend (%s)...", MODEL_PATH)
        extractor = make_transformers()
        backend_name = "transformers"
        logger.info("Transformers backend ready")
        return
    try:
        logger.info("Initializing vLLM backend (%s) — this can take a minute...", MODEL_PATH)
        extractor = MinerUHTML(model_path=MODEL_PATH, config=config)
        backend_name = "vllm"
        logger.info("vLLM backend ready")
    except Exception as e:  # noqa: BLE001 - fall back to transformers on any init failure
        logger.error("vLLM init failed (%s); falling back to transformers", e)
        extractor = make_transformers()
        backend_name = "transformers"


def _run_extract(html: str) -> str:
    results = extractor.process(html)
    if not results or not results[0].output_data:
        return ""
    return results[0].output_data.main_content or ""


@app.on_event("startup")
async def startup():
    global gate
    gate = asyncio.Semaphore(2 if backend_name == "vllm" else 1)
    logger.info("sidecar ready, backend=%s", backend_name)


@app.get("/health")
async def health():
    return {"ok": extractor is not None, "backend": backend_name, "model": MODEL_PATH}


@app.post("/extract")
async def extract(req: Request):
    global gate
    try:
        body = await req.json()
    except Exception:
        return JSONResponse(status_code=400, content={"error": "invalid JSON body"})
    html = body.get("html")
    if not isinstance(html, str) or not html.strip():
        return {"text": ""}
    if len(html) > MAX_INPUT_CHARS:
        html = html[-MAX_INPUT_CHARS:]
    if gate is None:
        gate = asyncio.Semaphore(2 if backend_name == "vllm" else 1)
    async with gate:
        try:
            text = await asyncio.to_thread(_run_extract, html)
            return {"text": text}
        except Exception as e:  # noqa: BLE001
            logger.error("extract failed: %s", e)
            return JSONResponse(status_code=500, content={"error": str(e), "text": ""})


init()
