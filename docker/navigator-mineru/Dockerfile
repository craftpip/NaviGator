# MinerU-HTML v1.1 sidecar — GPU container serving POST /extract {html} -> {text}.
# vLLM backend (primary) with automatic transformers fallback for low-VRAM GPUs.
# Model weights are baked into the image for fast cold starts (~1.1GB).
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    git \
    gcc \
    g++ \
    libcairo2 \
    libgomp1 \
    libglib2.0-0 \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# mineru_html[vllm] pulls vllm==0.11.1, torch 2.9.0, mineru_webkit, trafilatura, ...
RUN pip install --no-cache-dir "mineru_html[vllm]==1.1.2"

# Bake the model weights in (fast cold start, no HF download at runtime).
RUN pip install --no-cache-dir "huggingface_hub[cli]" && \
    huggingface-cli download opendatalab/MinerU-HTML-v1.1-hunyuan0.5B-compact --local-dir /app/model

COPY sidecar.py /app/sidecar.py

EXPOSE 1998
CMD ["uvicorn", "sidecar:app", "--host", "0.0.0.0", "--port", "1998"]
