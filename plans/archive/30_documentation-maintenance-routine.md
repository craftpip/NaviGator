# Plan 30 — Documentation Maintenance Routine

**Status:** Draft
**Created:** 2026-08-18
**Purpose:** Establish a repeatable, diff-driven routine to keep documentation accurate as the codebase evolves. Uses a "Last doc update" timestamp in the README and `git diff` to check only what actually changed — no blind full-repo scans.

---

## Problem

Documentation drift is silent and cumulative. Features get implemented, config vars change, tools are added or removed — and the docs lag behind. The current state confirms this:

- **CHANGELOG.md** is missing ~12+ implemented features (web_page_ascii, DevTools MCP tools, wildcard hints, console redesign, AI-model extractors, etc.)
- **`default.tables`** mode (`all`/`content`/`disabled`) is documented in 4 files but was removed from the schema
- **`DEFAULT_EXTRACT_SKIP_SELECTORS`** is referenced as a live constant but was removed per Plan 26
- **`POST_PROCESSOR_MODELS`** is missing from the primary config reference
- **Wildcard hint** (`domain: "*"`) is not documented in the extraction hints guide

The existing rules (`docs/code/README.md:15`, `docs/README.md:37`) already say "update docs when behavior changes" — but there's no routine to actually do it.

---

## Timestamp Convention

Add a visible **"Last doc update"** date to the README so anyone (human or agent) can see when docs were last checked against code:

```markdown
> **Last doc update:** 2026-08-18
```

Place it right after the badge line (line 5) in `README.md`. This date is the anchor for all diff-driven checks — every routine command reads it and runs `git diff <date>` to find what changed since the last update.

---

## Documentation Layer Model

Understanding what lives where prevents duplication and keeps each layer focused:

| Layer | File(s) | Audience | Updates on |
|---|---|---|---|
| **Agent reference** | `AGENTS.md` | AI agents working on the codebase | Every session — tool contracts, learned patterns, fix patterns |
| **Public intro** | `README.md` | Humans evaluating/using the project | Major releases — features, quick-start, FAQ |
| **Structured docs** | `docs/**/*.md` | Developers maintaining the project | Behavior changes — new modules, config vars, tool schemas, API changes |
| **Plans** | `plans/*.md` | The person implementing a feature | During implementation — status, decisions, verification |
| **Changelog** | `CHANGELOG.md` | Everyone | Every release — new features, fixes, breaking changes |
| **Source map** | `docs/reference/source-reference.md` | Developers locating code | New/removed modules |

**Rule:** Each layer has one purpose. Don't put changelog entries in AGENTS.md. Don't put architecture details in README.md. Don't put implementation plans in docs/.

---

## Routine: Three Checkpoints

### Checkpoint 1: During Implementation (Before Code Changes)

When starting work on any feature, fix, or refactor:

1. **Identify affected docs** — ask: "Which documented behavior am I changing?"
   - New/changed tool → `docs/api/tool-reference.md`, `docs/api/mcp-and-http.md`
   - New/changed config var → `docs/operations/operations-and-configuration.md`, `docs/code/support-modules.md`
   - New/changed module → `docs/code/*.md`, `docs/reference/source-reference.md`
   - New search engine → `docs/search/search-and-drivers.md`, `docs/code/search-drivers.md`
   - Extraction change → `docs/extraction/extraction-and-hints.md`
   - Browser/runtime change → `docs/architecture/browser-runtime.md`, `docs/code/browser-and-devtools.md`

2. **Add a todo** for doc update — don't defer it. The doc update is part of the feature, not follow-up work.

3. **Note the change for CHANGELOG** — add a line to the `[Unreleased]` section immediately.

### Checkpoint 2: Before Committing

After implementing, before `git commit`:

1. **Run the diff-driven doc check** (see §Routine Commands below)
2. **Update every affected doc** — edit in the same commit as the code change
3. **Verify no stale references** — search for removed constants, deleted config vars, old tool names
4. **Update CHANGELOG** `[Unreleased]` section with Added/Changed/Fixed/Removed entries
5. **Bump the "Last doc update" timestamp** in README.md to today's date

### Checkpoint 3: Weekly Review (or Before Release)

A dedicated pass to catch anything that slipped through:

1. **Read the "Last doc update" timestamp** from README.md
2. **Run the full diff-driven doc audit** (see §Routine Commands below)
3. **Fix all findings** — each fix is a small, targeted edit
4. **Archive completed plans** — move `plans/NN_*.md` to `plans/archive/` when fully implemented and documented
5. **Verify docs index** — `docs/README.md` table matches actual files in `docs/`
6. **Bump the "Last doc update" timestamp** in README.md to today's date

---

## Routine Commands

All routines read the "Last doc update" date from `README.md` and use `git diff <date>` to find what actually changed. This avoids blind full-repo scans and focuses effort on real drift.

### Read the Timestamp

```bash
cd /www1/navigator
# Extract the last doc update date from README.md
DOC_DATE=$(grep -oP 'Last doc update:\s*\K\d{4}-\d{2}-\d{2}' README.md)
echo "Checking changes since: $DOC_DATE"
```

### Diff-Driven Doc Check (Fast — ~30 seconds)

Run before committing. Uses the diff to check only affected docs:

```bash
# 1. See what source files changed since last doc update
git diff --name-only "$DOC_DATE" -- 'src/*.js' 'src/engines/*.js'

# 2. For each changed file, check if its corresponding doc was also updated
#    src/config.js         → docs/operations/operations-and-configuration.md
#    src/mcp-server.js     → docs/api/tool-reference.md, docs/api/mcp-and-http.md
#    src/search.js         → docs/search/search-and-drivers.md, docs/extraction/extraction-and-hints.md
#    src/browser.js        → docs/architecture/browser-runtime.md, docs/code/browser-and-devtools.md
#    src/engines/*.js      → docs/search/search-and-drivers.md, docs/code/search-drivers.md
#    src/devtools.js       → docs/code/browser-and-devtools.md
#    src/extractors/*.js   → docs/extraction/extraction-and-hints.md

# 3. Quick: find stale references to removed symbols
grep -rn 'DEFAULT_EXTRACT_SKIP_SELECTORS\|DEFAULT_EXTRACT_FORMAT\|DEFAULT_EXTRACT_STABILIZE\|DEFAULT_EXTRACT_WAIT\|DEFAULT_EXTRACT_POST' docs/ AGENTS.md README.md
grep -rn '"tables".*all\|"tables".*content\|"tables".*disabled\|default\.tables\|tables.*toggle' docs/ AGENTS.md README.md
```

### Full Doc Audit (Thorough — ~5 minutes)

Run weekly or before a release. Uses diff for targeted checks plus broad sweeps:

```bash
# 4. See all commits since last doc update
git log --oneline "$DOC_DATE"..HEAD

# 5. Check CHANGELOG [Unreleased] covers those commits
#    (manual review — compare commit list against CHANGELOG entries)

# 6. Check all docs/ files are linked from docs/README.md
for f in docs/**/*.md; do
  basename="${f#docs/}"
  grep -q "$basename" docs/README.md || echo "UNLINKED: $f"
done

# 7. Check plans/ for stale "Implemented" plans not yet archived
grep -l "Implemented\|COMPLETE" plans/*.md 2>/dev/null

# 8. Check for new tools not in tool-reference.md
grep -oP "name:\s*\"(\w+)\"" src/mcp-server.js src/devtools.js | sort -u > /tmp/actual_tools.txt
grep -oP '### \w+' docs/api/tool-reference.md | sed 's/### //' | sort -u > /tmp/doc_tools.txt
diff /tmp/actual_tools.txt /tmp/doc_tools.txt
```

### After Updating Docs — Bump the Timestamp

```bash
# Update the "Last doc update" date in README.md to today
sed -i "s/Last doc update: [0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}/Last doc update: $(date +%Y-%m-%d)/" README.md
```

---

## What To Update: Decision Matrix

| What Changed | Where to Update |
|---|---|
| New MCP tool | `docs/api/tool-reference.md`, `docs/api/mcp-and-http.md`, `CHANGELOG.md` |
| Tool input/output changed | `docs/api/tool-reference.md`, `AGENTS.md` (if agent-facing) |
| New env var | `docs/operations/operations-and-configuration.md`, `docs/code/support-modules.md` |
| Env var removed/renamed | Same files + `CHANGELOG.md` (Breaking section) |
| New module added | `docs/reference/source-reference.md`, relevant `docs/code/*.md` |
| Module removed | Same files + update all cross-references |
| New search engine/driver | `docs/search/search-and-drivers.md`, `docs/code/search-drivers.md` |
| Extraction behavior changed | `docs/extraction/extraction-and-hints.md` |
| Browser/backend change | `docs/architecture/browser-runtime.md`, `docs/code/browser-and-devtools.md` |
| Domain hint schema changed | `docs/extraction/extraction-and-hints.md` (this is the highest-drift file — check carefully) |
| Console/UI changed | `docs/operations/operations-and-configuration.md` (if backend endpoint changed) |
| Bug fix | `CHANGELOG.md` (Fixed section) |
| Plan implemented | `plans/archive/`, `CHANGELOG.md` (Added section), relevant `docs/` files |

---

## Anti-Patterns

1. **"I'll update docs later"** — You won't. The doc update is part of the change.
2. **"It's a small change, docs don't need updating"** — Small changes accumulate. If the behavior a doc describes changed, the doc is wrong.
3. **"The code is self-documenting"** — Code shows what it does. Docs explain why, what the constraints are, and what breaks if you change it.
4. **Updating AGENTS.md but not docs/** — AGENTS.md is for agents. `docs/` is for humans. Both need to be current.
5. **Adding new config vars without adding them to the operations doc** — `docs/operations/operations-and-configuration.md` is the primary config reference. If a var isn't there, it doesn't exist to anyone reading the docs.

---

## Existing Maintenance Rules (For Reference)

These rules already exist in the codebase and should be honored:

- `docs/code/README.md:15` — "Update the owning guide whenever a behavior, condition, fallback, storage contract, operational limit, or safe change boundary changes."
- `docs/README.md:37` — "The code is the source of truth. These documents describe the current source tree under `src/`; update the relevant page when a public tool, module contract, route, or configuration behavior changes."
- `AGENTS.md` Code Philosophy — "Every change should make the system easier to change next time." Documentation is part of that.

---

## Verification

After implementing this routine:

1. Add the "Last doc update: YYYY-MM-DD" line to README.md
2. Fix the current known gaps (§Problem section above)
3. Bump the timestamp after fixes
4. Run the full doc audit — should return clean
5. Verify docs/README.md table links match actual files
6. Verify CHANGELOG [Unreleased] has entries for all features since 1.0.1
