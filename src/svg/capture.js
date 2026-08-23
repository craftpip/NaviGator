import { capturePageAsPdf, getPageDimensions } from './capture-pdf.js';
import { captureDomSnapshot } from './dom-snapshot.js';
import { mergeLayers } from './merge-layers.js';
import { svgExtractor } from './extractor.js';
import { buildSvg } from './builder.js';

export async function capturePageAsSvg(page, opts = {}) {
  const usePdfPath = opts.usePdfPath === true || opts.pdf === true;
  const fullPage = opts.fullPage === true;
  const limit = opts.elementLimit ? Math.max(1, Math.min(5000, Math.floor(Number(opts.elementLimit)))) : 5000;

  if (usePdfPath) {
    try {
      const dims = await getPageDimensions(page);
      const clipW = fullPage ? dims.pageWidth : dims.viewportWidth;
      const clipH = fullPage ? dims.pageHeight : dims.viewportHeight;

      const [pdfResult, domSnapshot] = await Promise.all([
        capturePageAsPdf(page, { clipW, clipH, fullPage }),
        captureDomSnapshot(page),
      ]);

      const mergedSvg = mergeLayers(pdfResult.svg, domSnapshot, {
        includeSelector: opts.includeSelector !== false,
        includeXpath: opts.includeXpath !== false,
        clipW,
        clipH,
        elementLimit: limit,
      });

      const elements = domSnapshot.elements || [];
      const margin = 50;
      const filtered = elements.filter((el) => {
        const r = el.rect;
        return r.x + r.width > -margin && r.x < clipW + margin && r.y + r.height > -margin && r.y < clipH + margin;
      }).slice(0, limit);

      const svgBytes = Buffer.byteLength(mergedSvg, 'utf-8');

      return {
        svg: mergedSvg,
        data: {
          title: domSnapshot.title,
          url: domSnapshot.url,
          viewportWidth: dims.viewportWidth,
          viewportHeight: dims.viewportHeight,
          pageWidth: dims.pageWidth,
          pageHeight: dims.pageHeight,
          bodyBg: domSnapshot.bodyBg,
          htmlBg: domSnapshot.htmlBg,
          scrollX: dims.scrollX,
          scrollY: dims.scrollY,
          elements,
        },
        clipW,
        clipH,
        filtered,
        built: { stats: { bytes: svgBytes } },
        method: 'pdf+dom-snapshot',
      };
    } catch (err) {
      console.warn('PDF path failed, falling back to rect synthesis:', err.message, err.stack?.slice(0, 500));
    }
  }

  try {
    await page.evaluate(async () => {
      if (!document.fonts) return;
      await document.fonts.ready;
      const loads = Array.from(document.fonts).map((f) => f.load().catch(() => {}));
      await Promise.all(loads);
      await document.fonts.ready;
    });
  } catch {}

  const data = await page.evaluate(svgExtractor, limit);
  const clipW = fullPage ? data.pageWidth : data.viewportWidth;
  const clipH = fullPage ? data.pageHeight : data.viewportHeight;
  const margin = 50;
  const filtered = data.elements.filter((el) => {
    const r = el.rect;
    return r.x + r.width > -margin && r.x < clipW + margin && r.y + r.height > -margin && r.y < clipH + margin;
  });
  const built = buildSvg(
    filtered.map((el) => ({
      ...el,
      ...(opts.includeSelector === false ? { selector: undefined } : {}),
      ...(opts.includeXpath === false ? { xpath: undefined } : {}),
    })),
    clipW,
    clipH,
    {
      title: data.title,
      url: data.url,
      viewportWidth: data.viewportWidth,
      viewportHeight: data.viewportHeight,
      pageWidth: data.pageWidth,
      pageHeight: data.pageHeight,
      bodyBg: data.bodyBg,
      htmlBg: data.htmlBg,
      fontLinks: data.fontLinks,
      scrollbar: data.scrollbar,
      html: opts.hybrid ? data.htmlInline || data.html : undefined,
      fullPage,
    },
    { includeSelector: opts.includeSelector !== false, includeXpath: opts.includeXpath !== false },
  );

  return { svg: built.svg, data, built, clipW, clipH, filtered, method: 'rect-synthesis' };
}
