export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeUrl(url) {
  const trimmed = String(url).trim();
  return /^(https?:|mailto:)/i.test(trimmed) ? trimmed : null;
}

function inline(text) {
  let html = escapeHtml(text);
  html = html.replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`);
  html = html.replace(/~~([^~]+)~~/g, (_, t) => `<del>${t}</del>`);
  html = html.replace(/\*\*([^*]+)\*\*/g, (_, t) => `<strong>${t}</strong>`);
  html = html.replace(/__([^_]+)__/g, (_, t) => `<strong>${t}</strong>`);
  html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, (_, pre, t) => `${pre}<em>${t}</em>`);
  html = html.replace(/(^|[^_])_([^_\n]+)_/g, (_, pre, t) => `${pre}<em>${t}</em>`);
  html = html.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, url) => {
    const safe = safeUrl(url);
    return safe ? `<img src="${safe}" alt="${alt}" loading="lazy" />` : m;
  });
  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
    const safe = safeUrl(url);
    return safe
      ? `<a href="${safe}" target="_blank" rel="noopener noreferrer">${label}</a>`
      : m;
  });
  return html;
}

function isListLine(line) {
  return /^\s*([-*+]|\d+\.)\s+/.test(line);
}

function matchListItem(line) {
  const m = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
  if (!m) return null;
  return { indent: m[1].length, ordered: !/^[-*+]$/.test(m[2]), content: m[3] };
}

function renderListBlock(listLines) {
  const root = { type: "container", children: [] };
  const stack = [{ node: root, indent: -1 }];
  for (const line of listLines) {
    if (!line.trim()) continue;
    const item = matchListItem(line);
    if (!item) continue;
    while (stack.length > 1) {
      const top = stack[stack.length - 1];
      if (top.node.type === "item" && top.indent >= item.indent) stack.pop();
      else if (top.node.type === "list" && top.indent > item.indent) stack.pop();
      else break;
    }
    const top = stack[stack.length - 1];
    if (top.node.type === "item") {
      const list = { type: "list", ordered: item.ordered, children: [] };
      top.node.children.push(list);
      stack.push({ node: list, indent: item.indent });
    } else if (top.node.type === "list" && top.node.ordered !== item.ordered) {
      stack.pop();
      const list = { type: "list", ordered: item.ordered, children: [] };
      stack[stack.length - 1].node.children.push(list);
      stack.push({ node: list, indent: item.indent });
    } else if (top.node.type === "container") {
      const list = { type: "list", ordered: item.ordered, children: [] };
      top.node.children.push(list);
      stack.push({ node: list, indent: item.indent });
    }
    const node = { type: "item", content: item.content, children: [] };
    stack[stack.length - 1].node.children.push(node);
    stack.push({ node, indent: item.indent });
  }
  return root.children.map(renderListNode).join("");
}

function renderListNode(node) {
  if (node.type === "list") {
    const tag = node.ordered ? "ol" : "ul";
    return `<${tag}>${node.children.map(renderListNode).join("")}</${tag}>`;
  }
  return `<li>${inline(node.content)}${node.children.map(renderListNode).join("")}</li>`;
}

function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isGfmTableStart(lines, i) {
  if (i + 1 >= lines.length) return false;
  if (!lines[i].includes("|")) return false;
  const sep = lines[i + 1];
  if (!/^\s*\|?[ \t]*:?-{3,}:?[ \t]*(\|[ \t]*:?-{3,}:?[ \t]*)*\|?[ \t]*$/.test(sep)) return false;
  return sep.split("|").length >= 3;
}

function isPipeTableStart(lines, i) {
  if (!lines[i].includes("|") || !lines[i + 1] || !lines[i + 1].includes("|")) return false;
  let run = 0;
  let j = i;
  while (j < lines.length && lines[j].trim() !== "" && lines[j].includes("|")) {
    run += 1;
    j += 1;
  }
  return run >= 2;
}

function isBlockStart(line) {
  return (
    /^#{1,6}\s/.test(line) ||
    isListLine(line) ||
    /^>\s?/.test(line) ||
    /^```/.test(line) ||
    /^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)
  );
}

export function renderMarkdown(source) {
  if (!source) return "";
  const lines = String(source).replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let i = 0;
  const n = lines.length;

  while (i < n) {
    const line = lines[i];

    if (/^```/.test(line)) {
      const lang = line.match(/^```(\w*)/)?.[1] || "";
      const code = [];
      i += 1;
      while (i < n && !/^```/.test(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1;
      const langClass = lang ? ` class="language-${escapeHtml(lang)}"` : "";
      blocks.push(`<pre><code${langClass}>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    if (/^ {4}/.test(line)) {
      const code = [];
      while (i < n && (/^ {4}/.test(lines[i]) || lines[i] === "")) {
        code.push(lines[i] === "" ? "" : lines[i].slice(4));
        i += 1;
      }
      while (code.length && code[code.length - 1] === "") code.pop();
      blocks.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    if (line.trim() === "") {
      i += 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (heading) {
      blocks.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`);
      i += 1;
      continue;
    }

    if (i + 1 < n && /^={3,}\s*$/.test(lines[i + 1])) {
      blocks.push(`<h1>${inline(line)}</h1>`);
      i += 2;
      continue;
    }

    if (i + 1 < n && /^-{3,}\s*$/.test(lines[i + 1]) && !isGfmTableStart(lines, i)) {
      blocks.push(`<h2>${inline(line)}</h2>`);
      i += 2;
      continue;
    }

    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      blocks.push("<hr />");
      i += 1;
      continue;
    }

    if (isGfmTableStart(lines, i)) {
      const header = splitTableRow(lines[i]);
      const rows = [];
      let j = i + 2;
      while (j < n && lines[j].trim() !== "" && lines[j].includes("|")) {
        rows.push(splitTableRow(lines[j]));
        j += 1;
      }
      const head = `<tr>${header.map((cell) => `<th>${inline(cell)}</th>`).join("")}</tr>`;
      const body = rows
        .map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`)
        .join("");
      blocks.push(`<table><thead>${head}</thead><tbody>${body}</tbody></table>`);
      i = j;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote = [];
      while (i < n && /^>/.test(lines[i])) {
        quote.push(lines[i].replace(/^>\s?/, ""));
        i += 1;
      }
      blocks.push(`<blockquote>${renderMarkdown(quote.join("\n"))}</blockquote>`);
      continue;
    }

    if (isListLine(line)) {
      const listLines = [];
      while (i < n && isListLine(lines[i])) {
        listLines.push(lines[i]);
        i += 1;
        while (
          i < n &&
          lines[i].trim() === "" &&
          i + 1 < n &&
          isListLine(lines[i + 1])
        ) {
          i += 1;
        }
      }
      blocks.push(renderListBlock(listLines));
      continue;
    }

    if (isPipeTableStart(lines, i)) {
      const rows = [];
      while (i < n && lines[i].trim() !== "" && lines[i].includes("|")) {
        rows.push(splitTableRow(lines[i]));
        i += 1;
      }
      const header = rows.shift() || [];
      const head = `<tr>${header.map((cell) => `<th>${inline(cell)}</th>`).join("")}</tr>`;
      const body = rows
        .map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`)
        .join("");
      blocks.push(`<table><thead>${head}</thead><tbody>${body}</tbody></table>`);
      continue;
    }

    const para = [];
    while (i < n && lines[i].trim() !== "" && !isBlockStart(lines[i])) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push(`<p>${inline(para.join(" "))}</p>`);
  }

  return blocks.join("\n");
}
