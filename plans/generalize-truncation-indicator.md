# General Truncation Indicator for web_fetch

## Problem

When `web_fetch` returns truncated content, the LLM doesn't know it's
looking at incomplete data. This applies to:

- Truncated article text (Readability / sections text)
- Truncated tables (missing rows)
- Any other appended content that exceeds the response budget

## How It Works Today

1. `maxChars` truncates the Readability/article **text** to N chars
   inside `extractTextFromHtml` via `safeTruncateText`.
2. Tables are extracted separately from the DOM and are **not** limited
   by `maxChars`.
3. Tables are appended to the truncated text in `browserOpenAndExtract`
   via `insertTablesInline`.
4. Result: total output can far exceed `maxChars`. No indicator anywhere
   that says the data was clipped.

## Design Choice Needed

### A) Fix truncation + general note

Re-truncate the **whole** output (text + tables) to `maxChars` after
tables are inserted. Append a note at the end:

> *(Response truncated at maxChars characters — increase maxChars to see
> more)*

This makes `maxChars` honest for the entire reply. It's a behavior change
for anyone relying on full tables regardless of maxChars.

### B) Just add awareness

Leave behavior unchanged. Append the truncation note only when the full
output exceeds `maxChars`, without re-truncating. No behavior change,
just a flag.

## Where To Add The Note

### Option A (re-truncate)

`browserOpenAndExtract` in `src/search.js` — after `insertTablesInline`:

```js
let finalText = selectedText || extracted.text || "";
// ... links extraction ...
if (extracted.tables?.length) {
  finalText = stripTableNoise(finalText);
  finalText = insertTablesInline(finalText, extracted.tables);
}

// NEW: re-truncate whole output to maxChars
if (maxChars && finalText.length > maxChars) {
  finalText = finalText.slice(0, maxChars);
  finalText += `\n\n*(Response truncated at ${maxChars} characters — increase maxChars to see more)*`;
}
```

### Option B (just awareness)

Same place, same check — but no `slice`, just append the note:

```js
if (maxChars && finalText.length > maxChars) {
  finalText += `\n\n*(Response truncated — increase maxChars to see more)*`;
}
```

## Caveats

- Integration tests may need updating if output lengths change.
- Option A is a breaking behavior change for some callers.
- The note uses markdown `*(italic)*` so the LLM notices it naturally.
