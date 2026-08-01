#!/usr/bin/env node
// Converts an ANSI truecolor half-block render (as saved by ascii-feasibility.mjs)
// into a PNG screenshot so the result can be viewed visually.
import { getBrowserManager } from "../src/browser.js";
import { readFileSync } from "node:fs";

function ansiToHtml(ansi) {
  let html = "";
  let fg = null;
  let bg = null;
  const parts = ansi.split(/\n/);
  for (const line of parts) {
    const segments = line.split(String.fromCharCode(27));
    let text = "";
    for (const seg of segments) {
      if (seg.startsWith("[38;2;")) {
        const m = seg.match(/^\[38;2;(\d+);(\d+);(\d+)m(.*)$/s);
        if (m) { fg = `rgb(${m[1]},${m[2]},${m[3]})`; text += m[4]; continue; }
      }
      if (seg.startsWith("[48;2;")) {
        const m = seg.match(/^\[48;2;(\d+);(\d+);(\d+)m(.*)$/s);
        if (m) { bg = `rgb(${m[1]},${m[2]},${m[3]})`; text += m[4]; continue; }
      }
      if (seg.startsWith("[0m")) {
        const m = seg.match(/^\[0m(.*)$/s);
        if (m) { fg = null; bg = null; text += m[1]; continue; }
      }
      text += seg;
    }
    if (text.length === 0) continue;
    const style = [];
    if (fg) style.push(`color:${fg}`);
    if (bg) style.push(`background:${bg}`);
    html += `<div style="${style.join(";")}">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</div>`;
  }
  return html;
}

async function main() {
  const file = process.argv[2];
  const out = process.argv[3] || "/tmp/ansi.png";
  const ansi = readFileSync(file, "utf8");
  const body = ansiToHtml(ansi);

  const manager = await getBrowserManager();
  const page = await manager.newPage({ backend: manager.config.defaultBackend });
  try {
    await page.setContent(`<!doctype html><html><head>
      <style>
        html, body { margin:0; padding:0; background:#fff; }
        pre { margin:0; font-family:monospace; font-size:9px; line-height:1; letter-spacing:0;
              white-space:pre; }
        body > div { font-family:monospace; font-size:9px; line-height:1; letter-spacing:0;
              white-space:pre; }
      </style></head><body><pre>${body}</pre></body></html>`);
    const el = await page.$("pre");
    const box = await el.boundingBox();
    const width = Math.max(1, Math.ceil(box.width));
    const height = Math.max(1, Math.ceil(box.height));
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await el.screenshot({ path: out });
    console.error(`saved ${out} (${width}x${height})`);
  } finally {
    await page.close().catch(() => {});
  }
  await manager.shutdown().catch(() => {});
  process.exit(0);
}

main().catch((err) => {
  console.error(`FAILED: ${err.message}`);
  process.exit(1);
});
