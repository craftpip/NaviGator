import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

const NOISE_SELECTORS = [
  "nav", "aside", "form", "dialog", "menu", "menuitem",
  "iframe", "object", "embed", "applet",
  "svg", "canvas",
  "script", "style", "noscript", "template",
  "input", "textarea", "select", "button"
];

function resolveRelativeUrls(html, baseUrl) {
  if (!baseUrl) return html;
  return html
    .replace(/(<a\s[^>]*href=)['"]?(.*?)['"]?(\s[^>]*>|>)/gi, (match, pre, href, rest) => {
      if (!href || href.startsWith("http") || href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("data:") || href.startsWith("mailto:")) return match;
      try { return `${pre}"${new URL(href, baseUrl).href}"${rest.startsWith(">") ? ">" : rest}`; } catch { return match; }
    })
    .replace(/(<img\s[^>]*src=)['"]?(.*?)['"]?(\s[^>]*\/?>|>)/gi, (match, pre, src, rest) => {
      if (!src || src.startsWith("http") || src.startsWith("data:")) return match;
      try { return `${pre}"${new URL(src, baseUrl).href}"${rest.startsWith(">") ? ">" : rest}`; } catch { return match; }
    });
}

export function htmlToMarkdown(html, options = {}) {
  const {
    baseUrl = "",
    linkStyle = "inlined",
    headingStyle = "atx",
    bulletListMarker = "-",
    strongDelimiter = "**",
    emDelimiter = "_",
    fence = "```",
  } = options;

  if (!html) return "";

  let resolved = resolveRelativeUrls(html, baseUrl);

  const ts = new TurndownService({
    headingStyle,
    hr: "---",
    bulletListMarker,
    codeBlockStyle: "fenced",
    fence,
    emDelimiter,
    strongDelimiter,
    linkStyle,
    linkReferenceStyle: "full",
  });

  ts.use(gfm);
  ts.remove(NOISE_SELECTORS);

  ts.addRule("skipEmptyFragmentLinks", {
    filter(node) {
      return node.nodeName === "A" && (!node.textContent.trim() || node.textContent.trim() === "#") && node.getAttribute("href")?.startsWith("#");
    },
    replacement() { return ""; }
  });

  ts.addRule("table", {
    filter: ["table"],
    replacement(content) {
      content = content.replace(/\n\n/g, "\n");
      return "\n\n" + content + "\n\n";
    }
  });

  ts.addRule("details", {
    filter: ["details"],
    replacement(content, node) {
      const summary = node.querySelector("summary");
      const summaryText = summary ? summary.textContent.trim() : "";
      let result = "<details>\n";
      if (summaryText) result += "<summary>" + summaryText + "</summary>\n\n";
      if (summary) {
        const bodyContent = content.replace(summaryText, "").trim();
        if (bodyContent) result += bodyContent + "\n";
      } else if (content.trim()) {
        result += content.trim() + "\n";
      }
      result += "</details>";
      return result;
    }
  });

  ts.addRule("dl", {
    filter: ["dl"],
    replacement(content) {
      return "\n" + content.trim() + "\n";
    }
  });

  ts.addRule("dt", {
    filter: ["dt"],
    replacement(content) {
      content = content.trim();
      if (!content) return "";
      return "\n**" + content + "**\n";
    }
  });

  ts.addRule("dd", {
    filter: ["dd"],
    replacement(content) {
      content = content.trim();
      if (!content) return "";
      return ": " + content + "\n";
    }
  });

  ts.addRule("sub", {
    filter: ["sub"],
    replacement(content) {
      content = content.trim();
      if (!content) return "";
      return "~" + content + "~";
    }
  });

  ts.addRule("sup", {
    filter: ["sup"],
    replacement(content) {
      content = content.trim();
      if (!content) return "";
      return "^" + content + "^";
    }
  });

  ts.addRule("mark", {
    filter: ["mark"],
    replacement(content) {
      content = content.trim();
      if (!content) return "";
      return "==" + content + "==";
    }
  });

  ts.addRule("abbr", {
    filter: ["abbr"],
    replacement(content, node) {
      const title = node.getAttribute("title") || "";
      content = content.trim();
      if (!content) return "";
      return title ? content + " (" + title + ")" : content;
    }
  });

  ts.addRule("q", {
    filter: ["q"],
    replacement(content) {
      content = content.trim();
      if (!content) return "";
      return '"' + content + '"';
    }
  });

  try {
    return ts.turndown(resolved).trim();
  } catch {
    return html || "";
  }
}

export default htmlToMarkdown;
