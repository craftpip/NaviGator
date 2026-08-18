# DevTools Overview

19 CDP tools for interacting with live web pages — create persistent tabs, inspect DOM, click buttons, type text, and monitor network requests.

## Enabling DevTools

DevTools are disabled by default. Enable them:

```bash
# In .env
ENABLE_DEVTOOLS_MCP=1
```

Restart the server after changing this setting.

## The DevTools Workflow

1. **Create a tab** — open a page in a persistent browser tab
2. **Inspect** — read the DOM, check element positions, get HTML
3. **Interact** — click buttons, fill forms, type text
4. **Monitor** — watch network requests and console output
5. **Close** — clean up when done

## Available Tools

### Tab Management
| Tool | Description |
|------|-------------|
| `Target.createTarget` | Open a new persistent tab |
| `Target.getTargets` | List all open tabs |
| `Target.closeTarget` | Close a tab |

### Navigation
| Tool | Description |
|------|-------------|
| `Page.navigate` | Go to a URL |
| `Page.reload` | Reload the page |
| `Page.goBack` / `Page.goForward` | Browser history navigation |

### DOM Inspection
| Tool | Description |
|------|-------------|
| `DOM.getDocument` | Get page structure with selectors and XPaths |
| `DOM.querySelector` | Find a single element |
| `DOM.querySelectorAll` | Find multiple elements |
| `DOM.getOuterHTML` | Get raw HTML of an element |
| `DOM.scrollIntoViewIfNeeded` | Scroll an element into view |

### Interaction
| Tool | Description |
|------|-------------|
| `Input.dispatchMouseEvent` | Click an element |
| `Input.insertText` | Type text into a field |
| `Input.dispatchKeyEvent` | Press keyboard keys |

### Runtime & Network
| Tool | Description |
|------|-------------|
| `Runtime.evaluate` | Run JavaScript in the page |
| `Runtime.getConsoleMessages` | Read console output |
| `Network.getRequests` | View network requests |

## Example: Testing a Login Form

```json
// 1. Open the page
Target.createTarget({ "url": "https://example.com/login" })

// 2. Find the form fields
DOM.querySelector({ "targetId": "ABC", "selector": "input[name='email']" })

// 3. Type into the email field
Input.insertText({ "targetId": "ABC", "selector": "input[name='email']", "text": "user@example.com" })

// 4. Type into the password field
Input.insertText({ "targetId": "ABC", "selector": "input[name='password']", "text": "password123" })

// 5. Click the submit button
Input.dispatchMouseEvent({ "targetId": "ABC", "selector": "button[type='submit']" })

// 6. Check what happened
Network.getRequests({ "targetId": "ABC" })
```

## Target Lifecycle

- Tabs close automatically after **5 minutes** of inactivity
- Any interaction (click, type, DOM read) resets the timer
- Maximum **20 concurrent targets**
- Targets are per-session — different MCP sessions have separate tabs

## Tips

- **Use `DOM.getDocument` first** to understand the page structure
- **Prefer CSS selectors** over XPath — they're more readable
- **Check `Network.getRequests`** if a page isn't loading as expected
- **Use `Runtime.evaluate`** for custom queries when other tools aren't enough
- **Close tabs** when done to free resources

## Next Steps

- [DOM Inspection](/guides/devtools/dom) — Read page structure
- [Interaction](/guides/devtools/interaction) — Click, type, and scroll
- [Network & Console](/guides/devtools/network) — Monitor requests
