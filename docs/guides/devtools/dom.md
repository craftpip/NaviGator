# DOM Inspection

Read the structure of any web page — find elements, get their HTML, and understand the layout. Our DOM tools return **LLM-friendly descriptors** with `selector`, `xpath`, `attributes`, `value`, `visible`, and `rect` — not just CDP nodeIds.

## DOM.getDocument

Discover the page — returns a snapshot of important elements with selectors you can use directly.

**Request**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `targetId` | `string` | — | Target id from `Target.createTarget` |
| `limit` | `number` | `15` | Max elements to include |


Response — `handleDevtoolsToolCall` returns:

```json
{
  "targetId": "ABC",
  "title": "Example Domain",
  "url": "https://example.com/",
  "readyState": "complete",
  "elements": [
    {
      "tagName": "h1",
      "role": "",
      "text": "Example Domain",
      "selector": "html > body > div > h1",
      "xpath": "/html[1]/body[1]/div[1]/h1[1]",
      "attributes": {},
      "value": "",
      "visible": true,
      "rect": { "x": 384, "y": 142, "width": 1152, "height": 28 }
    }
  ]
}
```

Each element shows `tagName`, `role`, `text` (300 chars), `selector` (cssPath), `xpath`, `attributes` (real DOM attrs only), `value` (for inputs), `visible`, and `rect`. Standard CDP `DOM.getDocument` returns a full node tree with `nodeId`s — we return this filtered, LLM-ready list from a fixed selector set (`main`, `article`, `h1`, `button`, `a[href]`, `input`, etc.), deduped by `selector`.

## DOM.querySelector

Find one element by CSS or XPath. Fails with page URL + candidate elements if nothing matches.

**Request**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `targetId` | `string` | — | Target id |
| `selector` | `string` | — | CSS selector, e -> `input[type='password']` |
| `xpath` | `string` | — | XPath, e -> `/html/body/form/div[2]/input` |


Response:

```json
{
  "tagName": "input",
  "role": "",
  "text": "",
  "selector": "html > body > main > form > input[type='email']",
  "xpath": "/html[1]/body[1]/main[1]/form[1]/input[1]",
  "attributes": { "type": "email", "name": "email" },
  "value": "",
  "visible": true,
  "rect": { "x": 24, "y": 120, "width": 400, "height": 36 }
}
```

One of `selector` or `xpath` required. Standard CDP returns `nodeId` — we return the descriptor above.

## DOM.querySelectorAll

Find many elements. Returns an array of descriptors (same shape as `querySelector`).

**Request**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `targetId` | `string` | — | Target id |
| `selector` | `string` | — | CSS selector to match many |
| `xpath` | `string` | — | XPath to match many |
| `limit` | `number` | `10` | Max descriptors to return |


Response:

```json
[
  {
    "tagName": "a",
    "role": "",
    "text": "Docs",
    "selector": "html > body > header > nav > a:nth-of-type(1)",
    "xpath": "/html[1]/body[1]/header[1]/nav[1]/a[1]",
    "attributes": { "href": "/docs" },
    "value": "",
    "visible": true,
    "rect": { "x": 10, "y": 10, "width": 40, "height": 20 }
  }
]
```

## DOM.getOuterHTML

Get outerHTML for a selector/xpath, or smart main-content HTML when no locator is given.

**Request**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `targetId` | `string` | — | Target id |
| `selector` | `string` | — | CSS selector, e -> `main` |
| `xpath` | `string` | — | XPath |
| `maxChars` | `number` | `10000` | Max characters of HTML to return |


Response:

```json
{
  "outerHTML": "<article class=\"content\"><h1>Title</h1><p>...</p></article>",
  "text": "Title ...",
  "truncated": false
}
```

Without `selector`/`xpath`, it returns the page's main content. `truncated` reports whether `maxChars` cut the output.

## DOM.getCompactHTML

Same as `getOuterHTML` but minified — strips scripts, styles, comments, svg, iframes, `head`, non-essential attrs; collapses whitespace; drops empty elements. Single-line.

**Request**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `targetId` | `string` | — | Target id |
| `selector` | `string` | — | CSS selector |
| `xpath` | `string` | — | XPath |
| `maxChars` | `number` | `10000` | Max characters |


Response:

```json
{
  "outerHTML": "<main><h1>Title</h1><p>Text</p></main>",
  "text": "Title Text",
  "truncated": false
}
```

Use for fast debugging without raw-page noise.

## DOM.scrollIntoViewIfNeeded

Scroll an element into view.

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

## Tips

- **Start with `getDocument`** to discover valid selectors — don't guess.
- **Use `querySelector` to verify** a selector returns one element before clicking/typing.
- **Prefer `getCompactHTML`** for large pages — `getOuterHTML` can be noisy.
- **Check `visible` and `rect`** — an element can exist but be off-screen or `display:none`.
- **Attributes are real** — `attributes` only includes attrs that actually exist on the element, plus `value` for form fields.

## Next Steps

- [Interaction](/guides/devtools/interaction) — Click and type
- [Network & Console](/guides/devtools/network) — Monitor requests
