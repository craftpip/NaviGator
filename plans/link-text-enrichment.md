# Link text enrichment — solve numeric link ambiguity

## Problem

The web_fetch output uses `[text][ref_id]` to mark inline links. When
the link text itself is a number (star counts, fork counts, etc.), the
output becomes visually ambiguous — the LLM can't tell which `[number]`
is the link text and which is the ref_id marker.

### Example

```
Python [5][88] [1][89]
JavaScript [114][91] [20][92]
```

Here `[5]`, `[114]`, `[1]`, `[20]` are **link text** (star/fork counts),
and `[88]`, `[89]`, `[91]`, `[92]` are **ref_ids**. They look identical.

On top of that, the global link registry `linkMemoryByRef` is polluted
with navigation chrome links from the full-page HTML extraction, so an
LLM that guesses wrong resolves the number to a completely unrelated URL:

| Fake ref_id | Resolves to |
|-------------|-------------|
| `[1]` | `https://github.com/craftpip` (page URL) |
| `[5]` | `https://github.com/features/ai/github-app` (nav link) |
| `[20]` | `https://github.com/features` (nav link) |

### Root cause

The `extractLinksFromHtml()` function captures `<a>` elements and uses
`a.textContent` as link text. When visible text is just a number (star
count, fork count), there's nothing to distinguish it from a ref_id.
The formatter then produces `[5][88]` — two identical bracket-pairs.

Additionally, `extractLinksFromHtml()` registers every `<a>` from the
full page HTML (including navigation chrome), so the global ref_id pool
is full of unrelated URLs that happen to match the numeric text values.

### Impact

Numeric link text is common — star counts, fork counts, issue counts,
follower counts — any page with numbers as link text produces ambiguous
output. The LLM may:

- Follow the wrong ref_id to an unrelated page
- Misparse the output entirely and skip valid links
- Fail to navigate the link graph correctly

## Solution

Enrich numeric-only link text with accessibility attributes from the
`<a>` element. Instead of changing the `[text][ref_id]` format, improve
the `text` so it's never purely numeric.

```
<a href="/craftpip/stargazers" aria-label="5 stargazers">5</a>
```

Visible text is `5`. But `aria-label` gives "5 stargazers".

With enrichment:

```
Java [5 stargazers][88] [3 forks][89]
```

Now one bracket has words, the other has a reference number. No
ambiguity. No format change needed.

### Enrichment sources (per link, in priority order)

1. `aria-label` on the `<a>` element — accessibility label
2. `title` attribute on the `<a>` element — tooltip text
3. `alt` text of a child `<img>` (if link contains an image)
4. Parent element text minus the link text (e.g., "Stars 5" → "Stars")
5. Heuristic from URL path (e.g., `/stargazers` → "stargazers")

Stop at the first non-empty, non-numeric result. If all fail, keep
original numeric text.

### Where to change

`extractLinksFromHtml()` in `src/search.js`. The function already
returns `{ text, href, rel, type, context }` — just improve the `text`
field when it's purely digits (or very short).

### What this affects

- **Inline link replacement** (`[text][ref_id]`) — gets richer text,
  no more `[5][88]` ambiguity.
- **`web_page_links` output** — link listing shows descriptive text
  instead of bare numbers.
- No change to the registration flow, ref_id format, or tool APIs.

### Edge cases

- `aria-label` might duplicate the visible text ("Star 5 stargazers").
  Dedup: if label contains the visible number, trim the number from
  the label.
- Some `aria-label` values are long. Truncate at ~60 chars for inline
  display.
- Falls back cleanly — original numeric text kept if no enrichment
  source found (current behavior).
