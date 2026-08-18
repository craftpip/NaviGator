# Interaction

Click buttons, fill forms, and interact with live web pages.

## Clicking Elements

Use `Input.dispatchMouseEvent` to click any element:

```json
{
  "targetId": "ABC",
  "selector": "button.submit"
}
```

Options:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `button` | `left` | `left`, `right`, or `middle` |
| `clickCount` | `1` | Number of clicks (1-3 for double/triple click) |

### Click by XPath

```json
{
  "targetId": "ABC",
  "xpath": "/html/body/main/form/button"
}
```

## Typing Text

Use `Input.insertText` to type into form fields:

```json
{
  "targetId": "ABC",
  "selector": "input[name='email']",
  "text": "user@example.com"
}
```

This:
1. Focuses the element
2. Clears any existing value
3. Types the text character by character
4. Returns the final value

### Password Fields

```json
{
  "targetId": "ABC",
  "selector": "input[type='password']",
  "text": "my-secret-password"
}
```

## Keyboard Events

Use `Input.dispatchKeyEvent` for keyboard shortcuts and special keys:

```json
{
  "targetId": "ABC",
  "key": "Enter"
}
```

### Special Keys

| Key | Description |
|-----|-------------|
| `Enter` | Submit form, confirm |
| `Tab` | Move to next field |
| `Escape` | Close modal, cancel |
| `ArrowUp` / `ArrowDown` | Navigate lists |
| `Backspace` | Delete character |

### Key with Modifiers

```json
{
  "targetId": "ABC",
  "key": "a",
  "modifiers": ["Control"]
}
```

This selects all text (Ctrl+A).

## Example: Filling a Search Form

```json
// 1. Open the page
Target.createTarget({ "url": "https://example.com" })

// 2. Find the search input
DOM.querySelector({ "targetId": "ABC", "selector": "input[type='search']" })

// 3. Type the search query
Input.insertText({ "targetId": "ABC", "selector": "input[type='search']", "text": "MCP protocol" })

// 4. Press Enter to submit
Input.dispatchKeyEvent({ "targetId": "ABC", "key": "Enter" })

// 5. Wait for results, then check the page
DOM.getDocument({ "targetId": "ABC", "limit": 20 })
```

## Example: Paginating Results

```json
// 1. Click "Next" button
Input.dispatchMouseEvent({ "targetId": "ABC", "selector": "button.next-page" })

// 2. Wait for page to load (check network)
Network.getRequests({ "targetId": "ABC", "filter": "api" })

// 3. Read the new content
DOM.getDocument({ "targetId": "ABC", "limit": 20 })
```

## Limitations

- **No browser shortcuts** — Synthetic key events can't trigger Ctrl+R, Ctrl+W, etc. Use `Page.reload` instead.
- **No drag and drop** — Only click and type are supported.
- **No file upload** — Can't interact with file input dialogs.
- **Typing delay** — Characters are typed with a configurable delay (`HUMAN_TYPING_DELAY`).

## Tips

- **Use `DOM.getDocument` first** to find the right selector
- **Scroll before clicking** — `DOM.scrollIntoViewIfNeeded` ensures the element is visible
- **Check `Network.getRequests`** after clicks to see if API calls were made
- **Use `Runtime.evaluate`** for complex interactions not covered by other tools

## Next Steps

- [Network & Console](/guides/devtools/network) — Monitor requests
