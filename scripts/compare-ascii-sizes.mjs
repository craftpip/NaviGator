#!/usr/bin/env node
// Compares output sizes: regular PNG screenshot vs chafa-style ASCII render.
import { getBrowserManager } from "../src/browser.js";
import { transform } from "../src/ascii.js";
import { SAMPLE_PIXELS_CODE, asciiGridDims } from "../src/pixel-sampler.js";

async function main() {
  const url = process.argv[2] || "https://boniface.pe";
  const widths = [80, 100, 140, 180];

  console.error(`Opening ${url}...`);
  const manager = await getBrowserManager();
  const page = await manager.newPage({ backend: manager.config.defaultBackend });

  try {
    await page.goto(url, {
      waitUntil: manager.config.navWaitUntil,
      timeout: manager.config.browserOpTimeoutMs,
    });
    await new Promise((r) => setTimeout(r, 1500));

    const dims = await page.evaluate(() => ({
      vw: window.innerWidth,
      vh: window.innerHeight,
    }));

    console.log(`### Size comparison — ${url}`);
    console.log(`Viewport: ${dims.vw}x${dims.vh}\n`);
    console.log("| Render | Width | Size (KB) | Notes |");
    console.log("|--------|-------|-----------|-------|");

    // PNG screenshot sizes
    for (const fmt of ["png", "jpeg"]) {
      const opts = { type: fmt, encoding: "base64" };
      if (fmt === "jpeg") opts.quality = 75;
      const shot = await page.screenshot(opts);
      const kb = (shot.length * 3 / 4) / 1024; // base64 -> bytes approx
      console.log(`| PNG screenshot (${fmt}) | full | ${kb.toFixed(1)} | raw base64 ${(shot.length / 1024).toFixed(1)} |`);
    }

    // ASCII renders
    const shot = await page.screenshot({ type: "png", encoding: "base64" });
    for (const width of widths) {
      const { cols, rows } = asciiGridDims(dims.vw, dims.vh, width);
      const sampleFn = eval(SAMPLE_PIXELS_CODE);
      const samples = await page.evaluate(sampleFn, shot, cols, rows);
      const result = transform(samples, cols, rows, [], dims.vw, dims.vh);
      const kb = Buffer.byteLength(result.ansi, "utf8") / 1024;
      console.log(`| ASCII render | ${cols} | ${kb.toFixed(1)} | ${cols}x${rows} cells |`);
    }
  } finally {
    await page.close().catch(() => {});
  }
  await manager.shutdown().catch(() => {});
}

main().catch((err) => {
  console.error(`FAILED: ${err.message}`);
  process.exit(1);
});
