# MinerU Sidecar

Provided by Navigator — sidecar container `navigator-mineru`, built on [MinerU](https://github.com/opendatalab/MinerU).

No manual configuration needed — it is automatically configured. Just run it with Docker Compose.

## Setup

It is already wired in `docker-compose.yml`:

```yaml
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

No env vars to set — the main Navigator container discovers it automatically.
