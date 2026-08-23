function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeAttr(str) {
  return escapeXml(str).replace(/\n/g, ' ').slice(0, 500);
}

export function mergeLayers(pdfSvg, domSnapshot, opts = {}) {
  const domElements = domSnapshot?.elements || [];
  const includeSelector = opts.includeSelector !== false;
  const includeXpath = opts.includeXpath !== false;
  const clipW = opts.clipW;
  const clipH = opts.clipH;

  // Filter to viewport/page clip if provided (mirrors capture.js filtered)
  let elements = domElements;
  if (clipW && clipH) {
    const margin = 50;
    elements = domElements.filter((el) => {
      const r = el.rect;
      if (!r) return false;
      return r.x + r.width > -margin && r.x < clipW + margin && r.y + r.height > -margin && r.y < clipH + margin;
    });
    // Respect elementLimit if caller passed it via opts
    if (opts.elementLimit) {
      const lim = Math.max(1, Math.min(500, Math.floor(Number(opts.elementLimit))));
      elements = elements.slice(0, lim);
    }
  }

  // Build transparent overlay rects with data-* — visual layer stays untouched (PDF paths)
  const overlayRects = elements
    .map((el, i) => {
      const r = el.rect;
      if (!r || r.width <= 0 || r.height <= 0) return '';
      const x = Math.round(r.x);
      const y = Math.round(r.y);
      const w = Math.round(r.width);
      const h = Math.round(r.height);
      const tag = escapeAttr(el.tag || 'div');
      const selector = includeSelector ? ` data-selector="${escapeAttr(el.selector || '')}"` : '';
      const xpath = includeXpath ? ` data-xpath="${escapeAttr(el.xpath || '')}"` : '';
      const text = ` data-text="${escapeAttr(el.text || '')}"`;
      let styles = '';
      if (el.style) {
        const parts = [];
        for (const [k, v] of Object.entries(el.style)) {
          if (v && v !== 'none' && v !== 'normal' && v !== '0px' && v !== 'rgba(0, 0, 0, 0)' && v !== 'transparent') {
            parts.push(`${k}:${String(v).slice(0, 80)}`);
          }
          if (parts.length >= 12) break;
        }
        if (parts.length) styles = ` data-styles="${escapeAttr(parts.join(';'))}"`;
      }
      // Transparent rect carries geometry for agent; invisible to eye but hit-testable for debug (hover)
      return `<g data-index="${i}" data-tag="${tag}" data-x="${x}" data-y="${y}" data-width="${w}" data-height="${h}"${selector}${xpath}${text}${styles}><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="none" data-geometry="true"/><title>${escapeXml((el.text || '').slice(0, 120))}</title></g>`;
    })
    .join('\n');

  const overlayGroup = `<g id="geometry-overlay" data-geometry-overlay="true">\n${overlayRects}\n</g>`;

  // Inject overlay before closing </svg>; also inject data-* counters on root <svg>
  let result = pdfSvg;
  // Add counters to root svg tag
  result = result.replace(/<svg([^>]*)>/, (m, attrs) => {
    const extra = ` data-matched="${elements.length}" data-total="${domElements.length}" data-overlay="${elements.length}"`;
    // Ensure viewBox/width/height already normalized by capture-pdf; keep as-is
    return `<svg${attrs}${extra}>`;
  });

  const closeIdx = result.lastIndexOf('</svg>');
  if (closeIdx !== -1) {
    result = result.slice(0, closeIdx) + overlayGroup + '\n' + result.slice(closeIdx);
  } else {
    result += '\n' + overlayGroup + '\n</svg>';
  }

  return result;
}
