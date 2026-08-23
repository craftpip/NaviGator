#!/usr/bin/env node
// CLI harness: capture screenshot vs SVG and diff — the forever-loop sensor (§14.4)
// Usage: node scripts/svg-diff.mjs http://10.69.1.164:1994/ [--hybrid] [--fullPage] [--elementLimit 500] [--cols 100]
import { getBrowserManager } from "../src/browser.js";
import { capturePageAsSvg } from "../src/svg.js";
import { SAMPLE_PIXELS_CODE, asciiGridDims } from "../src/pixel-sampler.js";
import { diffPixels, formatDiffMarkdown } from "../src/svg-diff.js";
import fs from "node:fs/promises";
import path from "node:path";

function parseArgs() {
  const args = process.argv.slice(2);
  const url = args.find(a => !a.startsWith("--")) || "http://10.69.1.164:1994/";
  const hybrid = args.includes("--hybrid");
  const fullPage = args.includes("--fullPage") ? true : (args.includes("--viewport") ? false : true); // default fullPage true for console
  const elIdx = args.indexOf("--elementLimit");
  const elementLimit = elIdx >= 0 ? parseInt(args[elIdx + 1], 10) : 250;
  const colsIdx = args.indexOf("--cols");
  const cols = colsIdx >= 0 ? parseInt(args[colsIdx + 1], 10) : 100;
  return { url, hybrid, fullPage, elementLimit, cols };
}

async function samplePng(page, base64, cols, rows) {
  const fn = eval(SAMPLE_PIXELS_CODE);
  const buf = await page.evaluate(fn, base64, cols, rows);
  if (Array.isArray(buf)) return new Uint8Array(buf);
  if (buf instanceof Uint8Array) return buf;
  // puppeteer serializes Uint8Array as {0:...,1:...}
  if (buf && typeof buf === 'object') {
    const keys = Object.keys(buf);
    if (keys.length) {
      const out = new Uint8Array(keys.length);
      for (let i = 0; i < keys.length; i++) out[i] = buf[i];
      return out;
    }
  }
  return new Uint8Array(buf);
}

async function captureScreenshotPng(manager, url) {
  return manager.withPageSlot(async () => {
    const page = await manager.newPage({ backend: manager.config.defaultBackend });
    try {
      await page.goto(url, { waitUntil: manager.config.navWaitUntil, timeout: manager.config.browserOpTimeoutMs });
      await page.waitForFunction(() => document.readyState === "complete" || document.readyState === "interactive", { timeout: 10000 }).catch(()=>{});
      await new Promise(r=>setTimeout(r, 900));
      const b64 = await page.screenshot({ type: "png", encoding: "base64", fullPage: false });
      const title = await page.title().catch(()=> "");
      const vw = await page.evaluate(() => window.innerWidth);
      const vh = await page.evaluate(() => window.innerHeight);
      return { b64, title, vw, vh, page };
    } finally {
      // don't close yet — we need page for sampling? We'll sample via same page before close
      // Instead do sampling inside, then close
      // refactored below: do all in one withPageSlot
    }
  });
}

// unified flow to keep page open for sampling
async function runDiff({ url, hybrid, fullPage, elementLimit, cols }) {
  const manager = await getBrowserManager();
  console.error(`🔍 diff: url=${url} hybrid=${hybrid} fullPage=${fullPage} limit=${elementLimit} cols=${cols}`);

  // 1. Capture screenshot PNG + SVG from ONE page load. Live-updating pages
  //    (console timers/feeds) drift between separate loads — the diff must
  //    compare two renderings of the same DOM instant.
  let screenshotB64, vw, vh, svgText, clipW, clipH, svgBytes, pageW, pageH, title;
  const svgResult = await manager.withPageSlot(async () => {
    const page = await manager.newPage({ backend: manager.config.defaultBackend });
    // Freeze live-update timers (console feeds/stats tick every second and
    // poison the diff). Track ids from document start; __freezeTimers() kills them.
    await page.evaluateOnNewDocument(() => {
      const tracked = new Set();
      const oSI = window.setInterval.bind(window);
      const oST = window.setTimeout.bind(window);
      window.setInterval = (...a) => { const id = oSI(...a); tracked.add(id); return id; };
      window.setTimeout = (...a) => { const id = oST(...a); tracked.add(id); return id; };
      window.__freezeTimers = () => { for (const id of [...tracked]) { clearTimeout(id); clearInterval(id); } tracked.clear(); };
    });
    try {
      await page.goto(url, { waitUntil: manager.config.navWaitUntil, timeout: manager.config.browserOpTimeoutMs });
      await page.waitForFunction(() => document.readyState === "complete" || document.readyState === "interactive", { timeout: 10000 }).catch(()=>{});
      await new Promise(r=>setTimeout(r, 900));
      await page.evaluate(() => { if (window.__freezeTimers) window.__freezeTimers(); });
      const b64 = await page.screenshot({ type: "png", encoding: "base64", fullPage: fullPage ? true : false });
      const t = await page.title().catch(()=> "");
      const vW = await page.evaluate(() => window.innerWidth);
      const vH = await page.evaluate(() => window.innerHeight);
      const pW = await page.evaluate(() => document.documentElement.scrollWidth);
      const pH = await page.evaluate(() => document.documentElement.scrollHeight);
      const cap = await capturePageAsSvg(page, { elementLimit, fullPage, hybrid });
      return { ...cap, shot: b64, t, vW, vH, pW, pH };
    } finally { await page.close().catch(()=>{}); }
  });
  screenshotB64 = svgResult.shot; title = svgResult.t; vw = svgResult.vW; vh = svgResult.vH; pageW = svgResult.pW; pageH = svgResult.pH;
  svgText = svgResult.svg; clipW = svgResult.clipW; clipH = svgResult.clipH; svgBytes = svgResult.built.stats.bytes;

  const W = clipW;
  const H = clipH;
  // For viewport diff, W==vw, H==vh; for fullPage, W==pageW etc.
  const { cols: c, rows } = asciiGridDims(W, H, cols);
  console.error(`📐 dims W=${W} H=${H} vw=${vw} vh=${vh} page=${pageW}×${pageH} → grid ${c}×${rows}`);
  // Save artifacts
  await fs.mkdir("svg-diff", { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g,"-");
  const base = `svg-diff/${stamp}-${hybrid ? "hybrid" : "rect"}`;
  await fs.writeFile(`${base}.svg`, svgText, "utf8").catch(()=>{});

  // 2. Rasterize SVG via new page setContent -> screenshot (wait for fonts like capturePageAsSvg does — Satori principle: real metrics > heuristic)
  const svgPngB64 = await manager.withPageSlot(async () => {
    const page = await manager.newPage({ backend: manager.config.defaultBackend });
    try {
      await page.setViewport({ width: W, height: H });
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;overflow:hidden;background:${svgResult.data.bodyBg || "#ffffff"}</style></head><body style="margin:0;padding:0">${svgText}</body></html>`;
      await page.setContent(html, { waitUntil: "load" });
      // wait for web fonts (Inter) before screenshot — otherwise text metrics drift
      try {
        await page.evaluate(async () => {
          if (!document.fonts) return;
          await document.fonts.ready;
          const loads = Array.from(document.fonts).map(f => f.load().catch(()=>{}));
          await Promise.all(loads);
          await document.fonts.ready;
        });
      } catch {}
      await new Promise(r=>setTimeout(r, 300));
      const b64 = await page.screenshot({ type: "png", encoding: "base64", fullPage: false });
      return b64;
    } finally { await page.close().catch(()=>{}); }
  });
  await fs.writeFile(`${base}.png`, Buffer.from(svgPngB64, "base64")).catch(()=>{});
  await fs.writeFile(`${base}-shot.png`, Buffer.from(screenshotB64, "base64")).catch(()=>{});

  // 3. Sample both via OffscreenCanvas in a temp page
  function toU8(v){
    if(!v) return new Uint8Array(0);
    if(v instanceof Uint8Array) return v;
    if(Array.isArray(v)) return new Uint8Array(v);
    if(typeof v === 'object'){
      const keys = Object.keys(v);
      if(keys.length && keys[0]==='0'){
        const out = new Uint8Array(keys.length);
        for(let i=0;i<keys.length;i++) out[i]=v[i];
        return out;
      }
      return new Uint8Array(Object.values(v));
    }
    return new Uint8Array(v);
  }
  const samples = await manager.withPageSlot(async () => {
    const page = await manager.newPage({ backend: manager.config.defaultBackend });
    try {
      const fn = eval(SAMPLE_PIXELS_CODE);
      const sShot = await page.evaluate(fn, screenshotB64, c, rows);
      const sSvg = await page.evaluate(fn, svgPngB64, c, rows);
      return { sShot: toU8(sShot), sSvg: toU8(sSvg) };
    } finally { await page.close().catch(()=>{}); }
  });

  const diff = diffPixels(samples.sShot, samples.sSvg, c, rows);
  const md = formatDiffMarkdown(diff, { url, cols: c, rows, W, H, svgBytes, hybrid });
  console.log(md);
  console.error(`\n📊 diff >30: ${diff.diff30}/${diff.total} ${(diff.pct30*100).toFixed(1)}%  avgΔ=${diff.avgDelta.toFixed(1)} maxΔ=${diff.maxDelta.toFixed(0)}`);
  await fs.writeFile(`${base}.md`, md, "utf8").catch(()=>{});
  // also write heatmap txt
  await fs.writeFile(`${base}-heatmap.txt`, diff.heatmap, "utf8").catch(()=>{});
  // exit code 1 if >2% to signal failure in loop
  if (diff.pct30 > 0.02) {
    console.error(`❌ fidelity >2% — loop continues`);
  } else {
    console.error(`✅ fidelity <2% — still loop per spec, but this iteration passes`);
  }
  return diff;
}

const opts = parseArgs();
runDiff(opts).then(diff => { process.exit(diff.pct30 > 0.02 ? 1 : 0); }).catch(e => { console.error(e.stack || e); process.exit(1); });
