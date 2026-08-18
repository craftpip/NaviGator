# DOM Inspection

Read the structure of any web page — find elements, get their HTML, and understand the layout.

## Getting the Page Structure

Start with `DOM.getDocument` to see the page's element tree:

```json
{
  "targetId": "ABC",
  "limit": 30
}
```

Returns a structured view of the page:

```
Page: https://example.com (1247x3892)
├── <html> 
├── <head>
├── <body>
│   ├── <header> (0,0 — 1247,80) visible
│   │   ├── <nav.navbar>
│   │   │   ├── <a.logo> "Navigator"
│   │   │   └── <div.nav-links>
│   │   │       ├── <a> "Docs"
│   │   │       └── <a> "GitHub"
│   ├── <main> (0,80 — 1247,3800) visible
│   │   ├── <article.content>
│   │   │   ├── <h1> "Getting Started"
│   │   │   └── <p> "Follow these steps..."
│   └── <footer> (0,3800 — 1247,3892) visible
```

Each element shows:
- **Tag and class/id** — `<article.content>`
- **Position** — bounding rectangle
- **Visibility** — whether it's visible on screen
- **Text content** — if it's a text node

## Finding Specific Elements

### querySelector — Find One Element

```json
{
  "targetId": "ABC",
  "selector": "article.content h1"
}
```

Returns the element with its text, attributes, and position:

```
Found: <h1> "Getting Started"
Selector: article.content h1
XPath: /html/body/main/article/h1
Text: "Getting Started"
Visible: yes
Position: (24, 120 — 400, 160)
```

### querySelectorAll — Find Multiple Elements

```json
{
  "targetId": "ABC",
  "selector": "nav a",
  "limit": 10
}
```

Returns all matching elements:

```
Found 5 elements:
1. <a> "Docs" — /html/body/header/nav/a[1]
2. <a> "GitHub" — /html/body/header/nav/a[2]
3. <a> "Search" — /html/body/header/nav/a[3]
...
```

## Getting HTML

### getOuterHTML — Raw HTML

```json
{
  "targetId": "ABC",
  "selector": "article.content",
  "maxChars": 5000
}
```

Returns the raw HTML of the element:

```html
<article class="content">
  <h1>Getting Started</h1>
  <p>Follow these steps to install Navigator...</p>
  <div class="code-block">
    <code>npm install</code>
  </div>
</article>
```

## Scrolling to Elements

If an element is off-screen:

```json
{
  "targetId": "ABC",
  "selector": "footer.contact"
}
```

Returns the element's position and scrolls it into view if needed.

## Tips

- **Start with `getDocument`** to understand the page layout
- **Use specific selectors** — `article h1` is better than just `h1`
- **Check visibility** — elements might exist but be hidden
- **Use `limit`** to avoid overwhelming output on large pages
- **Combine with screenshots** — DOM shows structure, screenshots show appearance

## Next Steps

- [Interaction](/guides/devtools/interaction) — Click and type
- [Network & Console](/guides/devtools/network) — Monitor requests
