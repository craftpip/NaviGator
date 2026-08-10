# Navigator Console — Redesign Plan

## Plan Status

**Status: GATHERING REQUIREMENTS** — created 2026-08-11. User is dictating
desired improvements live. This is a fresh plan; an earlier improvement plan
(`plans/web-console-improvements.md`, IN PROGRESS) covers a different
requirement set — keep the two from colliding.

### Checklist

- [ ] Collect user requirements (User Request Log below).
- [ ] Group into improvement areas, rank by leverage, confirm scope.
- [ ] Write per-area implementation sub-plans.
- [ ] Implement, build (`npm run console:build`), deploy (image rebuild + container recreate), verify live.

---

## 1. User Request Log

| # | Date | Request | Status |
|---|------|---------|--------|
| 1 | 2026-08-11 | _awaiting first request — user will dictate_ | new |

---

## 2. Improvement Areas

(to be filled once requirements are collected)

---

## 3. Context — the frontend environment

See `plans/web-console-improvements.md` §1 for the full environment map
(React 19 + Vite 7, `web-console/src/main.jsx` single 68-line file, served
from `/web-console` in the image, build via `npm run console:build`).

Key facts:
- Entire app lives in `web-console/src/main.jsx` (~34KB, 68 dense lines).
- All CSS in `web-console/src/style.css` (~13KB, 7 lines).
- No TypeScript, no test coverage for the console, ESLint covers `web-console/src/`.
- Console served from image (`WEB_CONSOLE_DIR`), NOT the bind mount — image rebuild required.
- This host has no docker compose: `docker build -t navigator:latest .` + manual recreate.

---

## 4. Out of scope (for now)

- TBD once requirements are known.

## 5. How to verify a change

1. `npm run console:build` (needs dev deps — reinstall after any container restart).
2. `npm run lint` clean over `web-console/src/`.
3. Rebuild image + recreate container (this host has no docker compose).
4. Hard-refresh `http://10.69.1.164:3000/console`, verify each mode renders,
   live dot updates every 2 s, dark/light toggle, and no console errors.
