# Open Source Preparation Plan

## Current State

The repo (`craftpip/browser-search-mcp`) is being renamed to `craftpip/navigator`. Most open-source boilerplate already exists — license, CoC, security policy, contributing guide, issue/PR templates, release workflow.

**What this project needs to go public well:**
1. A new contributor must be able to go from `git clone` to a working server in under 5 minutes
2. A potential contributor must know what's worth working on and how to start
3. The project must look actively maintained (CI green, responsive, clear scope)

---

## Phase 0 — Identity (In Progress)

The rename is underway per `plans/rename-to-navigator.md`. All items below assume the repo name is settled.

**Remaining rename work:**
- [ ] Update `README.md` references (clone URL, paths, title)
- [ ] Update `AGENTS.md` docker exec commands
- [ ] Update `CONTRIBUTING.md`, issue templates
- [ ] Update `scripts/` (docker exec target names)
- [ ] Update `web-fetch-docs.md`, `websites/README.md`
- [ ] Rename repo on GitHub → `git remote set-url origin`
- [ ] Clean up old containers/volumes after rename

---

## Phase 1 — First-Run Experience (High Priority)

This is the biggest blocker for adoption. A new user hitting the README needs to reach a working server in ~5 commands with no surprises.

### 1.1 Reduce setup friction

**Problem:** `.env.example` has 68 lines. A new user copying it verbatim gets VNC, cloakbrowser, circuit breakers, etc. — they don't know what matters.

**Fix:** Create a minimal `.env.example` with only the essentials:

```
HEADLESS=true
ENABLE_HTTP_MCP=1
MCP_API_PORT=3000
```

Move the full reference to a docs section or keep as `.env.example.full`. The Docker defaults handle everything else.

### 1.2 Make the Docker path the only recommended path

**Problem:** The README presents "Recommended Setup: HTTP MCP Server" and "Alternative Setup: stdio" as equal choices. For open source, one blessed path reduces confusion.

**Fix:**
- Make Docker Compose the single recommended path. Mention stdio in a section below.
- Ensure `docker compose up -d` works without a `.env` file at all (sensible defaults).
- Verify that a fresh clone → `docker compose up -d` → `curl localhost:3000/health` works without any config.

### 1.3 Verify the Docker build is reliable

- [ ] `docker compose build` succeeds from a clean clone
- [ ] No interactive prompts during build
- [ ] Build completes in under 5 min on a typical connection
- [ ] Container starts without a `.env` file (hardcoded defaults in docker-compose.yml)

---

## Phase 2 — CI & Automation (High Priority)

Without CI, no one trusts the project is maintained.

### 2.1 Add test workflow

Create `.github/workflows/test.yml`:

```yaml
name: Test

on: [push, pull_request]

jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx vitest run
```

This runs non-browser unit tests. Fast, no Docker needed. Catches import errors, logic bugs, regressions.

### 2.2 Add Docker build check (separate job)

```yaml
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker compose build
```

Runs on push to main + PRs. Catches Dockerfile breakage.

### 2.3 Add lint / type check (if applicable)

The project doesn't use a linter today. Consider adding one later, not a blocker.

### 2.4 Add Dependabot

Create `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
```

---

## Phase 3 — Content Pruning & Documentation (Medium Priority)

The project has accumulated internal research docs, competitive analysis, and AI-agent instructions. Some are valuable publicly; some are noise.

### 3.1 Organize the file tree

**Files that add value publicly:**

| File | Keep? | Why |
|------|-------|-----|
| `README.md` | ✓ Rewrite | Needs badges, streamlined setup |
| `LICENSE` | ✓ | Apache 2.0 |
| `CONTRIBUTING.md` | ✓ | Already clean |
| `SECURITY.md` | ✓ | Already clean |
| `CODE_OF_CONDUCT.md` | ✓ | Already clean |
| `AGENTS.md` | ✓ | Documenting internal architecture is useful. Rename to `ARCHITECTURE.md` or `INTERNALS.md` — "AGENTS" is confusing for humans |
| `domain-hints.json` | ✓ | Ships with the product, documented in README |
| `.env.example` | ✓ Trim to essentials | See 1.1 |
| `docker-compose.yml` | ✓ | Main deployment path |
| `docker-compose-gluten.yml` | ⚠️ Fix typo or note | Optional VPN compose. Fix filename to `docker-compose-gluetun.yml` |
| `Dockerfile` | ✓ | |
| `scripts/mcp-stdio-docker.sh` | ✓ | Part of stdio path |
| `scripts/mcp-stdio-docker.bat` | ✓ | Windows stdio path |
| `scripts/clone-chrome-userdir.sh` | ⚠️ Niche but harmless | |
| `scripts/test-mcporter.sh` | ⚠️ Internal testing | Move to `tests/` or keep |
| `scripts/test-transport-matrix.mjs` | ⚠️ Internal debugging | Move to `tests/` or keep |
| `scripts/benchmark.mjs` | ⚠️ Niche | Keep in scripts |
| `vitest.config.js` | ✓ | Test config |

**Files that should NOT be public without review:**

| File | Concern | Action |
|------|---------|--------|
| `notes/` | Internal research notes | Review each file. Most can be public but should be in a `docs/` directory |
| `websites/` | Per-site DOM research | Valuable for domain hints contributors. Keep but move under `docs/` |
| `comparison/` | Competitive analysis of other MCP servers | Publishing this may look unprofessional. Review or remove |
| `benchmarking/search-benchmark.mjs` | Contains search queries, potentially URLs | Review for any sensitive data |
| `ASCII screenshot.md` | Design doc for unshipped feature | Keep if feature is planned, otherwise archive |
| `website-hints-plan.md` | Internal exploration plan | Review — may contain unfinished work |
| `web-fetch-docs.md` | Deep-dive on web_fetch | Good public doc, move to `docs/` |
| `SKILL.md` | AI assistant skill config | Remove — this is for the maintainer's tooling, not for users |

### 3.2 Rename `AGENTS.md` to `ARCHITECTURE.md`

The file documents tool contracts, code references, and architectural patterns. "AGENTS" is misleading for human readers. Rename and update the internal reference if any tool reads it.

### 3.3 Restructure docs into `docs/` directory

```
docs/
  web-fetch.md          # Deep-dive on extraction
  domain-hints-dev.md   # How to research and write hints (from websites/)
  architecture.md       # Tool contracts, flow diagrams (was AGENTS.md)
  ascii-screenshot.md   # Design doc (if shipping)
```

This cleans up the root directory and makes the project look organized.

---

## Phase 4 — README Rewrite (Medium Priority)

The current README is good but long (543 lines). For an open-source project, the README needs to:

1. **Hook the reader in 3 seconds** — What is this? Why should I care?
2. **Show don't tell** — A screenshot or asciicast of `web_fetch` in action
3. **Get them running fast** — Minimal setup steps
4. **Show the value** — What makes this different from other MCP servers?

### Suggested structure

```
# NaviGator

One-line tagline.

## Demo (screenshot or terminal recording)

## Quick Start (4 steps, no decisions)

## What Makes It Different
- Multi-engine search with circuit breakers
- Readable page extraction (Readability + scoring fallback)
- Screenshots with flexible output modes
- Domain hints system for tricky sites

## Tools
- web_search, web_fetch, web_page_screenshot, web_page_links
- (Optional) devtools browser-testing tools

## Configuration (link to full reference)

## Docker Notes

## Development

## FAQ / Troubleshooting

## Contributing

## License
```

### Add badges

At the top:
```
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![CI](https://github.com/craftpip/navigator/actions/workflows/test.yml/badge.svg)](https://github.com/craftpip/navigator/actions/workflows/test.yml)
[![npm version](https://img.shields.io/npm/v/navigator-mcp)](https://www.npmjs.com/package/navigator-mcp)  # if published
[![Docker Pulls](https://img.shields.io/docker/pulls/craftpip/navigator)](https://hub.docker.com/r/craftpip/navigator)  # if published
```

---

## Phase 5 — Pre-Launch Audit (Critical)

### 5.1 Secrets sweep

```bash
# Search commit history for secrets
git log -p --all | grep -iE '(api[_-]?key|secret|token|password|credential|-----BEGIN)' | grep -v '^diff' | grep -v '^index' | head -30

# Search current files for secrets
rg -i '(api[_-]?key|secret|token|password)' --no-filename src/ scripts/ docker/ .github/ | head -20
```

If any secrets are found in history, use `git filter-repo` or `BFG Repo-Cleaner` before going public.

### 5.2 License compatibility check

Apache 2.0 is compatible with these dependencies:
- `@modelcontextprotocol/sdk` — likely Apache 2.0 or MIT ✓
- `@mozilla/readability` — Apache 2.0 ✓
- `puppeteer-core` — Apache 2.0 ✓
- `jsdom` — MIT ✓
- `turndown` — MIT ✓
- `turndown-plugin-gfm` — MIT ✓
- `cloakbrowser` — needs verification

Verify each dependency's license in `node_modules/<pkg>/package.json` or `LICENSE`.

### 5.3 npm audit

```bash
npm audit
```

Document any high/critical findings. If there are unfixable issues, add a note to the README.

### 5.4 Verify gitignore covers everything

Current `.gitignore`:
```
node_modules/
.env
npm-debug.log*
screenshots/*.png
!screenshots/.gitkeep
.idea/
.ai/
.cache/
```

Add if missing:
```
doc/              # typedoc output
*.log
dist/
```

---

## Phase 6 — Repository Settings & Launch

### GitHub settings

- [ ] Default branch: `main`
- [ ] Branch protection on `main`: require PR, require CI passing, require up-to-date
- [ ] Allow squash merging (clean history)
- [ ] Auto-delete head branches on merge
- [ ] Set repo description and topics (see below)
- [ ] Enable Discussions (optional, for Q&A / feature requests)

### Topics

`mcp`, `model-context-protocol`, `browser`, `search`, `chromium`, `puppeteer`, `http-server`, `ai`, `llm`, `web-scraping`

### Pre-launch checklist

- [ ] All Phase 0–5 items resolved
- [ ] CI passes on a dry-run push to a private branch
- [ ] `docker compose up -d` works from a clean clone on a different machine
- [ ] README review by someone unfamiliar with the project
- [ ] Change repo visibility to Public
- [ ] Create first public release with meaningful release notes

---

## Phase 7 — Post-Launch

- [ ] Issue label taxonomy: `bug`, `enhancement`, `question`, `good-first-issue`, `help-wanted`, `discussion`
- [ ] Add `good-first-issue` label to 3–5 beginner-friendly tasks (e.g., add a domain hint, improve error messages, write a test)
- [ ] Dependabot PRs reviewed and merged weekly
- [ ] Set up a release cadence (e.g., monthly, or per-fix)
- [ ] Monitor issues and respond within 48h

---

## Effort Estimate

| Phase | Effort | Can parallelize? |
|-------|--------|-----------------|
| 0 — Identity | 1–2h | Yes (rename plan exists) |
| 1 — First-Run Experience | 2–3h | No (needs testing) |
| 2 — CI & Automation | 1–2h | Yes |
| 3 — Content Pruning | 2–4h | Yes |
| 4 — README Rewrite | 2–3h | Yes |
| 5 — Pre-Launch Audit | 1–2h | Yes |
| 6 — Launch | 30min | No (must be last) |
| 7 — Post-Launch | Ongoing | N/A |

**Total up-front effort: ~10–18h**

---

## Risks

| Risk | Mitigation |
|------|-----------|
| Secrets in git history | Run git log search before launch. Use `git filter-repo` if found. |
| Rename breaks external references | Coordinate rename + code changes. Update remote URL. |
| Docker build is slow on first clone | Document expected build time. Use Docker layer caching. |
| `cloakbrowser` dependency is proprietary or has restrictive license | Check its license. Have a fallback (chromium backend is always available). |
| Low issue/PR volume after launch | Set realistic expectations. Maintainer responds within 48h to build trust. |
| Users confused by devtools vs main tools | README should clearly separate "core tools" from "optional devtools". |
