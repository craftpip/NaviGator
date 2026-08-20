# Website Ideas & Specifications

> **The single source of truth for the website.** Every instruction from the user
> is captured here FIRST, then implemented. Nothing gets lost to context limits.

## How This Works

1. **You say what you want.** Any idea, change, design goal, or new page.
2. **I write it down here FIRST** — verbatim intent, not my paraphrase. **No code is touched, no plan is made, nothing else happens until the idea is in this file.**
3. **I implement it** from this document.
4. **When done**, I mark the item as implemented and update the README.

**Absolute rule: the file is updated first, always.** Everything starts after the idea is written down here. If I ever find myself coding without having captured the idea here first, I stop and put it in this file.

If the user says "X", the flow is always: **document → implement → verify → mark done**.

## Rules

- This folder is **inside the website folder** on purpose — it ships with the site.
- Never delete an idea because "we decided against it" — mark it `superseded`/`declined` with the reason.
- When reworking a page, keep the **old design goal visible** so we can see why decisions were made.
- One section per idea/page, newest idea last.
- The README.md in `website/` links here.

---

## Design Goals (the big picture)

- **Home page captures the real value of Navigator, not generic marketing.** The feature sections must reflect the actual detailed capabilities of the product, as described by the user below.

---

## Ideas

### Idea 1: Home page "Five tools, zero setup" — feature content rewrite

Status: **in-progress** | Date: 2026-08-20

**What the user said (intent, workpiece):**

Starting with the home page. The "Works with your stack" section is good — keep it. Then comes the "Five tools. Zero setup." section. The feature cards there must reflect what the product actually does in detail:

- **web_search**: it has a **smart queue** that manages the search engines.
- **web_fetch**: it has **Readability → Markdown** (NOT "Readability → HTML" — correction 2026-08-20) plus multiple output options are available. There is **one more extractor option: Trafilatura** (also → Markdown). So the extractor options include: Readability → Markdown, Trafilatura → Markdown, HTML → Markdown, plain text, tables. It also supports running an **AI post-processor or any custom API** — high level of dynamic, customizable options.
- **web_fetch customisation**: the web is not all built the same, so behavior must be customizable — there are **multiple options in domain hints**, **custom hints can be added for custom domains** — very interactive.
- **web_page_screenshot**: standard screenshot capability, but it supports returning **not just base64** — if the agent has the same disk access it can also read the **file or the URL** — this is **token-optimized**.
- **Big theme: the whole thing is built around giving the least amount of tokens possible by optimizing responses.**
- **DevTools**: complete control of a browser. The agent can take and do **multiple customized steps** if it wants.

**Why it matters:** The home page currently sells the product as generic tool names ("Nineteen CDP tools — DOM read/write, clicks..."). The user knows exactly what the product does and wants the distinctive, differentiating features surfaced: the smart queue, the flexible extraction (Readability + AI/API post-processing), per-domain hints, token-optimized outputs (base64 + file/url), and full browser control.

**Implementation notes** — update to Idea 1:
- **They are FEATURES, not tools.** Do NOT present them under tool names with underscores (`web_search`). Give each card a real feature name (e.g. "Smart Search Engine Routing" instead of `web_search`, "Token-Optimized Screenshots" instead of `web_page_screenshot`).
- **Standardize the presentation.** Consistent style across all cards — same naming pattern, same tone, no mixing raw API names with human labels.
- Rewrite the `features` array in `LandingPage.vue` (the "Five tools. Zero setup." grid) to describe the detailed capabilities above.
- Consider whether the "Why Navigator" cards or a new section should also surface the token-optimization and customization story — user's focus is the five-tools section first.
- "Works with your stack" stays as-is (user approved it).
- **VERIFICATION: use the running dev server (`http://localhost:5431`, hot reload). Do NOT run `npm run docs:build` to check changes — the dev server picks up edits instantly. Check with `curl http://localhost:5431/` or open the page in the browser.**
- **ALWAYS read the actual source code first** before writing any card text. Do not go off memory or assumptions — read the relevant files, understand what exists, THEN write accurate copy. This prevents wrong descriptions (e.g. writing "Readability → HTML" when it's actually "Readability → Markdown").
- **Verified extractor list** (from `src/extractors/index.js` — the single source of truth):
  - `trafilatura_to_markdown` — Trafilatura Rule+ML → markdown (native napi-rs/rs-trafilatura)
  - `readability_to_markdown` — Mozilla Readability → markdown (default extractor)
  - `html_to_markdown` — full HTML → markdown via Turndown
  - `text` — flat text dump
  - `html` — raw HTML in a code block
  - `table` / `table_json` / `table_csv` — tables-only output
  - `screenshot` — full-page screenshot → post-processor input
  - Any configured AI model ID — reader-lm, MinerU-HTML, custom API endpoint
- After extraction, a single **post-processor** step can send the output through any AI model or custom API configured via `POST_PROCESSOR_MODELS`.

---

### Idea 2: Remote desktop / VNC — pitch as "see what your agent sees"

Status: **proposed** | Date: 2026-08-20

**What the user said:** "It also gives an option for remote desktop. Now I don't know how you would pitch this but pitch it in a way so that the user understands that it is not his personal browser and it will be opened in a Chrome tab."

**Why it matters:** This is a differentiator — you can watch your agent browse in real-time through noVNC in any Chrome tab. The pitch must convey: (1) it's NOT your personal browser — it's an isolated, containerized Chromium instance, and (2) it opens in a Chrome tab via noVNC, no VNC client needed. This is about visibility and trust — you see exactly what the agent sees and does.

**Implementation notes:**
- Need to read VNC/noVNC setup code to understand the actual feature before writing the card.
- Add as a card in the features grid.
- Pitch: "watch your agent browse in real time — an isolated browser you can see and control from any Chrome tab."
- NOT "remote desktop" jargon — pitch it as visibility/control over the agent's browsing.

---

### Idea 3: Web Console — live dashboard, engine stats, everything visible

Status: **proposed** | Date: 2026-08-20

**What the user said:** "We also have one more feature that is the Console, where all of the things are statistics and all everything is given and all."

**Why it matters:** The web console at `:3000/console` is a full operational dashboard — engine health, success rates, circuit breakers, live activity feed, extraction testing, hint editing. It's a real differentiator vs. other MCP servers that are invisible black boxes.

**Implementation notes:**
- Add as a card in the features grid.
- Pitch angle: live visibility — engine health, real-time activity, extraction testing — not a black box.
- Need to understand the console features before writing accurate copy.

---