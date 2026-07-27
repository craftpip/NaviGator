# Rename Project to NaviGator

## Why

The current name `browser-search-mcp` is descriptive but long, repetitive, and lacks identity. `NaviGator` is shorter, memorable, and hints at navigation (browser/search).

## Service / Container Identity

| Context | Current | New |
|---------|---------|-----|
| Display name | Browser Search MCP | NaviGator |
| npm package name | `browser-search-mcp` | `navigator-mcp` |
| Docker compose project name | `browser-search-mcp` | `navigator` |
| Docker compose service name | `browser-search-mcp` | `navigator` |
| Docker container name | `browser-search-mcp` | `navigator` |
| Docker image tag (compose build) | `browser-search-mcp-browser-search-mcp:latest` | `navigator-navigator:latest` *(see quirk below)* |
| Docker image tag (manual build hint) | `browser-search-mcp:latest` | `navigator:latest` |
| Landing container name | `browser-search-mcp-landing` | `navigator-landing` |
| Gluetun service name | `browser-search-mcp-gluetun` | `navigator-gluetun` |
| Gluetun container name | `browser-search-mcp-gluetun` | `navigator-gluetun` |
| Gluetun volume name | `browser-search-mcp_gluetun_chrome_profile_data` | `navigator_gluetun_chrome_profile_data` |
| Main volume name | `browser-search-mcp_chrome_profile_data` | `navigator_chrome_profile_data` |
| GitHub repo slug | `craftpip/browser-search-mcp` | `craftpip/navigator` |
| mcporter config label | `local-browser-search` | `local-navigator` (optional) |

## Files To Change (~60 matches across 20 files)

### 1. `package.json`

| Field | Current | New |
|-------|---------|-----|
| name | `browser-search-mcp` | `navigator-mcp` |
| description | `MCP server for real Chromium browser search and extraction` | `MCP server with a real browser for search, extraction, and screenshots` |
| repository.url | `github.com/craftpip/browser-search-mcp.git` | `github.com/craftpip/navigator.git` |
| homepage | `github.com/craftpip/browser-search-mcp#readme` | `github.com/craftpip/navigator#readme` |
| bugs.url | `github.com/craftpip/browser-search-mcp/issues` | `github.com/craftpip/navigator/issues` |

### 2. `package-lock.json`

- `name` field (line 2): `browser-search-mcp` → `navigator-mcp`
- Second occurrence (line 8): same
- (Auto-regenerated on `npm install`, but `name` field should be updated manually first to seed the right value)

### 3. `docker-compose.yml`

| Line | Current | New |
|------|---------|-----|
| 1 | `name: browser-search-mcp` | `name: navigator` |
| 4 | `browser-search-mcp:` | `navigator:` |
| 5 | `container_name: "browser-search-mcp"` | `container_name: "navigator"` |
| 70 | `name: browser-search-mcp_chrome_profile_data` | `name: navigator_chrome_profile_data` |

Optionally add an explicit `image: navigator:latest` under the service so `docker compose build` produces a clean tag instead of the redundant `navigator-navigator:latest`.

### 4. `docker-compose-gluten.yml`

| Line | Current | New |
|------|---------|-----|
| 2 | `browser-search-mcp-gluetun:` | `navigator-gluetun:` |
| 3 | `container_name: "browser-search-mcp-gluetun"` | `container_name: "navigator-gluetun"` |
| 49 | `http://browser-search-mcp-gluetun` | `http://navigator-gluetun` |
| 69 | `name: browser-search-mcp_gluetun_chrome_profile_data` | `name: navigator_gluetun_chrome_profile_data` |

The filename `docker-compose-gluten.yml` has a pre-existing typo ("gluten" vs "gluetun"). Optional: fix to `docker-compose-gluetun.yml` during rename.

### 5. `README.md`

| What | Current | New |
|------|---------|-----|
| Title (line 1) | `# Browser Search MCP Server` | `# NaviGator` |
| Subtitle (line 3) | `Browser Search MCP gives your MCP client a real browser for:` | `NaviGator gives your MCP client a real browser for:` |
| Git clone URL (line 126) | `github.com/craftpip/browser-search-mcp.git` | `github.com/craftpip/navigator.git` |
| cd command (line 127) | `cd browser-search-mcp` | `cd navigator` |
| MCP config path (line 207) | `/absolute/path/to/browser-search-mcp/src/mcp-server.js` | `/absolute/path/to/navigator/src/mcp-server.js` |
| MCP docker script path (line 226) | `/absolute/path/to/browser-search-mcp/scripts/mcp-stdio-docker.sh` | `/absolute/path/to/navigator/scripts/mcp-stdio-docker.sh` |

Any other mentions (project name in body text, etc.) throughout the file.

### 6. `AGENTS.md`

| Line | Current | New |
|------|---------|-----|
| 202 | `docker compose exec browser-search-mcp npm install --include=dev` | `docker compose exec navigator npm install --include=dev` |
| 203 | `docker compose exec browser-search-mcp npx vitest run` | `docker compose exec navigator npx vitest run` |
| 204 | `docker compose exec browser-search-mcp npx vitest run tests/mcp-server.test.js` | `docker compose exec navigator npx vitest run tests/mcp-server.test.js` |
| 275 | `docker cp /workspace/src/search.js browser-search-mcp:/app/src/search.js` | `docker cp /workspace/src/search.js navigator:/app/src/search.js` |
| 276 | `docker cp /workspace/src/mcp-server.js browser-search-mcp:/app/src/mcp-server.js` | `docker cp /workspace/src/mcp-server.js navigator:/app/src/mcp-server.js` |
| 277 | `docker cp /workspace/domain-hints.json browser-search-mcp:/app/domain-hints.json` | `docker cp /workspace/domain-hints.json navigator:/app/domain-hints.json` |
| 278 | `docker restart browser-search-mcp` | `docker restart navigator` |

### 7. `SKILL.md`

| Current | New |
|---------|-----|
| `# Browser Search MCP Skill` | `# NaviGator Skill` |
| `working with the browser-search-mcp project` | `working with the navigator project` |
| `docker build -t browser-search-mcp .` | `docker build -t navigator .` |
| `docker run -d --name browser-search-mcp ...` | `docker run -d --name navigator ...` |

### 8. `scripts/mcp-stdio-docker.sh`

| Current | New |
|---------|-----|
| `browser-search-mcp-browser-search-mcp:latest` | `navigator-navigator:latest` (see image tag quirk below) |
| `browser-search-mcp-landing` | `navigator-landing` |
| `docker build -t browser-search-mcp .` (hint text) | `docker build -t navigator .` |
| `docker tag browser-search-mcp:latest $IMAGE` | `docker tag navigator:latest $IMAGE` |

### 9. `scripts/mcp-stdio-docker.bat`

Same changes as the shell script above.

### 10. `scripts/clone-chrome-userdir.sh`

| Current | New |
|---------|-----|
| `SERVICE_NAME="${SERVICE_NAME:-browser-search-mcp}"` | `SERVICE_NAME="${SERVICE_NAME:-navigator}"` |
| `default: browser-search-mcp` (help text) | `default: navigator` |

### 11. `scripts/clone-chrome-userdir.bat`

| Current | New |
|---------|-----|
| `SERVICE_NAME=browser-search-mcp` | `SERVICE_NAME=navigator` |
| `default: browser-search-mcp` (help text) | `default: navigator` |

### 12. `scripts/test-transport-matrix.mjs`

| Current | New |
|---------|-----|
| `WORKDIR = "/mnt/c/www/browser-search-mcp"` | `WORKDIR = "/mnt/c/www/navigator"` |
| `docker exec browser-search-mcp-landing node ...` (3×) | `docker exec navigator-landing node ...` |
| `"browser-search-mcp-landing"` (docker exec target) | `"navigator-landing"` |

### 13. `scripts/test-mcporter.sh`

| Current | New | Note |
|---------|-----|------|
| `SERVER_NAME="local-browser-search"` | `SERVER_NAME="local-navigator"` (optional) | This is an mcporter config label, not the project name |

### 14. `.github/ISSUE_TEMPLATE/bug_report.md`

- `about: Report a problem with Browser Search MCP` → `about: Report a problem with NaviGator`

### 15. `.github/ISSUE_TEMPLATE/feature_request.md`

- `about: Suggest an improvement for Browser Search MCP` → `about: Suggest an improvement for NaviGator`

### 16. `CONTRIBUTING.md`

- `Thanks for contributing to Browser Search MCP.` → `Thanks for contributing to NaviGator.`

### 17. `typedoc.json`

- `"name": "Browser Search MCP"` → `"name": "NaviGator"`

### 18. `tests/domain-hints.test.js` and `tests/domain-hints-live.test.js`

- `repo: "/craftpip/browser-search-mcp"` → `repo: "/craftpip/navigator"`

This is a sample URL in test data for GitHub issues path matching. After repo rename, the sample data becomes misleading.

### 19. `web-fetch-docs.md`

- `docker exec browser-search-mcp curl ...` (line 432) → `docker exec navigator curl ...`

### 20. `websites/README.md`

- `docker exec browser-search-mcp sh -c "curl ... web_fetch ..."` (line 8-9) → `docker exec navigator sh -c "curl ..."`
- `docker exec browser-search-mcp curl -s "http://localhost:3000/extract?...` (line 50) → `docker exec navigator curl -s ...`

### 21. `notes/extraction-patterns.md`

- `**browser-search-mcp** (us)` (line 18) → `**NaviGator** (us)`

## Files Verified As Clean (No References)

These were checked and contain no project name references:

- `src/` (all .js files) — zero matches
- `docker/entrypoint.sh` — zero matches
- `__mocks__/` — zero matches
- `.env` — zero matches
- `.github/workflows/release.yml` — zero matches
- `.github/pull_request_template.md` — zero matches
- `benchmarking/` — zero matches
- `comparison/` — zero matches
- `screenshots/` — zero matches
- `SECURITY.md` — zero matches
- `CODE_OF_CONDUCT.md` — zero matches
- `Dockerfile` — zero matches

## Quirks & Edge Cases

### 1. Docker image tag redundancy

Docker Compose auto-generates image tags as `<project_name>-<service_name>:latest`. With `name: navigator` and service `navigator`, this becomes `navigator-navigator:latest` — redundant.

**Options:**
- **A (recommended)**: Add `image: navigator:latest` explicitly in `docker-compose.yml` under the service. This gives a clean tag, and `docker compose build` will tag it correctly. The scripts reference `$IMAGE` via `MCP_DOCKER_IMAGE` env var, so they're independent.
- **B**: Accept `navigator-navigator:latest` as the default in scripts. Consistent with current pattern, but ugly.
- **C**: Change the service name to something different from the project name (e.g., `name: navigator`, service: `app` → image: `navigator-app:latest`). This changes more surface area unnecessarily.

### 2. `docker-compose-gluten.yml` filename typo

The file is `docker-compose-gluten.yml` but all internal references say "gluetun" (GlueTun is a VPN container). Pre-existing bug. Optionally fix to `docker-compose-gluetun.yml` during rename — but it would break any external scripts referencing the old filename.

### 3. `mcporter` config label

`scripts/test-mcporter.sh` uses `SERVER_NAME="local-browser-search"`. This is a local config label, not published anywhere. Optional to rename to `local-navigator`. Low impact either way.

### 4. npm package name collision

Check if `navigator-mcp` is taken on npm before finalizing. The package isn't published today, but the name should be available.

If `navigator-mcp` is taken, alternatives:
- `@craftpip/navigator-mcp` (scoped)
- `navigator-mcp-server`
- `navi-gator-mcp`

### 5. `package-lock.json` auto-regeneration

`npm install` rewrites `package-lock.json`. The `name` field in there should match `package.json` after the rename, but it may shuffle lockfile entries. This is normal.

### 6. Sample URL in test data lasts forever

`tests/domain-hints.test.js` uses `"/craftpip/browser-search-mcp"` as a sample GitHub repo path for hint matching. This test data will be slightly misleading after the rename. Functionally harmless, but worth updating for consistency.

### 7. README has MCP client config examples

Lines 207 and 226 show absolute paths with `browser-search-mcp` in them. Users who copied these paths will need to update their MCP client configs. The plan covers updating the file, but this is an external-facing change (covered in Risk Areas).

## Things To Keep (Not Rename)

| Context | Value | Reason |
|---------|-------|--------|
| Display name | `NaviGator` | Mixed case, proper name |
| npm package name | `navigator-mcp` | npm requires lowercase, `-mcp` suffix avoids collision |
| Docker names | `navigator` | Lowercase, Docker convention |
| GitHub slug | `navigator` | Lowercase, URL convention |
| MCP tool names | `web_search`, `web_fetch`, etc. | These are tool names, not project name |
| Env vars | `BROWSER_BACKEND`, `MCP_API_PORT`, etc. | Not project-specific |

## Order Of Operations

1. Do all file edits in one batch.
2. Run `npm install` to update `package-lock.json`.
3. Run `npx vitest run` to verify nothing broke.
4. **Decide on Docker image tag approach** (add `image:` or accept redundancy).
5. Build and restart Docker:
   ```bash
   docker compose down
   docker compose build
   docker compose up -d
   ```
6. Verify health: `docker exec navigator curl -s localhost:3000/health`
7. Clean up old resources:
   ```bash
   docker rm browser-search-mcp browser-search-mcp-landing
   docker volume rm browser-search-mcp_chrome_profile_data
   docker volume rm browser-search-mcp_gluetun_chrome_profile_data
   ```
8. Rename repo on GitHub. Update remote:
   ```bash
   git remote set-url origin git@github.com:craftpip/navigator.git
   ```

## Risk Areas

- **External references**: Any docs, blog posts, or MCP client configs referencing `browser-search-mcp` will break. This plan only covers in-repo references.
- **Running containers**: Old containers named `browser-search-mcp` persist after rename. Docker Compose with new names won't touch them. Explicit cleanup needed (covered above).
- **Volume orphans**: Old named volumes will persist. Explicit cleanup needed (covered above).
- **GitHub rename timing**: If the repo rename and the code rename happen at different times, there's a window where the code says one thing and the URL says another. Tests will likely pass either way since the test data URL is just a sample string.
- **npm name collision**: `navigator-mcp` must be checked on npmjs.com before finalizing.
- **`docker-compose-gluten.yml` filename**: If renamed to fix the typo, any external automation referencing the old filename breaks.
