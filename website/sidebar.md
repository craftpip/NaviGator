# Sidebar Navigation

## Goal

The menu bar (nav) should not hold links to all the pages. The nav has been updated and lost the page links — that's fine. Instead, all pages should be listed in the **sidebar** as a collapsible tree.

## Structure

- Sidebar shows a **tree of all articles**.
- **Main article groups first** (the top-level sections).
- Opening a main article group expands its inner articles **in the sidebar only** — a collapsible tree.

## Organization Decisions (2026-08-20)

- **Docker is the only recommended install method.** A manual install (Node.js) option still exists — not a problem, just not the default pitch.
- **"First Search" and "Client Configuration" are folded into the quick start** — the user does not want them as separate sidebar items. They belong inside the quick-start content.
- **The current sidebar organization is rejected.** "Getting Started is a whole thing" — do not wrap quick starts under a "Getting Started" group; the user wants a different arrangement (exact structure to be confirmed with the user before implementing).