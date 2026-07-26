#!/usr/bin/env node

import { getBrowserManager } from "../src/browser.js";
import { transform, formatLegend } from "../src/ascii.js";

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    url: null,
    width: 120,
    elementLimit: 50,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--width" && args[i + 1]) {
      opts.width = Math.max(40, Math.min(200, parseInt(args[i + 1], 10) || 120));
      i++;
    } else if (arg === "--elements" && args[i + 1]) {
      opts.elementLimit = Math.max(1, parseInt(args[i + 1], 10) || 50);
      i++;
    } else if (!arg.startsWith("--")) {
      opts.url = arg;
    }
  }

  return opts;
}

const ELEMENT_EXTRACT_CODE = `
(function extractElements(limit) {
  function cssPath(element) {
    if (!(element instanceof Element)) return null;
    const parts = [];
    let node = element;
    while (node && node.nodeType === Node.ELEMENT_NODE && parts.length < 10) {
      let segment = node.tagName.toLowerCase();
      if (node.id) {
        segment += '#' + node.id;
        parts.unshift(segment);
        break;
      }
      const siblings = node.parentElement
        ? Array.from(node.parentElement.children).filter(c => c.tagName === node.tagName)
        : [];
      if (siblings.length > 1) {
        const index = siblings.indexOf(node);
        segment += ':nth-of-type(' + (index + 1) + ')';
      }
      parts.unshift(segment);
      node = node.parentElement;
    }
    return parts.join(' > ');
  }

  function xpathFor(element) {
    if (!(element instanceof Element)) return null;
    const parts = [];
    let node = element;
    while (node && node.nodeType === Node.ELEMENT_NODE) {
      let index = 1;
      let sibling = node.previousElementSibling;
      while (sibling) {
        if (sibling.tagName === node.tagName) index++;
        sibling = sibling.previousElementSibling;
      }
      parts.unshift(node.tagName.toLowerCase() + '[' + index + ']');
      node = node.parentElement;
    }
    return '/' + parts.join('/');
  }

  function visible(element) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0
      && style.visibility !== 'hidden'
      && style.display !== 'none';
  }

  const scrollX = window.scrollX || 0;
  const scrollY = window.scrollY || 0;
  const nodes = [];
  const seen = new Set();
  let index = 0;

  function addNode(el, kind, priority) {
    const key = cssPath(el);
    if (!key || seen.has(key)) return;
    seen.add(key);

    const rect = el.getBoundingClientRect();
    if (!visible(el)) return;

    let text = '';
    let link = '';

    if (kind === 'img') {
      link = el.src || el.getAttribute('data-src') || '';
      text = el.alt || link.split('/').pop() || 'image';
    } else {
      text = (el.innerText || el.textContent || '').trim().slice(0, 300);
      if (!text && el.placeholder) text = el.placeholder;
    }

    if (!text && kind === 'interactive') return;

    index++;
    nodes.push({
      index,
      kind,
      priority,
      tagName: el.tagName.toLowerCase(),
      selector: key,
      xpath: xpathFor(el),
      role: el.getAttribute('role') || '',
      text: text || '',
      link: link || '',
      href: el.href || '',
      rect: {
        x: Math.round(rect.x + scrollX),
        y: Math.round(rect.y + scrollY),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    });
  }

  document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(el => {
    addNode(el, 'heading', 1);
  });

  document.querySelectorAll('p').forEach(el => {
    const text = (el.innerText || el.textContent || '').trim();
    if (text.length > 10) addNode(el, 'paragraph', 2);
  });

  document.querySelectorAll('img').forEach(el => {
    if (el.src && visible(el)) addNode(el, 'img', 3);
  });

  document.querySelectorAll('a[href]').forEach(el => {
    const text = (el.innerText || el.textContent || '').trim();
    if (text.length > 1) addNode(el, 'link', 4);
  });

  document.querySelectorAll('button, input, textarea, select, label, [role="button"]').forEach(el => {
    addNode(el, 'interactive', 5);
  });

  let liCount = 0;
  document.querySelectorAll('li').forEach(el => {
    if (liCount >= 20) return;
    const text = (el.innerText || el.textContent || '').trim();
    if (text.length > 5 && text.length < 200) {
      addNode(el, 'list-item', 6);
      liCount++;
    }
  });

  return {
    title: document.title,
    url: location.href,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    pageWidth: document.documentElement.scrollWidth,
    pageHeight: document.documentElement.scrollHeight,
    elements: nodes.slice(0, limit),
  };
})
`;

async function main() {
  const opts = parseArgs(process.argv);

  if (!opts.url) {
    process.stderr.write("Usage: node scripts/ascii-screenshot.js <url> [options]\n");
    process.stderr.write("Options: --width <n> --elements <n>\n");
    process.exit(1);
  }

  process.stderr.write(`Opening ${opts.url}...\n`);

  const manager = await getBrowserManager();
  const page = await manager.newPage({ backend: manager.config.defaultBackend });

  try {
    await page.goto(opts.url, {
      waitUntil: manager.config.navWaitUntil,
      timeout: manager.config.browserOpTimeoutMs,
    });

    await page.waitForFunction(
      () =>
        document.readyState === "complete" ||
        document.readyState === "interactive",
      { timeout: 10000 }
    ).catch(() => {});

    await new Promise((r) => setTimeout(r, 1000));

    process.stderr.write("Extracting elements...\n");
    const elementFn = eval(ELEMENT_EXTRACT_CODE);
    const elementData = await page.evaluate(elementFn, opts.elementLimit);

    process.stderr.write(
      `Found ${elementData.elements.length} elements\n`
    );

    const margin = 50;
    const vw = elementData.viewportWidth;
    const vh = elementData.viewportHeight;
    const visible = elementData.elements.filter((el) => {
      const r = el.rect;
      return r.x + r.width > -margin && r.x < vw + margin
        && r.y + r.height > -margin && r.y < vh + margin;
    });

    process.stderr.write(
      `Visible in viewport: ${visible.length}\n`
    );
    process.stderr.write(
      `Viewport: ${vw}x${vh}, Page: ${elementData.pageWidth}x${elementData.pageHeight}\n`
    );

    const result = transform(vw, vh, visible, opts.width);

    process.stderr.write(
      `Wireframe: ${result.stats.asciiCols}x${result.stats.asciiRows}\n\n`
    );

    process.stdout.write(`### Page Wireframe\n\n`);
    process.stdout.write("```\n");
    process.stdout.write(result.wireframe);
    process.stdout.write("\n```\n\n");
    process.stdout.write(`### Element Legend\n\n`);
    process.stdout.write(formatLegend(result.elements));
    process.stdout.write("\n\n");
    process.stdout.write(
      `- Page: ${elementData.title} (${elementData.url})\n`
    );
    process.stdout.write(
      `- Elements: ${result.stats.elementCount} found, ${result.stats.placedCount} placed\n`
    );
  } finally {
    await page.close().catch(() => {});
  }
}

main().catch((err) => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
});
