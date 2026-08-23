# Interaction

Click buttons, fill forms, and interact with live web pages. Our input tools resolve CSS/XPath before acting and return synthesized results with helpful failures — not raw CDP `Input` events.

## Input.dispatchMouseEvent

Click an element by CSS or XPath. Scrolls it into view first; fails with page URL + candidate clickables if nothing matches.

**Request**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `targetId` | `string` | — | Target id |
| `selector` | `string` | — | CSS selector of the element to click |
| `xpath` | `string` | — | XPath of the element to click |
| `button` | `string` | `left` | `left`, `right`, or `middle` |
| `clickCount` | `number` | `1` | Number of clicks (1–3) |


Response:

```json
{
  "targetId": "ABC",
  "clicked": true,
  "button": "left",
  "clickCount": 1,
  "point": { "x": 512, "y": 320, "tagName": "button", "found": true }
}
```

Standard CDP `Input.dispatchMouseEvent` needs raw `x,y` — we resolve the element for you.

## Input.insertText

Focus an input, clear it, and type `text` char-by-char. Requires a selector/xpath that resolves to an editable element.

**Request**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `targetId` | `string` | — | Target id |
| `selector` | `string` | — | CSS selector of the editable element |
| `xpath` | `string` | — | XPath of the editable element |
| `text` | `string` | — | The text to type (clears existing value first) |


Response:

```json
{
  "targetId": "ABC",
  "focused": true,
  "clearedExistingValue": "old@example.com",
  "finalValue": "user@example.com"
}
```

Clears any existing `value` first, then types with `HUMAN_TYPING_DELAY`. Standard CDP has no `insertText` — we synthesize `focused`/`clearedExistingValue`/`finalValue`. Fails with editable candidates if selector doesn't match an input.

## Input.dispatchKeyEvent

Press a key, optionally with modifiers. Synthetic events can't trigger browser shortcuts (Ctrl+R, etc.) — use `Page.reload` instead.

**Request**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `targetId` | `string` | — | Target id |
| `key` | `string` | — | Key to press — `Enter`, `Tab`, `Escape`, `ArrowUp`, `Backspace`, `a`, etc. |
| `modifiers` | `string[]` | — | Modifiers to hold — `Control`, `Shift`, `Alt`, `Meta` |
| `text` | `string` | — | Text to inject for text keys |


Response:

```json
{
  "targetId": "ABC",
  "pressed": "Enter",
  "modifiers": []
}
```

With modifiers: `Input.dispatchKeyEvent({ targetId: "ABC", key: "a", modifiers: ["Control"] })` — holds `Control`, presses `a`, releases. Returns `pressed` and `modifiers` echo.

## DOM.scrollIntoViewIfNeeded

Scroll an element into view before interacting.

**Request**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `targetId` | `string` | — | Target id |
| `selector` | `string` | — | CSS selector |
| `xpath` | `string` | — | XPath |


Response:

```json
{ "ok": true }
```

Fails with page URL + interactive candidates if selector doesn't match.

## Example: Filling a Search Form






## Limitations

- **No browser shortcuts** — synthetic keys can't trigger Ctrl+R/W, etc. Use `Page.reload`/`Page.goBack`.
- **No drag and drop** — only click and type.
- **No file upload** — can't interact with file input dialogs.
- **Typing delay** — `HUMAN_TYPING_DELAY` adds per-char delay.

## Tips

- **Find the selector first** — `DOM.getDocument` → `DOM.querySelector` → then `dispatchMouseEvent`/`insertText`
- **Scroll before clicking** — `DOM.scrollIntoViewIfNeeded` if element is off-screen
- **Check `Network.getRequests`** after clicks to confirm API calls
- **Use `Runtime.evaluate`** for custom interactions

## Next Steps

- [Network & Console](/guides/devtools/network) — Monitor requests
