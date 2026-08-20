# Navigator Website

VitePress-powered documentation site for the Navigator MCP server.

## Ideas & Specs Workflow (IMPORTANT)

Every user instruction/idea for the website is captured in **`ideas/`** BEFORE implementation. **This is the single source of truth.** Nothing the user says is lost to context limits.

Flow: **user says → write to `ideas/INDEX.md` → implement → mark done.**

See [`ideas/INDEX.md`](ideas/INDEX.md) for the full spec. When implementing a website change, always read `ideas/INDEX.md` first.

## Quick Start (Dev with Hot Reload)

```bash
cd website
npm install
npm run docs:dev
```

Opens at `http://localhost:5431` with full hot reload. Edit any `.vue`, `.css`, or `.md` file and the browser updates instantly.

> **Port 5431 is the permanent dev port for this container** — it is bound/published at the host. The `docs:dev` script already passes `--host 0.0.0.0 --port 5431`, so the site is reachable from the network at `http://10.69.1.164:5431/` (adjust the IP to the host's LAN address).

> **Verify via the live dev server, not builds.** The dev server hot-reloads changes instantly — you do NOT need to run `npm run docs:build` to verify an edit. Check the page at `http://localhost:5431/` (or run `curl` against it) after making changes. `docs:build` is only needed when shipping the static site to `dist/`.

> **A dev server is already running (as of 2026-08-20).** The user keeps `npm run docs:dev` running on port 5431 with hot reload — just make the edit and refresh/curl; do not build. If it ever stops, restart with `nohup npm run docs:dev > /tmp/vitepress-dev.log 2>&1 &`.

## Run in Background

```bash
cd website
nohup npm run docs:dev > /tmp/vitepress-dev.log 2>&1 &
```

Server starts on port 5431 bound to all interfaces. Logs go to `/tmp/vitepress-dev.log`.

```bash
# Check if running
curl -s -o /dev/null -w '%{http_code}' http://localhost:5431/

# Stop it
pkill -f "vitepress dev"   # or: pkill -f "npm run docs:dev"
```

## Build & Preview

```bash
npm run docs:build    # Output → .vitepress/dist/
npm run docs:preview  # Preview the built site locally
```

## Directory Structure

```
website/
├── index.md                          # Landing page (uses <LandingPage /> component)
├── ideas/                            # ★ Single source of truth for website ideas/specs
│   └── INDEX.md                      #   Every user instruction is captured here first
├── package.json                      # VitePress dev dependency
├── public/                           # Static assets copied to dist/
│   ├── navigator-logo.png
│   ├── console-dark.jpg              # Console screenshot (dark theme)
│   ├── console-light.jpg             # Console screenshot (light theme)
│   └── console-screenshot.jpg
├── .vitepress/
│   ├── config.mjs                    # VitePress config: nav, sidebar, social, search, footer
│   ├── theme/
│   │   ├── index.js                  # Registers LandingPage component + custom CSS
│   │   ├── custom.css                # VitePress overrides + landing page design tokens
│   │   └── components/
│   │       ├── LandingPage.vue       # Full landing page (hero, features rows, why, audience, CTA)
│   │       ├── ForestCanvas.vue      # Hero background animation (forest/trees canvas)
│   │       ├── AuroraCanvas.vue      # Alternative hero animation (aurora, not currently used)
│   │       └── ParticleCanvas.vue    # Alternative hero animation (particles, not currently used)
│   └── dist/                         # Built output (committed for GitHub Pages)
├── guides/
│   ├── quick-start-docker.md         # Docker quickstart
│   ├── quick-start-nodejs.md         # Node.js quickstart
│   ├── first-search.md               # First search walkthrough
│   ├── client-config.md              # MCP client configuration recipes
│   ├── search/
│   │   ├── overview.md               # web_search overview
│   │   ├── engines.md                # Search engines, routes, backends
│   │   ├── results.md                # Result format and ref_ids
│   │   └── tips.md                   # Advanced search techniques
│   ├── extraction/
│   │   ├── overview.md               # web_fetch overview
│   │   ├── formats.md                # Extractor format options
│   │   ├── domain-hints.md           # Per-site extraction rules
│   │   ├── links.md                  # Link following with ref_ids
│   │   └── ai-extractors.md          # AI model extractors (reader-lm, MinerU)
│   ├── screenshots/
│   │   ├── overview.md               # web_page_screenshot overview
│   │   ├── ascii.md                  # ASCII half-block renders
│   │   └── output.md                 # Output modes (base64, file, url)
│   ├── devtools/
│   │   ├── overview.md               # DevTools overview (19 CDP tools)
│   │   ├── dom.md                    # DOM inspection tools
│   │   ├── interaction.md            # Click, type, keyboard
│   │   └── network.md                # Network + console monitoring
│   └── self-hosting/
│       ├── overview.md               # Self-hosting overview + architecture
│       ├── docker.md                 # Docker Compose configuration
│       ├── env-vars.md               # Environment variables reference
│       ├── security.md               # Security hardening
│       └── monitoring.md             # Monitoring, health, CLI
└── reference/
    ├── tools.md                      # Complete API reference (24 tools)
    └── architecture.md               # Internal architecture
```

## Content Status

**All 27 guide/reference pages are fully written** with multiple paragraphs, code examples, tables, and cross-links. No stubs or placeholders.

**Missing:**
- `changelog.md` — linked from nav bar and landing page footer but file does not exist (VitePress `ignoreDeadLinks: true` hides this).
- Landing page "Get Started" links point to `/getting-started` which doesn't exist — should be `/guides/quick-start-docker`. (Not yet fixed — user should confirm the target.)

## Theme Components

| Component | Purpose | Status |
|---|---|---|
| `LandingPage.vue` | Full landing page with hero, feature rows, "Why Navigator", audience cards, CTA | **Active** |
| `ForestCanvas.vue` | Canvas animation behind hero (tree/forest silhouette) | **Active** (used in LandingPage) |
| `AuroraCanvas.vue` | Aurora borealis canvas animation | **Unused** (available as alternative) |
| `ParticleCanvas.vue` | Particle field canvas animation | **Unused** (available as alternative) |

## Nav Structure

- **Home** → `/`
- **Docs** → `/guides/quick-start-docker`
- **Changelog** → `/changelog` (missing file)

Each guide section has its own sidebar defined in `.vitepress/config.mjs`.

## Console Screenshot Instructions (for agents)

When retaking console screenshots for the landing page:
- Viewport: **1440×900**, `fullPage: false`, quality **80**
- Toggle Dark/Light via the actual button (not `classList.toggle`)
- Copy from container: `docker cp navigator:/tmp/console-*.jpg /www1/navigator/website/public/`
