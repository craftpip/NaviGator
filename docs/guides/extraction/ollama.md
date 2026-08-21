# Ollama

Use local Ollama models as post-processors. Any model that speaks OpenAI `chat/completions` works — pull it with `ollama pull` and point Navigator at `http://localhost:11434`.

No extra setup — configure the model in [Post-processors → Overview](/guides/extraction/ai-extractors) via `POST_PROCESSOR_MODELS` or the console.

> Detailed benchmarks and model recommendations (HTML → markdown) will be documented here.
