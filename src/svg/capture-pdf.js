import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFile, unlink, mkdtemp } from 'node:fs/promises';

const PDF_DPI = 72;

export async function capturePageAsPdf(page, opts = {}) {
  const clipW = opts.clipW;
  const clipH = opts.clipH;

  const cdp = await page.target().createCDPSession();

  try {
    await cdp.send('Emulation.setEmulatedMedia', { media: 'screen' });
  } catch (e) {
    console.warn('Emulation.setEmulatedMedia failed:', e.message);
  }

  // Clip-aware paper: CSS px → inches at 72dpi (scale:1 → 1 CSS px = 1 pt)
  // If clip not yet known, fall back to viewport-derived size via fullPage flag
  let paperWidth = 8.5;
  let paperHeight = 11;
  if (clipW && clipH) {
    paperWidth = Math.max(1, clipW / PDF_DPI);
    paperHeight = Math.max(1, clipH / PDF_DPI);
  } else {
    const fullPage = opts.fullPage === true;
    if (fullPage) {
      const dims = await page.evaluate(() => ({
        w: document.documentElement.scrollWidth,
        h: document.documentElement.scrollHeight,
      }));
      paperWidth = Math.max(1, dims.w / PDF_DPI);
      paperHeight = Math.max(1, dims.h / PDF_DPI);
    }
  }

  const pdfResult = await cdp.send('Page.printToPDF', {
    printBackground: true,
    paperWidth,
    paperHeight,
    marginTop: 0,
    marginBottom: 0,
    marginLeft: 0,
    marginRight: 0,
    preferCSSPageSize: false,
    scale: 1,
    displayHeaderFooter: false,
  });

  await cdp.detach();

  const pdfBuffer = Buffer.from(pdfResult.data, 'base64');
  const tmpDir = await mkdtemp(join(tmpdir(), 'svg-pdf-'));
  const pdfPath = join(tmpDir, 'page.pdf');
  await writeFile(pdfPath, pdfBuffer);

  const rawSvg = await new Promise((resolve, reject) => {
    const proc = spawn('mutool', ['draw', '-F', 'svg', pdfPath, '1']);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('close', (code) => {
      if (code === 0 && stdout.length > 100) resolve(stdout);
      else reject(new Error(`mutool failed (${code}): ${stderr}`));
    });
    proc.on('error', reject);
  });

  await unlink(pdfPath);
  await unlink(tmpDir).catch(() => {});

  // Normalize viewBox/width/height to clipW×clipH if provided; otherwise keep mutool values
  let svg = rawSvg;
  if (clipW && clipH) {
    // mutool viewBox is 0 0 paperWidth*72 paperHeight*72 = clipW×clipH already when paper derived from clip
    // Just enforce width/height/viewBox to clip for oracle consistency
    svg = svg.replace(/width="[^"]+"/, `width="${clipW}"`);
    svg = svg.replace(/height="[^"]+"/, `height="${clipH}"`);
    if (!/viewBox=/.test(svg)) {
      svg = svg.replace(/<svg/, `<svg viewBox="0 0 ${clipW} ${clipH}"`);
    } else {
      svg = svg.replace(/viewBox="[^"]+"/, `viewBox="0 0 ${clipW} ${clipH}"`);
    }
  }

  return { svg, pdfBuffer };
}

// Legacy export kept for capture.js compat; now no scaling is needed when clip-aware
export function scaleSvgToViewport(svg, viewportWidth, viewportHeight) {
  // No-op when caller already passed clipW/clipH; kept for API compat
  if (!viewportWidth || !viewportHeight) return svg;
  const viewBoxMatch = svg.match(/viewBox="([^"]+)"/);
  if (!viewBoxMatch) return svg;
  const [, , vw, vh] = viewBoxMatch[1].split(/\s+/).map(Number);
  // If already matches, return as-is
  if (Math.abs(vw - viewportWidth) < 1 && Math.abs(vh - viewportHeight) < 1) return svg;
  let result = svg;
  result = result.replace(/width="[^"]+"/, `width="${viewportWidth}"`);
  result = result.replace(/height="[^"]+"/, `height="${viewportHeight}"`);
  result = result.replace(/viewBox="[^"]+"/, `viewBox="0 0 ${viewportWidth} ${viewportHeight}"`);
  return result;
}

export async function getPageDimensions(page) {
  return await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    pageWidth: document.documentElement.scrollWidth,
    pageHeight: document.documentElement.scrollHeight,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  }));
}
