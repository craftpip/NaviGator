# OpenAI Compatible APIs

Use any OpenAI-compatible `chat/completions` endpoint as a post-processor — local Ollama or any hosted API. Pull a model with `ollama pull` and point Navigator at `http://localhost:11434`, or use a hosted endpoint directly.

No extra setup — configure the model in [Post-processors → Overview](/guides/extraction/ai-extractors) via `POST_PROCESSOR_MODELS` or the console at [http://localhost:1994/console/manage?focus=POST_PROCESSOR_MODELS](http://localhost:1994/console/manage?focus=POST_PROCESSOR_MODELS).

## Specialized Extractor Models

These small language models are trained specifically for HTML → Markdown — higher accuracy and far cheaper than general LLMs for extraction. All run on your local hardware.

| Model | Params | Context | Conversion | Hugging Face |
|-------|--------|---------|------------|--------------|
| **ReaderLM-v2** | 0.5B | 256K | HTML → Markdown | [jinaai/reader-lm-0.5b](https://huggingface.co/jinaai/reader-lm-0.5b) |
| **ReaderLM-v2** | 1.5B | 512K | HTML → Markdown | [jinaai/ReaderLM-v2](https://huggingface.co/jinaai/ReaderLM-v2) |
| **MinerU 2.5** | 1.2B | 32K | Image → Markdown | [opendatalab/MinerU2.5-2509-1.2B](https://huggingface.co/opendatalab/MinerU2.5-2509-1.2B) |
| **Dolphin v2** | 0.4B | 8K | Image → Markdown | [ByteDance/Dolphin](https://huggingface.co/ByteDance/Dolphin) |
| **OvisOCR2** | 0.8B | 8K | Image → Markdown | [ATH-MaaS/OvisOCR2](https://huggingface.co/ATH-MaaS/OvisOCR2) |

> **Note:** When adding the post-processor, select whether the model takes **HTML** or **Image** (see Conversion column). In the domain hint, set the extractor to `html` or `screenshot` accordingly, then pick the post-processor — the extractor output is passed to the post-processor.

> **Leaderboard:** See the single leaderboard comparing all major methods on [webcontentextraction.org](https://webcontentextraction.org/).

## Third-Party Hosted Models

Any frontier model works as a post-processor — no special training needed, just higher token cost. These are hosted by the provider, not by Navigator.

| Provider | Model | Use when |
|----------|-------|----------|
| **OpenAI** | `gpt-4o-mini` | Small, cheap fallback for complex SPAs. |
| **Anthropic** | `claude-haiku-4-5` | Small, low hallucination, good for structured extraction. |
| **Google** | `gemini-2.0-flash` | Small, cheap, large context (1M) flash tier. |

> Any OpenAI-compatible endpoint works — Groq, Together, Fireworks, Azure OpenAI, etc. Just set the matching `baseUrl` and `model`.

## Configuring in Navigator

Open [http://localhost:1994/console/manage?focus=POST_PROCESSOR_MODELS](http://localhost:1994/console/manage?focus=POST_PROCESSOR_MODELS) — the **POST_PROCESSOR_MODELS** card in the console's **Configs** panel provides the interactive form to add a post-processor.

## Tips

- **Start with Specialized Models** — `ReaderLM-v2` for HTML, `OvisOCR2` / `MinerU 2.5` / `Dolphin` for Image. They run locally and are far cheaper than hosted LLMs. Fall back to `gpt-4o-mini` or `gemini-2.0-flash` for edge cases.
- **Match input to model** — set the post-processor's **Conversion** (HTML vs Image) and the domain hint's extractor (`html` vs `screenshot`) together.
- **Set `maxInputChars`** — default 60000 trims long pages from the tail; increase for 100K+ docs (ReaderLM-v2 0.5B: 256K, 1.5B: 512K).
- **Monitor fallbacks** — if the API is down, Navigator silently falls back to the extractor output and logs a warning in `logs/tool-errors.log`.
