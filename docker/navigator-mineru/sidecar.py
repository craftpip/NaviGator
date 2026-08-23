"""Thin FastAPI wrapper around mineru_html v1.1 (vLLM backend, GPU).

Contract:
  POST /extract  {"html": "<html>..."} -> {"text": "<markdown>"}
  GET  /health  -> {"ok": true, "backend": "vllm"|"transformers", ...}

The vLLM backend is tried first. On init failure (low-VRAM / unsupported arch)
it automatically falls back to the transformers backend (still on GPU via
device_map="auto"), so the container always serves.

The stock mineru_html MinerUHTML wrapper hardcodes max_context_window=256k and
gpu_memory_utilization=0.8, which over-reserves the KV cache and fails to init
on 4GB cards. We build the vLLM backend directly with a bounded context window
and a memory budget sized to fit the whole GPU.

Everything is tunable via MINERU_* env vars (see docker-compose.mineru.yml) — every
var is MINERU_-prefixed so no sidecar var is ever confused with a navigator one:
  MINERU_BACKEND, MINERU_MODEL_PATH, MINERU_CONTEXT_WINDOW, MINERU_GPU_MEM_UTIL,
  MINERU_MAX_INPUT_CHARS, MINERU_TENSOR_PARALLEL_SIZE, MINERU_DTYPE,
  MINERU_ENFORCE_EAGER, MINERU_MAX_TOKENS, MINERU_TOP_K, MINERU_TOP_P,
  MINERU_TEMPERATURE, MINERU_GATE_CONCURRENCY, MINERU_USE_FALLBACK,
  MINERU_OUTPUT_FORMAT, MINERU_PROMPT_VERSION, MINERU_RESPONSE_FORMAT,
  MINERU_VLLM_ATTENTION_BACKEND, MINERU_PYTORCH_CUDA_ALLOC_CONF.

KV cache sizing (~96 KiB/token: 2 x layers x kv_heads x head_dim x 2 bytes):
  - 13,312 tokens ~= 1.2 GiB   (GTX 1650 4GB default)
  - 32,768 tokens ~= 3.0 GiB   (8GB cards)
  - 65,536 tokens ~= 6.0 GiB   (12-16GB cards)
Model weights add ~1.1 GiB. Pick MINERU_CONTEXT_WINDOW to fit your card.

Requests are serialized: the transformers pipeline is not safe for concurrent
generate calls, and the vLLM sync engine tolerates a small fan-in (semaphore
MINERU_GATE_CONCURRENCY, default 2 for vllm / 1 for transformers).
"""

import asyncio
import logging
import os

# vLLM and torch read VLLM_ATTENTION_BACKEND / PYTORCH_CUDA_ALLOC_CONF at import
# time. We expose them under MINERU_* names (so the sidecar env is uniformly
# namespaced) and translate them into the conventional names BEFORE importing
# anything that loads torch/vllm.
for _src, _dst in (
    ("MINERU_VLLM_ATTENTION_BACKEND", "VLLM_ATTENTION_BACKEND"),
    ("MINERU_PYTORCH_CUDA_ALLOC_CONF", "PYTORCH_CUDA_ALLOC_CONF"),
):
    _value = os.environ.get(_src)
    if _value:
        os.environ[_dst] = _value

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from mineru_html import MinerUHTMLConfig

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("mineru-sidecar")


def _env_int(name: str, default: int) -> int:
    value = os.environ.get(name)
    return int(value) if value is not None and value != "" else default


def _env_float(name: str, default: float) -> float:
    value = os.environ.get(name)
    return float(value) if value is not None and value != "" else default


def _env_bool(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None or value == "":
        return default
    return value.strip().lower() in ("1", "true", "yes", "on")


MODEL_PATH = os.environ.get("MINERU_MODEL_PATH", "/app/model")
MINERU_BACKEND = os.environ.get("MINERU_BACKEND", "vllm")  # "vllm" | "transformers"
MAX_INPUT_CHARS = _env_int("MINERU_MAX_INPUT_CHARS", 400000)
CONTEXT_WINDOW = _env_int("MINERU_CONTEXT_WINDOW", 13312)
GPU_MEM_UTIL = _env_float("MINERU_GPU_MEM_UTIL", 0.95)
TENSOR_PARALLEL_SIZE = _env_int("MINERU_TENSOR_PARALLEL_SIZE", 1)
ENFORCE_EAGER = _env_bool("MINERU_ENFORCE_EAGER", True)
DTYPE = os.environ.get("MINERU_DTYPE", "")  # "" = auto (vLLM picks; bf16 needs CC >= 8.0)
MAX_TOKENS = _env_int("MINERU_MAX_TOKENS", 16 * 1024)
TOP_K = _env_int("MINERU_TOP_K", 1)
TOP_P = _env_float("MINERU_TOP_P", 0.95)
TEMPERATURE = _env_float("MINERU_TEMPERATURE", 0.0)
GATE_CONCURRENCY = _env_int("MINERU_GATE_CONCURRENCY", 0)  # 0 = auto per backend
USE_FALLBACK = os.environ.get("MINERU_USE_FALLBACK", "trafilatura")  # trafilatura | bypass | empty
OUTPUT_FORMAT = os.environ.get("MINERU_OUTPUT_FORMAT", "plain_md")  # plain_md | mm_md | md | json | txt
PROMPT_VERSION = os.environ.get("MINERU_PROMPT_VERSION", "short_compact")
RESPONSE_FORMAT = os.environ.get("MINERU_RESPONSE_FORMAT", "compact")  # compact | json

app = FastAPI(title="navigator-mineru sidecar")

extractor = None
backend_name = None
gate = None


def make_config() -> MinerUHTMLConfig:
    return MinerUHTMLConfig(
        use_fall_back=USE_FALLBACK,
        prompt_version=PROMPT_VERSION,
        response_format=RESPONSE_FORMAT,
        output_format=OUTPUT_FORMAT,
        early_load=True,
    )


def make_vllm():
    from mineru_html.inference.factory import create_vllm_backend
    from mineru_html.api import MinerUHTMLGeneric

    config = make_config()
    model_init_kwargs = {
        "tensor_parallel_size": TENSOR_PARALLEL_SIZE,
        "gpu_memory_utilization": GPU_MEM_UTIL,
        "enforce_eager": ENFORCE_EAGER,
    }
    if DTYPE:
        model_init_kwargs["dtype"] = DTYPE
    model_gen_kwargs = {
        "top_k": TOP_K,
        "top_p": TOP_P,
        "temperature": TEMPERATURE,
        "max_tokens": MAX_TOKENS,
    }
    llm = create_vllm_backend(
        model_path=MODEL_PATH,
        response_format=config.response_format,
        max_context_window=CONTEXT_WINDOW,
        model_init_kwargs=model_init_kwargs,
        model_gen_kwargs=model_gen_kwargs,
    )
    return MinerUHTMLGeneric(llm, config)


def make_transformers():
    from mineru_html import MinerUHTML_Transformers

    model_init_kwargs = {"device_map": "auto", "dtype": "auto"}
    if DTYPE:
        model_init_kwargs["dtype"] = DTYPE
    model_gen_kwargs = {
        "top_k": TOP_K,
        "top_p": TOP_P,
        "temperature": TEMPERATURE,
        "max_new_tokens": MAX_TOKENS,
    }
    return MinerUHTML_Transformers(
        model_path=MODEL_PATH,
        config=make_config(),
        model_init_kwargs=model_init_kwargs,
        model_gen_kwargs=model_gen_kwargs,
    )


def init():
    global extractor, backend_name
    if MINERU_BACKEND == "transformers":
        logger.info("Initializing transformers backend (%s)...", MODEL_PATH)
        extractor = make_transformers()
        backend_name = "transformers"
        logger.info("Transformers backend ready")
        return
    try:
        logger.info(
            "Initializing vLLM backend (%s, ctx=%d, util=%.2f, tp=%d) — this can take a minute...",
            MODEL_PATH, CONTEXT_WINDOW, GPU_MEM_UTIL, TENSOR_PARALLEL_SIZE,
        )
        extractor = make_vllm()
        backend_name = "vllm"
        logger.info("vLLM backend ready")
    except Exception as e:  # noqa: BLE001 - fall back to transformers on any init failure
        logger.error("vLLM init failed (%s); falling back to transformers", e)
        extractor = make_transformers()
        backend_name = "transformers"


def _gate_limit() -> int:
    if GATE_CONCURRENCY > 0:
        return GATE_CONCURRENCY
    return 2 if backend_name == "vllm" else 1


def _run_extract(html: str) -> str:
    results = extractor.process(html)
    if not results or not results[0].output_data:
        return ""
    output = results[0].output_data
    if output.main_content:
        return output.main_content
    if output.main_html:
        from mineru_html.process.convert2content import convert2content

        converted = convert2content(results[0], OUTPUT_FORMAT)
        return converted.output_data.main_content or ""
    return ""


@app.on_event("startup")
async def startup():
    global gate
    gate = asyncio.Semaphore(_gate_limit())
    logger.info("sidecar ready, backend=%s, gate=%d", backend_name, _gate_limit())


@app.get("/health")
async def health():
    return {
        "ok": extractor is not None,
        "backend": backend_name,
        "model": MODEL_PATH,
        "context_window": CONTEXT_WINDOW,
        "gpu_memory_utilization": GPU_MEM_UTIL,
        "max_input_chars": MAX_INPUT_CHARS,
        "output_format": OUTPUT_FORMAT,
    }


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
        gate = asyncio.Semaphore(_gate_limit())
    async with gate:
        try:
            text = await asyncio.to_thread(_run_extract, html)
            return {"text": text}
        except Exception as e:  # noqa: BLE001
            logger.error("extract failed: %s", e)
            return JSONResponse(status_code=500, content={"error": str(e), "text": ""})


init()
