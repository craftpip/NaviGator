// src/svg/builder.js — SVG assembly: rects, clipPaths, gradients, shadows, text placement, hybrid foreignObject
// Owner: Agent D — Renderer (depends on Text + Style + Utils)
import { escapeXml, clampRadius, parseRadius, parseRadii, radiiEqual, buildRadiusPath, isTransparentColor, rectContains, shouldSkipContainerText } from './utils.js';
import { parseSimpleLinearGradient, parseSimpleRadialGradient, parseBoxShadows } from './style.js';
import { measureTextWidth, maxCharsFitting, appendEllipsis, wrapTextToWidth, wrapWithWordWidths } from './text.js';

function formatLegend(elements, options = {}) {
  const includeSelector = options.includeSelector !== false;
  const includeXpath = options.includeXpath !== false;

  const headerParts = ["#", "Kind", "Tag"];
  const sepParts = ["---", "------", "-----"];
  if (includeSelector) {
    headerParts.push("Selector");
    sepParts.push("----------");
  }
  if (includeXpath) {
    headerParts.push("XPath");
    sepParts.push("-------");
  }
  headerParts.push("Text");
  sepParts.push("------");

  const rows = [
    `| ${headerParts.join(" | ")} |`,
    `| ${sepParts.join(" | ")} |`,
  ];

  for (const el of elements) {
    const text = String(el.text ?? "")
      .replace(/\|/g, "\\|")
      .replace(/\n/g, " ")
      .trim()
      .slice(0, 80);
    const cells = [
      String(el.index),
      el.kind || "—",
      `\`${escapeXml(el.tagName || "?")}\``,
    ];
    if (includeSelector) {
      cells.push(escapeXml((el.selector || "—")).replace(/\|/g, "\\|").slice(0, 60));
    }
    if (includeXpath) {
      cells.push(escapeXml((el.xpath || "—")).replace(/\|/g, "\\|").slice(0, 60));
    }
    cells.push(text || "—");
    rows.push(`| ${cells.join(" | ")} |`);
  }

  return rows.join("\n");
}

// Core builder — independent, no ascii reuse
function buildSvg(elements, width, height, metadata = {}, options = {}) {
  const includeSelector = options.includeSelector !== false;
  const includeXpath = options.includeXpath !== false;

  const W = Math.max(1, Math.round(Number(width) || 1920));
  const H = Math.max(1, Math.round(Number(height) || 1080));
  const safeElements = Array.isArray(elements) ? elements : [];

  const title = escapeXml(metadata.title || "Page");
  const url = escapeXml(metadata.url || "");
  const viewportW = metadata.viewportWidth ?? W;
  const viewportH = metadata.viewportHeight ?? H;
  const pageW = metadata.pageWidth ?? W;
  const pageH = metadata.pageHeight ?? H;
  const fullPage = Boolean(metadata.fullPage);
  const now = new Date().toISOString();

  // Dedup already done browser-side; just filter invalid rects
  const filtered = [];
  for (const el of safeElements) {
    const r = el.rect;
    if (!r || !Number.isFinite(r.x) || !Number.isFinite(r.y) || !Number.isFinite(r.width) || !Number.isFinite(r.height)) continue;
    if (r.width <= 0 || r.height <= 0) continue;
    // allow slight negative / overflow with margin later, but builder keeps all that passed filter
    filtered.push(el);
  }

  // Painter's algorithm: SVG paints <g> elements in emission order, but capture
  // order (extractor query sweeps) can emit an ancestor container AFTER its
  // descendants — an opaque ancestor rect then erases its own children (the
  // webcontentextraction.org leaderboard bug: section>div bg wiped the table).
  // Browsers always paint ancestors before descendants, so sort by DOM depth
  // from xpath, stable by capture order within the same depth.
  const domDepth = (xp) => String(xp || "").split("/").filter(Boolean).length;
  for (let i = 0; i < filtered.length; i++) filtered[i]._captureOrder = i;
  filtered.sort((a, b) => {
    const d = domDepth(a.xpath) - domDepth(b.xpath);
    return d !== 0 ? d : a._captureOrder - b._captureOrder;
  });

  const pageBgRaw = metadata.bodyBg || metadata.htmlBg || "";
  const pageBg = !isTransparentColor(pageBgRaw) ? String(pageBgRaw).trim() : "#ffffff";
  const fontLinks = Array.isArray(metadata.fontLinks) ? metadata.fontLinks.filter(u=>typeof u==='string' && u.startsWith('http')).slice(0,3) : [];
  const fontImports = ""; // Arial + mono are system fonts — no @import, keeps SVG minimal per §14.8
  const style = `<style>
svg { background: ${escapeXml(pageBg)}; }
rect { vector-effect: non-scaling-stroke; }
text { pointer-events: none; user-select: none; font-family: Arial, Helvetica, sans-serif; }
g:hover rect { filter: brightness(0.97) drop-shadow(0 0 2px rgba(0,0,0,.12)); }
image { pointer-events: none; }
</style>`;

  const parts = [];
  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" ` +
      `data-page-url="${url}" data-page-title="${title}" ` +
      `data-viewport-width="${viewportW}" data-viewport-height="${viewportH}" ` +
      `data-page-width="${pageW}" data-page-height="${pageH}" data-full-page="${fullPage ? "true" : "false"}" ` +
      `role="img" aria-label="Layout snapshot of ${url || title}">`
  );
  parts.push(`<title>${title}${url ? ` — ${url}` : ""}</title>`);
  parts.push(`<desc>${W}×${H} · ${filtered.length} elements · ${now} · mode: render (filled rects${metadata.html ? '+foreignObject' : ''})</desc>`);
  parts.push(style);
  // page background — perfect: use captured body/html bg, not hardcoded white
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="${escapeXml(pageBg)}" stroke="none" />`);
  const sb = metadata.scrollbar;
  const isHybrid = !!(metadata.html && typeof metadata.html === 'string' && metadata.html.length > 100);
  if (!isHybrid && !fullPage && sb && sb.visible && sb.width>0) {
    const sw = Math.round(sb.width);
    const th = Math.round(sb.thumbH);
    const ty = Math.round(sb.thumbY);
    parts.push(`<rect x="${W-sw}" y="0" width="${sw}" height="${H}" fill="#f1f1f1" stroke="#e5e7eb" stroke-width="1" />`);
    parts.push(`<rect x="${W-sw+2}" y="${ty}" width="${sw-4}" height="${th}" rx="4" ry="4" fill="#c1c1c1" stroke="#a8a8a8" stroke-width="1" />`);
  }
  // hybrid foreignObject for 100% visual fidelity (when metadata.html is provided) — browser renders HTML inside SVG exactly as screenshot
  // For hybrid, element rects below will be transparent (geometry only), visual comes from foreignObject
  if (isHybrid) {
    const htmlEscaped = metadata.html.replace(/<\/foreignObject>/g, '').slice(0, 800000);
    // foreignObject content must be auto-height so html/body block-size not clamped to W×H viewport box
    parts.push(`<foreignObject x="0" y="0" width="${W}" height="${H}"><div xmlns="http://www.w3.org/1999/xhtml" style="margin:0;padding:0;background:${escapeXml(pageBg)};width:${W}px;min-height:${H}px;overflow:visible;box-sizing:border-box">${htmlEscaped}</div></foreignObject>`);
  }

  // clip paths for rounded images/canvas/iframe, overflow:hidden boxes, and inset shadows (perfect overflow + inner shadow clip)
  const needsClip = filtered.some((el) => {
    const rx = clampRadius(parseRadius(el.style?.radius), el.rect.width, el.rect.height);
    if (rx > 0 && (el.tagName === "img" || el.tagName === "canvas" || el.tagName === "iframe") && el.src) return true;
    const st = el.style || {};
    const ov = String(st.overflow || "").toLowerCase();
    const ovx = String(st.overflowX || "").toLowerCase();
    const ovy = String(st.overflowY || "").toLowerCase();
    if (ov === "hidden" || ovx === "hidden" || ovy === "hidden" || ov === "clip" || ovx === "clip" || ovy === "clip") return true;
    if (st.boxShadow && String(st.boxShadow).toLowerCase().includes('inset')) return true;
    return false;
  });
  // Satori-inspired defs: clipPaths + gradients + shadows (Satori's rect.ts builds defs for backgroundImage/boxShadow)
  // Deduplicate: collect clipPaths here, merge with grad/shadow defs into single <defs> below
  const clipDefs = [];
  if (needsClip) {
    for (const el of filtered) {
      const r = el.rect;
      const rx = clampRadius(parseRadius(el.style?.radius), el.rect.width, el.rect.height);
      const st = el.style || {};
      const ov = String(st.overflow || "").toLowerCase();
      const ovx = String(st.overflowX || "").toLowerCase();
      const ovy = String(st.overflowY || "").toLowerCase();
      const needsOverflowClip = ov === "hidden" || ovx === "hidden" || ovy === "hidden" || ov === "clip" || ovx === "clip" || ovy === "clip";
      const needsRxClip = rx > 0 && (el.tagName === "img" || el.tagName === "canvas" || el.tagName === "iframe") && el.src;
      const needsInsetClip = st.boxShadow && String(st.boxShadow).toLowerCase().includes('inset');
      if (!needsOverflowClip && !needsRxClip && !needsInsetClip) continue;
      // for overflow clip, use rx if present, else 0
      const useRx = needsRxClip ? rx : clampRadius(parseRadius(st.radius), r.width, r.height);
      clipDefs.push(
        `<clipPath id="clip-${el.index}"><rect x="${Math.round(r.x)}" y="${Math.round(r.y)}" width="${Math.round(r.width)}" height="${Math.round(r.height)}" rx="${useRx}" ry="${useRx}"/></clipPath>`
      );
    }
  }
  // Collect gradient + shadow + filter defs (Satori's background-image.js / shadow.js pattern) - injected before elements
  // Hybrid: visual comes from foreignObject, so skip SVG gradient/shadow defs (native HTML renders them)
  // Dedup content-aware: same backgroundImage / boxShadow string reuses one def (was grad-N per element)
  const gradDefs = [];
  const shadowDefs = [];
  const blurDefs = [];
  const linearGradCache = new Map(); // bgKey -> gid
  const radialGradCache = new Map(); // bgKey -> gid
  const shadowCache = new Map(); // boxShadow string -> sid
  const blurCache = new Map(); // blurVal -> fid
  const comboCache = new Map(); // shKey|blurVal -> comboId
  const gradDefIds = new Set();
  const shadowDefIds = new Set();
  for (const el of filtered) {
    if (isHybrid) continue; // hybrid foreignObject renders gradients natively, skip SVG defs
    const st = el.style || {};
    if (st.backgroundImage) {
      const bgKey = String(st.backgroundImage).trim();
      // radial-gradient priority over linear (if both present, radial wins for fill)
      if (bgKey.includes('radial-gradient')) {
        const rg = parseSimpleRadialGradient(bgKey);
        if (rg) {
          let gid = radialGradCache.get(bgKey);
          if (!gid) {
            gid = `radial-${el.index}`;
            // ensure uniqueness if index collision with earlier deduped id
            let n = 1;
            while (gradDefIds.has(gid)) { gid = `radial-${el.index}-${n++}`; }
            const srcStops = rg.stops && rg.stops.length ? rg.stops : rg.colors.map(c=>({color:c, offset:null}));
            const stops = srcStops.map((s, i) => {
              const off = s.offset || `${Math.round((i/(srcStops.length-1))*100)}%`;
              return `<stop offset="${off}" stop-color="${escapeXml(s.color)}"/>`;
            }).join('');
            gradDefs.push(`<radialGradient id="${gid}" cx="50%" cy="50%" r="50%">${stops}</radialGradient>`);
            gradDefIds.add(gid);
            radialGradCache.set(bgKey, gid);
          }
          el._radialId = gid;
        } else {
          // fallback: try linear if radial parse failed (e.g. mixed layers)
          const g = parseSimpleLinearGradient(bgKey);
          if (g) {
            let gid = linearGradCache.get(bgKey);
            if (!gid) {
              gid = `grad-${el.index}`;
              let n = 1;
              while (gradDefIds.has(gid)) { gid = `grad-${el.index}-${n++}`; }
              const srcStops = g.stops && g.stops.length ? g.stops : g.colors.map(c=>({color:c, offset:null}));
              const stops = srcStops.map((s, i) => {
                const off = s.offset || `${Math.round((i/(srcStops.length-1))*100)}%`;
                return `<stop offset="${off}" stop-color="${escapeXml(s.color)}"/>`;
              }).join('');
              gradDefs.push(`<linearGradient id="${gid}" x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}">${stops}</linearGradient>`);
              gradDefIds.add(gid);
              linearGradCache.set(bgKey, gid);
            }
            el._gradId = gid;
          }
        }
      } else {
        const g = parseSimpleLinearGradient(bgKey);
        if (g) {
          let gid = linearGradCache.get(bgKey);
          if (!gid) {
            gid = `grad-${el.index}`;
            let n = 1;
            while (gradDefIds.has(gid)) { gid = `grad-${el.index}-${n++}`; }
            const srcStops = g.stops && g.stops.length ? g.stops : g.colors.map(c=>({color:c, offset:null}));
            const stops = srcStops.map((s, i) => {
              const off = s.offset || `${Math.round((i/(srcStops.length-1))*100)}%`;
              return `<stop offset="${off}" stop-color="${escapeXml(s.color)}"/>`;
            }).join('');
            gradDefs.push(`<linearGradient id="${gid}" x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}">${stops}</linearGradient>`);
            gradDefIds.add(gid);
            linearGradCache.set(bgKey, gid);
          }
          el._gradId = gid;
        }
      }
    }
    if (st.boxShadow) {
      const shKey = String(st.boxShadow).trim();
      if (shadowCache.has(shKey)) {
        el._shadowId = shadowCache.get(shKey);
      } else {
        const shs = parseBoxShadows(shKey);
        if (shs.length) {
          const sid = `shadow-${el.index}`;
          let filterContent = '';
          const outerNodes = [];
          let hasInset = false;
          shs.forEach((sh, i) => {
            if (sh.inset) {
              hasInset = true;
              const morph = sh.spread !== 0 ? `<feMorphology operator="dilate" radius="${escapeXml(String(Math.abs(sh.spread)))}" operator="${sh.spread>0?'dilate':'erode'}" in="SourceAlpha" result="morphAlpha${i}"/>` : ``;
              const offIn = sh.spread !== 0 ? `morphAlpha${i}` : `SourceAlpha`;
              filterContent += `${morph}<feOffset dx="${sh.dx}" dy="${sh.dy}" in="${offIn}" result="off${i}"/><feGaussianBlur in="off${i}" stdDeviation="${Math.max(0, sh.blur/2)}" result="blur${i}"/><feComposite operator="out" in="blur${i}" in2="SourceGraphic" result="compOut${i}"/><feFlood flood-color="${escapeXml(sh.color)}" flood-opacity="0.7" result="flood${i}"/><feComposite operator="in" in="flood${i}" in2="compOut${i}" result="inner${i}"/><feComposite operator="over" in="inner${i}" in2="SourceGraphic" result="insetOut${i}"/>`;
            } else {
              if (sh.spread !== 0) {
                filterContent += `<feMorphology operator="${sh.spread>0?'dilate':'erode'}" radius="${escapeXml(String(Math.abs(sh.spread)))}" in="SourceAlpha" result="morph${i}"/><feGaussianBlur in="morph${i}" stdDeviation="${Math.max(0, sh.blur/2)}" result="blur${i}"/><feOffset dx="${sh.dx}" dy="${sh.dy}" in="blur${i}" result="off${i}"/><feFlood flood-color="${escapeXml(sh.color)}" flood-opacity="0.9" result="flood${i}"/><feComposite operator="in" in="flood${i}" in2="off${i}" result="comp${i}"/>`;
                outerNodes.push(`<feMergeNode in="comp${i}"/>`);
              } else {
                filterContent += `<feDropShadow dx="${sh.dx}" dy="${sh.dy}" stdDeviation="${Math.max(0, sh.blur/2)}" flood-color="${escapeXml(sh.color)}" flood-opacity="0.9" result="drop${i}"/>`;
                outerNodes.push(`<feMergeNode in="drop${i}"/>`);
              }
            }
          });
          if (outerNodes.length) {
            filterContent += `<feMerge>${outerNodes.join('')}<feMergeNode in="SourceGraphic"/></feMerge>`;
          } else if (hasInset) {
            // inset already composites over SourceGraphic per shadow; final is last insetOut
            // ensure clip via clipPath on <g> (already set via needsClip)
          }
          // avoid duplicate id if same index reused across grad/shadow (dedup ensures one push)
          if (!shadowDefIds.has(sid)) {
            shadowDefs.push(`<filter id="${sid}" x="-20%" y="-20%" width="140%" height="140%">${filterContent}</filter>`);
            shadowDefIds.add(sid);
          }
          shadowCache.set(shKey, sid);
          el._shadowId = sid;
        }
      }
    }
    if (st.filter && String(st.filter).includes('blur(')) {
      const m = String(st.filter).match(/blur\(\s*([\d.]+)px\s*\)/i);
      if (m) {
        const blurVal = parseFloat(m[1]);
        if (Number.isFinite(blurVal) && blurVal > 0) {
          const blurKey = String(blurVal);
          if (blurCache.has(blurKey)) {
            el._blurId = blurCache.get(blurKey);
          } else {
            let fid = `filter-${el.index}`;
            let n = 1;
            while (shadowDefIds.has(fid) || gradDefIds.has(fid)) { fid = `filter-${el.index}-${n++}`; }
            const blurContent = `<feGaussianBlur stdDeviation="${escapeXml(String(blurVal/2))}"/>`;
            blurDefs.push(`<filter id="${fid}" x="-20%" y="-20%" width="140%" height="140%">${blurContent}</filter>`);
            blurCache.set(blurKey, fid);
            el._blurId = fid;
          }
        }
      }
    }
    // compose shadow + blur into single filter if both present (SVG filter can only have one url) — dedup content-aware
    if (el._shadowId && el._blurId) {
      const shKey2 = String(st.boxShadow).trim();
      const m2 = String(st.filter).match(/blur\(\s*([\d.]+)px\s*\)/i);
      const blurVal = m2 ? parseFloat(m2[1]) : 0;
      const comboKey = `${shKey2}|${blurVal}`;
      if (comboCache.has(comboKey)) {
        el._comboId = comboCache.get(comboKey);
      } else {
        const shs = parseBoxShadows(shKey2);
        const comboId = `combo-${el.index}`;
        let shadowInner = '';
        const outerNodes = [];
        let hasInset=false;
        shs.forEach((sh,i)=>{
          if(sh.inset){
            hasInset=true;
            const morph = sh.spread !==0 ? `<feMorphology operator="${sh.spread>0?'dilate':'erode'}" radius="${escapeXml(String(Math.abs(sh.spread)))}" in="SourceAlpha" result="morphAlpha${i}"/>` : ``;
            const offIn = sh.spread!==0 ? `morphAlpha${i}` : `SourceAlpha`;
            shadowInner += `${morph}<feOffset dx="${sh.dx}" dy="${sh.dy}" in="${offIn}" result="off${i}"/><feGaussianBlur in="off${i}" stdDeviation="${Math.max(0, sh.blur/2)}" result="blur${i}"/><feComposite operator="out" in="blur${i}" in2="SourceGraphic" result="compOut${i}"/><feFlood flood-color="${escapeXml(sh.color)}" flood-opacity="0.7" result="flood${i}"/><feComposite operator="in" in="flood${i}" in2="compOut${i}" result="inner${i}"/><feComposite operator="over" in="inner${i}" in2="SourceGraphic" result="insetOut${i}"/>`;
          } else {
            if(sh.spread!==0){
              shadowInner += `<feMorphology operator="${sh.spread>0?'dilate':'erode'}" radius="${escapeXml(String(Math.abs(sh.spread)))}" in="SourceAlpha" result="morph${i}"/><feGaussianBlur in="morph${i}" stdDeviation="${Math.max(0, sh.blur/2)}" result="blur${i}"/><feOffset dx="${sh.dx}" dy="${sh.dy}" in="blur${i}" result="off${i}"/><feFlood flood-color="${escapeXml(sh.color)}" flood-opacity="0.9" result="flood${i}"/><feComposite operator="in" in="flood${i}" in2="off${i}" result="comp${i}"/>`;
              outerNodes.push(`<feMergeNode in="comp${i}"/>`);
            } else {
              shadowInner += `<feDropShadow dx="${sh.dx}" dy="${sh.dy}" stdDeviation="${Math.max(0, sh.blur/2)}" flood-color="${escapeXml(sh.color)}" flood-opacity="0.9" result="drop${i}"/>`;
              outerNodes.push(`<feMergeNode in="drop${i}"/>`);
            }
          }
        });
        if(outerNodes.length) shadowInner += `<feMerge>${outerNodes.join('')}<feMergeNode in="SourceGraphic"/></feMerge>`;
        let cid = comboId;
        let n = 1;
        while (shadowDefIds.has(cid) || gradDefIds.has(cid)) { cid = `combo-${el.index}-${n++}`; }
        shadowDefs.push(`<filter id="${cid}" x="-20%" y="-20%" width="140%" height="140%">${shadowInner}<feGaussianBlur stdDeviation="${escapeXml(String(blurVal/2))}" result="finalBlur"/></filter>`);
        shadowDefIds.add(cid);
        comboCache.set(comboKey, cid);
        el._comboId = cid;
      }
    }
  }
  // Single deduped <defs> block: clipPaths + gradients + shadows + blurs (was two blocks)
  if (clipDefs.length || gradDefs.length || shadowDefs.length || blurDefs.length) {
    parts.push(`<defs>${clipDefs.join('')}${gradDefs.join('')}${shadowDefs.join('')}${blurDefs.join('')}</defs>`);
  }

  for (const el of filtered) {
    const idx = el.index;
    const tag = escapeXml(el.tagName || "div");
    const kind = escapeXml(el.kind || "container");
    const selector = escapeXml(el.selector || "");
    const xpath = escapeXml(el.xpath || "");
    const role = escapeXml(el.role || "");
    const textRaw = String(el.text ?? "");
    const fullTextAttr = escapeXml(textRaw.slice(0, 200));
    const href = escapeXml(el.href || "");
    const src = escapeXml(el.src || "");
    const alt = escapeXml(el.alt || "");
    const value = escapeXml(el.value ?? "");
    const placeholder = escapeXml(el.placeholder ?? "");
    const typeAttr = escapeXml(el.type ?? "");

    const r = el.rect;
    const x = Math.round(r.x);
    const y = Math.round(r.y);
    const w = Math.round(r.width);
    const h = Math.round(r.height);

    const st = el.style || {};
    const bg = isTransparentColor(st.bg) ? null : String(st.bg).trim();
    const color = st.color && !isTransparentColor(st.color) ? String(st.color).trim() : "#111111";
    const borderColor = isTransparentColor(st.borderColor) ? null : String(st.borderColor).trim();
    const borderWidthRaw = parseFloat(String(st.borderWidth || ""));
    const borderWidth = Number.isFinite(borderWidthRaw) && borderWidthRaw > 0 ? Math.min(borderWidthRaw, 6) : 0;
    const opacityRaw = Number(st.opacity);
    const opacity = Number.isFinite(opacityRaw) && opacityRaw >= 0 && opacityRaw <= 1 ? opacityRaw : 1;
    const fontSizeRaw = parseFloat(st.fontSize);
    // Exact fractional font size (§14): rounding 11.2px→11 shrinks every glyph;
    // in a word that error accumulates per character and desyncs the whole run
    // against the screenshot. SVG supports fractional sizes — emit as measured.
    const fontSize = Number.isFinite(fontSizeRaw) && fontSizeRaw > 0 ? Math.min(Math.max(7, Math.round(fontSizeRaw * 100) / 100), 48) : 12;
    const rawFam = String(st.fontFamily || "").toLowerCase();
    const isMonoFam = /mono|consolas|courier|menlo|jetbrains|code|roboto mono|source code/i.test(rawFam);
    // Font fidelity (§14): emit the page's own computed font stack so the SVG
    // rasterizes with the same glyphs the browser used. Forcing a generic
    // "Arial" stack made every glyph's edges differ from the screenshot
    // (~5% of pixels per band on text-dense pages). Keep the mono heuristic
    // only as fallback when the page font family is unavailable.
    const rawFamily = String(st.fontFamily || "").trim();
    const fontFamily = rawFamily && rawFamily !== "normal" ? rawFamily : (isMonoFam ? "ui-monospace, Menlo, monospace" : "Arial, Helvetica, sans-serif");
    const radii = parseRadii(st.radius);
    const rx = clampRadius(parseRadius(st.radius), w, h);
    const radiiClamped = radii.map((v)=> clampRadius(v, w, h));
    const usePathForRadius = !radiiEqual(radiiClamped) && radiiClamped.some(v=>v>0);
    const z = Number.isFinite(Number(el.z)) ? Number(el.z) : 0;
    const overflow = String(st.overflow || "").toLowerCase();
    const overflowX = String(st.overflowX || "").toLowerCase();
    const overflowY = String(st.overflowY || "").toLowerCase();
    const needsOverflowClip = overflow === "hidden" || overflowX === "hidden" || overflowY === "hidden" || overflow === "clip" || overflowX === "clip" || overflowY === "clip";
    const needsInsetClip = st.boxShadow && String(st.boxShadow).toLowerCase().includes('inset');
    const needsClipForG = needsOverflowClip || needsInsetClip;
    const whiteSpace = String(st.whiteSpace || "normal").toLowerCase();
    const textOverflow = String(st.textOverflow || "clip").toLowerCase();
    // Parent-child text dedup: when descendant elements already emit this
    // element's text (wrapper divs over their children, a.logo over its span,
    // td over an inner a), emitting both doubles the ink. Skip the ancestor
    // when descendant emitters' texts tile ALL of its words (≥2-char words).
    // A partial fragment (<b> inside a paragraph) does NOT cover its parent.
    let coveredByDescendant = false;
    if (textRaw.trim().length >= 3 && !isHybrid) {
      const words = textRaw.trim().split(/\s+/).filter(w => w.length >= 2);
      if (words.length) {
        const vocab = new Set();
        for (const other of filtered) {
          if (other === el) continue;
          if (!other.rect || other.kind === "container" || other.kind === "table") continue;
          const ot = String(other.text ?? "").trim();
          if (ot.length < 3) continue;
          if (!rectContains(el.rect, other.rect)) continue;
          for (const w of ot.split(/\s+/)) vocab.add(w);
          if (vocab.size >= words.length) break;
        }
        // ≥70% tiling suppresses the ancestor: double ink penalizes every
        // glyph edge twice, while an uncovered stray token (live counters,
        // emoji badges) is rare and cheap by comparison.
        let hits = 0;
        for (const w of words) if (vocab.has(w)) hits++;
        coveredByDescendant = hits / words.length >= 0.7;
      }
    }
    // P0: extra visual props
    const textDecoLine = String(st.textDecorationLine || "").toLowerCase();
    const textDecoColor = st.textDecorationColor || "";
    const textDecoStyle = String(st.textDecorationStyle || "").toLowerCase();
    const textTransformVal = String(st.textTransform || "").toLowerCase();
    const verticalAlign = String(st.verticalAlign || "").toLowerCase();
    const transformOrigin = st.transformOrigin || "";
    const objectFit = String(st.objectFit || "").toLowerCase();
    const objectPosition = String(st.objectPosition || "").toLowerCase();
    const outlineOffset = st.outlineOffset || "";
    const clipPathVal = st.clipPath || "";
    // Satori's transform handling: capture matrix and apply as SVG transform (Satori's transform.js)
    const svgTransform = st.transform && st.transform !== 'none' ? String(st.transform).trim() : '';
    // lineHeight: use computed exact float (was rounded → 1px drift on header NAVIGATOR 20px→25 vs 20.8) — keep float for tspan dy
    let lineHeightVal = parseFloat(String(st.lineHeight || ""));
    if (!Number.isFinite(lineHeightVal) || String(st.lineHeight).toLowerCase() === "normal") lineHeightVal = fontSize * 1.25;
    const lineHeightExact = lineHeightVal; // keep float for dy
    // for budget, use rounded for backward compat
    lineHeightVal = Math.round(lineHeightVal);
    const letterSpacingVal = String(st.letterSpacing || "normal").toLowerCase() === "normal" ? "0" : String(st.letterSpacing);

    // group attributes — add Satori-inspired transform + shadow/blur filter (compose when both present)
    let shadowFilter = "";
    if (el._comboId) shadowFilter = ` filter="url(#${el._comboId})"`;
    else if (el._shadowId && el._blurId) shadowFilter = ` filter="url(#${el._shadowId}) url(#${el._blurId})"`;
    else if (el._shadowId) shadowFilter = ` filter="url(#${el._shadowId})"`;
    else if (el._blurId) shadowFilter = ` filter="url(#${el._blurId})"`;
    const transformAttr = svgTransform ? ` transform="${escapeXml(svgTransform)}"` : "";
    const transformOriginAttr = svgTransform && transformOrigin ? ` data-transform-origin="${escapeXml(transformOrigin)}" style="transform-origin:${escapeXml(transformOrigin)}"` : transformOrigin ? ` data-transform-origin="${escapeXml(transformOrigin)}"` : "";
    const gAttrs = [
      `id="el-${idx}"`,
      `data-index="${idx}"`,
      `data-kind="${kind}"`,
      `data-tag="${tag}"`,
      ...(includeSelector ? [`data-selector="${selector}"`] : []),
      ...(includeXpath ? [`data-xpath="${xpath}"`] : []),
      ...(role ? [`data-role="${role}"`] : []),
      `data-x="${x}" data-y="${y}" data-width="${w}" data-height="${h}"`,
      `data-visible="true"`,
      `data-z="${z}"`,
      ...(href ? [`data-href="${href}"`] : []),
      ...(src ? [`data-src="${src}"`] : []),
      ...(alt ? [`data-alt="${alt}"`] : []),
      ...(value ? [`data-value="${value}"`] : []),
      ...(placeholder ? [`data-placeholder="${placeholder}"`] : []),
      ...(typeAttr ? [`data-type="${typeAttr}"`] : []),
      ...(fullTextAttr ? [`data-text="${fullTextAttr}"`] : []),
      ...(needsOverflowClip ? [`data-overflow="hidden"`] : []),
      ...(svgTransform ? [`data-transform="${escapeXml(svgTransform)}"`] : []),
      ...(st.boxShadow ? [`data-box-shadow="${escapeXml(st.boxShadow)}"`] : []),
       ...(st.backgroundImage ? [`data-bg-image="${escapeXml(st.backgroundImage.slice(0,80))}"`] : []),
       ...(textDecoLine ? [`data-text-decoration="${escapeXml(textDecoLine)}"`] : []),
       ...(textTransformVal ? [`data-text-transform="${escapeXml(textTransformVal)}"`] : []),
       ...(verticalAlign ? [`data-vertical-align="${escapeXml(verticalAlign)}"`] : []),
       ...(objectFit ? [`data-object-fit="${escapeXml(objectFit)}"`] : []),
       ...(outlineOffset ? [`data-outline-offset="${escapeXml(outlineOffset)}"`] : []),
       ...(clipPathVal ? [`data-clip-path="${escapeXml(clipPathVal.slice(0,80))}"`] : []),
    ].join(" ");

    const clipFromProp = clipPathVal && clipPathVal !== 'none';
    const gClip = needsClipForG || clipFromProp ? ` clip-path="url(#clip-${idx})"` : "";
    parts.push(`<g ${gAttrs}${gClip}${shadowFilter}${transformAttr}${transformOriginAttr}>`);

    // background rect — Satori's rect.ts uses fills[] with backgroundColor + backgroundImage layers + border + shadow
    // For hybrid, visual comes from foreignObject, so rects are geometry-only (transparent)
    const hasRadial = Boolean(el._radialId);
    const hasGrad = Boolean(el._gradId);
    const gradFill = hasRadial ? `url(#${el._radialId})` : hasGrad ? `url(#${el._gradId})` : null;
    const baseFill = bg || (tag === "input" || tag === "textarea" || tag === "select" ? "#ffffff" : null);
    const fill = isHybrid ? null : (gradFill || baseFill);
    const fillOpacity = opacity !== 1 ? ` fill-opacity="${opacity}"` : "";
    const hasVisualFill = Boolean(fill);
    // per-side border handling: if only one side has border (e.g., header borderBottom), don't paint all sides
    // For hybrid, visual comes from foreignObject, so no rect stroke needed at all (geometry only)
    const bwTop = parseFloat(String(st.borderTopWidth||""))||0, bwBot = parseFloat(String(st.borderBottomWidth||""))||0, bwLeft = parseFloat(String(st.borderLeftWidth||""))||0, bwRight = parseFloat(String(st.borderRightWidth||""))||0;
    const bcTop = st.borderTopColor, bcBot = st.borderBottomColor, bcLeft = st.borderLeftColor, bcRight = st.borderRightColor;
    const normColor = (c) => String(c||"").trim().toLowerCase().replace(/\s+/g, "");
    const uniformBorder = (() => {
      // all zero widths = uniform (no border)
      if (bwTop===0 && bwBot===0 && bwLeft===0 && bwRight===0) return true;
      const widthsEqual = bwTop===bwBot && bwBot===bwLeft && bwLeft===bwRight;
      const colorsEqual = normColor(bcTop)===normColor(bcBot) && normColor(bcBot)===normColor(bcLeft) && normColor(bcLeft)===normColor(bcRight);
      return widthsEqual && colorsEqual;
    })();
    let hasVisualStroke = false;
    let strokePart = ` stroke="none"`;
    if (isHybrid) {
      hasVisualStroke = false;
      strokePart = ` stroke="none"`;
    } else if (uniformBorder) {
      hasVisualStroke = borderWidth > 0 && Boolean(borderColor);
      strokePart = hasVisualStroke ? ` stroke="${escapeXml(borderColor)}" stroke-width="${borderWidth}"` : ` stroke="none"`;
    } else {
      // non-uniform: main rect without stroke, per-side borders drawn separately below
      hasVisualStroke = false;
      strokePart = ` stroke="none"`;
    }
    const rxAttr = !usePathForRadius && rx > 0 ? ` rx="${rx}" ry="${rx}"` : "";
    const isImg = tag === "img";
    const isCanvas = tag === "canvas";
    const isIframe = tag === "iframe";
    const isMedia = isImg || isCanvas || isIframe;
    if (hasVisualFill || hasVisualStroke) {
      const fillPart = hasVisualFill ? ` fill="${escapeXml(fill)}"` : ` fill="none"`;
      if (usePathForRadius) {
        const d = buildRadiusPath(x,y,w,h,radiiClamped);
        parts.push(`  <path d="${d}"${fillPart}${strokePart}${fillOpacity} />`);
      } else {
        parts.push(`  <rect x="${x}" y="${y}" width="${w}" height="${h}"${rxAttr}${fillPart}${strokePart}${fillOpacity} />`);
      }
    }
    // per-side borders for non-uniform (e.g., header borderBottom only) — draw as thin rects (skip for hybrid, visual from foreignObject)
    if (!isHybrid && !uniformBorder) {
      const addSide = (sideW, sideC, side) => {
        const wv = parseFloat(String(sideW||""))||0;
        if (!(wv>0) || isTransparentColor(sideC)) return;
        const c = String(sideC).trim();
        const sw = Math.min(wv, 6);
        if (side==='top') parts.push(`  <rect x="${x}" y="${y}" width="${w}" height="${sw}" fill="${escapeXml(c)}" stroke="none"${fillOpacity?` fill-opacity="${opacity}"`:''} />`);
        else if (side==='bottom') parts.push(`  <rect x="${x}" y="${y+h-sw}" width="${w}" height="${sw}" fill="${escapeXml(c)}" stroke="none"${fillOpacity?` fill-opacity="${opacity}"`:''} />`);
        else if (side==='left') parts.push(`  <rect x="${x}" y="${y}" width="${sw}" height="${h}" fill="${escapeXml(c)}" stroke="none"${fillOpacity?` fill-opacity="${opacity}"`:''} />`);
        else if (side==='right') parts.push(`  <rect x="${x+w-sw}" y="${y}" width="${sw}" height="${h}" fill="${escapeXml(c)}" stroke="none"${fillOpacity?` fill-opacity="${opacity}"`:''} />`);
      };
      addSide(st.borderTopWidth, st.borderTopColor, 'top');
      addSide(st.borderBottomWidth, st.borderBottomColor, 'bottom');
      addSide(st.borderLeftWidth, st.borderLeftColor, 'left');
      addSide(st.borderRightWidth, st.borderRightColor, 'right');
    }
    if (!isHybrid && isMedia) {
      // Media placeholder box — always visible so no displayed media is missed (alt/src shown); skip for hybrid (visual from foreignObject)
      // Use light gray fill + dashed border to indicate media area even when bg transparent
      const mediaFill = isIframe ? "#dbeafe" : "#e5e7eb";
      const mediaStroke = isIframe ? "#60a5fa" : "#9ca3af";
      parts.push(`  <rect x="${x}" y="${y}" width="${w}" height="${h}"${rxAttr} fill="${mediaFill}" stroke="${mediaStroke}" stroke-width="1" stroke-dasharray="4 2" opacity="0.95" />`);
    }
    // If no visual rect and not media, keep <g> with data-* for agent geometry, but no visible box — perfect render stays clean

    // media content — img/canvas with src as <image>, iframe as placeholder text (skip for hybrid)
    if (!isHybrid && (isImg || isCanvas) && src) {
      const clip = rx > 0 ? ` clip-path="url(#clip-${idx})"` : (needsOverflowClip ? ` clip-path="url(#clip-${idx})"` : "");
      let par = "xMidYMid meet";
      if (objectFit === "cover") par = objectPosition ? `xMidYMid slice` : "xMidYMid slice";
      else if (objectFit === "contain") par = "xMidYMid meet";
      else if (objectFit === "fill") par = "none";
      else if (objectFit === "none") par = "xMidYMid meet";
      else if (objectFit === "scale-down") par = "xMidYMid meet";
      // show image/canvas data; no alt overlay — when the <image> loads, an
      // alt label is just double ink on top of real pixels (§14 fidelity)
      parts.push(`  <image href="${src}" xlink:href="${src}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="${par}"${clip} />`);
      if (outlineOffset && borderWidth===0) {
        const off = parseFloat(outlineOffset)||2;
        parts.push(`  <rect x="${x-off}" y="${y-off}" width="${w+off*2}" height="${h+off*2}" fill="none" stroke="${escapeXml(st.outlineColor||'#111')}" stroke-width="1" rx="${rx}" />`);
      }
    } else if (!isHybrid && isMedia) {
    } else if (!isHybrid && isMedia) {
      // No src or iframe — show alt/src as centered placeholder text so the media box is not empty (skip for hybrid)
      const srcLabel = isIframe ? (src || alt || textRaw || "iframe") : (alt || textRaw || (isCanvas ? "canvas" : "image"));
      const altLabel = escapeXml(String(srcLabel).slice(0, 60));
      if (altLabel) {
        const altTx = x + Math.max(4, Math.round((w - altLabel.length * 5) / 2));
        const altTy = y + Math.round(h / 2 + 2);
        const labelColor = isIframe ? "#1e40af" : "#4b5563";
        parts.push(`  <text x="${altTx}" y="${altTy}" font-family="sans-serif, monospace" font-size="9" fill="${labelColor}" opacity="0.9" text-anchor="middle">${altLabel}</text>`);
      }
    } else if (!isHybrid && !coveredByDescendant && el.kind !== "table" && (textRaw.trim() || value || placeholder) && !(el.kind === "container" && shouldSkipContainerText(el, filtered))) {
      // for input-like elements prioritize value over textRaw placeholder
      let displayText;
      if (tag === "input" || tag === "textarea" || tag === "select") {
        displayText = String(value || textRaw.trim() || placeholder).trim();
      } else {
        displayText = String(textRaw.trim() || value || placeholder).trim();
      }
      // P0: apply textTransform before measure/wrap
      if (textTransformVal === "uppercase") displayText = displayText.toUpperCase();
      else if (textTransformVal === "lowercase") displayText = displayText.toLowerCase();
      else if (textTransformVal === "capitalize") displayText = displayText.replace(/\b\w/g, c=>c.toUpperCase());
      if (displayText) {
        // perfect text layout: wrap to box width, honor white-space / text-overflow /
        // -webkit-line-clamp, real lineHeight + fontWeight + textAlign from computed style
        const lineHeight = Number.isFinite(lineHeightVal) && lineHeightVal > 0 ? lineHeightVal : Math.round(fontSize * 1.25);
        const letterSpacingNum = letterSpacingVal !== "0" ? parseFloat(letterSpacingVal) || 0 : 0;
        // real padding + border from computed style (rect includes both)
        const clampPad = (v) => Math.min(Math.max(v, 2), Math.max(2, w * 0.45));
        const padL = clampPad((Number(st.paddingLeft) || 0) + (Number(st.borderWidth) || 0));
        const padR = clampPad((Number(st.paddingRight) || 0) + (Number(st.borderWidth) || 0));
        const availW = Math.max(10, Math.round(w - padL - padR));
        // Satori-inspired calibration: use browser Canvas measured width (el.measuredWidth) to correct em-bucket estimate (HarfBuzz principle: real metrics > heuristic)
        let _calib = 1;
        if (el.measuredWidth && el.measuredWidth > 10 && displayText.length > 3) {
          const sample = displayText.replace(/\s+/g,' ').trim().slice(0, 60);
          const emEst = measureTextWidth(sample, { fontSize, fontFamily, fontWeight: st.fontWeight, letterSpacing: letterSpacingNum });
          if (emEst > 10) { const c = el.measuredWidth / Math.max(1, measureTextWidth(displayText.replace(/\s+/g,' ').trim().slice(0, 120), { fontSize, fontFamily, fontWeight: st.fontWeight, letterSpacing: letterSpacingNum })); if (Number.isFinite(c) && c>0.6 && c<1.8) _calib = c; }
        }
        const wrapOpts = {
          fontSize,
          fontFamily,
          fontWeight: st.fontWeight,
          letterSpacing: letterSpacingNum,
          _calib,
          wordBreak: st.wordBreak || "",
          overflowWrap: st.overflowWrap || "",
          wordWrap: st.overflowWrap || "",
        };
        const isPre = whiteSpace === "pre" || whiteSpace === "pre-wrap";
        const isNowrap = whiteSpace === "nowrap";
        const lineClampNum = parseInt(String(st.lineClamp ?? ""), 10);
        const ellipsisMode = textOverflow === "ellipsis" || (Number.isFinite(lineClampNum) && lineClampNum > 0);

        // True-baseline text model (SVG default: alphabetic). Extractor supplies
        // real font bounding metrics per element — every y below is a baseline.
        const fbaEl = Number(el.fontAsc) || fontSize * 0.8;
        const fbdEl = Number(el.fontDesc) || fontSize * 0.25;

        // 100% fidelity: if per-word Range rects available, render each word at exact x,y (bypasses wrap estimation)
        // per-glyph Range for letterSpacing / CJK kinsoku uses exact x; Range rect top + ascent = baseline
        if (Array.isArray(el.wordRects) && el.wordRects.length>0 && !isPre && !isNowrap && el.wordRects.length < 300) {
          const isPlaceholder2 = !value && (!textRaw.trim() || displayText === placeholder);
          const textOpacity2 = isPlaceholder2 ? 0.55 : 0.92;
          const textFill2 = isPlaceholder2 ? "#6a737d" : escapeXml(color);
          const weightNum2 = parseInt(String(st.fontWeight), 10);
          const fontStyle2 = String(st.fontStyle || "").toLowerCase();
          const fontAttrs2 = [
            `font-family="${escapeXml(fontFamily)}, monospace"`,
            `font-size="${fontSize}"`,
            ...(Number.isFinite(weightNum2) && weightNum2 !== 400 ? [`font-weight="${weightNum2}"`] : []),
            ...(fontStyle2 === "italic" || fontStyle2 === "oblique" ? [`font-style="italic"`] : []),
            ...(letterSpacingNum !== 0 ? [`letter-spacing="${letterSpacingNum}"`] : []),
          ].join(" ");
          for (const wr of el.wordRects) {
            // wr.y is top of word's Range rect, hanging baseline => y is top, keeps exact y and per-glyph letterSpacing via word width
            parts.push(`  <text x="${wr.x}" y="${Math.round((Number(wr.y) + fbaEl) * 10) / 10}" ${fontAttrs2} fill="${textFill2}" opacity="${textOpacity2}">${escapeXml(wr.word)}</text>`);
          }
          // skip the rest of the text handling for this element — wordRects already rendered
          // still need to handle title below, so jump to after text block
          // we do this by setting lines to empty and handling title separately
          // To avoid duplicating title logic, we set a flag and continue to next element's g closing
          // Instead, we handle title and g closing here and continue to next iteration
          const titleText2 = escapeXml((textRaw || value || alt || href || selector || tag).slice(0, 300));
          if (titleText2) parts.push(`  <title>${titleText2}</title>`);
          parts.push(`</g>`);
          continue;
        }

        // 100% fidelity: nowrap with wordRects — use exact Range rects for each word on one line (per-glyph for letterSpacing)
        if (Array.isArray(el.wordRects) && el.wordRects.length>0 && !isPre && isNowrap && el.wordRects.length < 300) {
          const isPlaceholder2 = !value && (!textRaw.trim() || displayText === placeholder);
          const textOpacity2 = isPlaceholder2 ? 0.55 : 0.92;
          const textFill2 = isPlaceholder2 ? "#6a737d" : escapeXml(color);
          const weightNum2 = parseInt(String(st.fontWeight), 10);
          const fontStyle2 = String(st.fontStyle || "").toLowerCase();
          const fontAttrs2 = [
            `font-family="${escapeXml(fontFamily)}, monospace"`,
            `font-size="${fontSize}"`,
            ...(Number.isFinite(weightNum2) && weightNum2 !== 400 ? [`font-weight="${weightNum2}"`] : []),
            ...(fontStyle2 === "italic" || fontStyle2 === "oblique" ? [`font-style="italic"`] : []),
            ...(letterSpacingNum !== 0 ? [`letter-spacing="${letterSpacingNum}"`] : []),
          ].join(" ");
          for (const wr of el.wordRects) {
            parts.push(`  <text x="${wr.x}" y="${Math.round((Number(wr.y) + fbaEl) * 10) / 10}" ${fontAttrs2} fill="${textFill2}" opacity="${textOpacity2}">${escapeXml(wr.word)}</text>`);
          }
          const titleText2 = escapeXml((textRaw || value || alt || href || selector || tag).slice(0, 300));
          if (titleText2) parts.push(`  <title>${titleText2}</title>`);
          parts.push(`</g>`);
          continue;
        }

        // whiteSpace:pre tabs — use per-glyph Range rects when available (tab width via Range, exact x)
        if (Array.isArray(el.wordRects) && el.wordRects.length>0 && isPre && el.wordRects.length < 300) {
          const isPlaceholder2 = !value && (!textRaw.trim() || displayText === placeholder);
          const textOpacity2 = isPlaceholder2 ? 0.55 : 0.92;
          const textFill2 = isPlaceholder2 ? "#6a737d" : escapeXml(color);
          const weightNum2 = parseInt(String(st.fontWeight), 10);
          const fontStyle2 = String(st.fontStyle || "").toLowerCase();
          const fontAttrs2 = [
            `font-family="${escapeXml(fontFamily)}, monospace"`,
            `font-size="${fontSize}"`,
            ...(Number.isFinite(weightNum2) && weightNum2 !== 400 ? [`font-weight="${weightNum2}"`] : []),
            ...(fontStyle2 === "italic" || fontStyle2 === "oblique" ? [`font-style="italic"`] : []),
            ...(letterSpacingNum !== 0 ? [`letter-spacing="${letterSpacingNum}"`] : []),
          ].join(" ");
          for (const wr of el.wordRects) {
            parts.push(`  <text x="${wr.x}" y="${Math.round((Number(wr.y) + fbaEl) * 10) / 10}" ${fontAttrs2} fill="${textFill2}" opacity="${textOpacity2}">${escapeXml(wr.word)}</text>`);
          }
          const titleText2b = escapeXml((textRaw || value || alt || href || selector || tag).slice(0, 300));
          if (titleText2b) parts.push(`  <title>${titleText2b}</title>`);
          parts.push(`</g>`);
          continue;
        }

        let lines;
        if (isPre) {
          // pre: keep author line breaks and spacing verbatim (tabs preserved via per-glyph wordRects above when available)
          lines = displayText.split("\n").map((l) => l.replace(/[ \t]+$/, "")).slice(0, 24);
        } else if (isNowrap) {
          let single = displayText.replace(/\s+/g, " ").trim();
          if (ellipsisMode && measureTextWidth(single, wrapOpts) > availW) {
            const mc = maxCharsFitting(single, wrapOpts, availW);
            single = appendEllipsis(single.slice(0, mc), mc);
          }
          lines = [single];
        } else {
          // Box height budget: auto-height blocks grow with their lines, so
          // rect.height/lineHeight IS the real rendered line count. Constrained
          // boxes (overflow hidden / line-clamp) use the same budget as a clip.
          const hasHardBreaks = displayText.includes("\n");
          const isClamped = Number.isFinite(lineClampNum) && lineClampNum > 0;
          const budget = Math.max(1, Math.floor((h + lineHeight * 0.35) / lineHeight));
          const cap = isClamped ? Math.min(budget, lineClampNum) : budget;
          // Use per-word canvas widths when available for 100% fidelity, else em-bucket
          const hasWordWidths = Array.isArray(el.wordWidths) && Array.isArray(el.words) && el.wordWidths.length>0;
          const spaceW = Number.isFinite(el.spaceWidth) && el.spaceWidth>0 ? el.spaceWidth : undefined;
          lines = hasWordWidths
            ? wrapWithWordWidths(displayText, el.wordWidths, el.words, { ...wrapOpts, maxWidth: availW, maxLines: 200, ...(spaceW?{spaceWidth:spaceW}:{}) })
            : wrapTextToWidth(displayText, { ...wrapOpts, maxWidth: availW, maxLines: 200 });
          const flatSingle = displayText.replace(/\s+/g, " ").trim();
          if (!hasHardBreaks && !needsOverflowClip && !isClamped && lines.length > 1) {
            // Flex/inline items can't reflow below their min-content width —
            // browsers keep one line and let it overflow instead of wrapping.
            // Accept a small estimate overshoot as "fits on one line".
            const fitsLoose = measureTextWidth(flatSingle, { ...wrapOpts, maxWidth: availW * 1.1 }) <= availW * 1.1;
            if (cap === 1 || fitsLoose) {
              lines = [flatSingle];
            }
          }
          if (lines.length > cap) {
            lines = lines.slice(0, cap);
            if (ellipsisMode) {
              const lastIdx = lines.length - 1;
              const mc = maxCharsFitting(lines[lastIdx], wrapOpts, availW);
              lines[lastIdx] = appendEllipsis(lines[lastIdx], mc);
            }
          }
        }

        const isPlaceholder = !value && (!textRaw.trim() || displayText === placeholder);
        const textOpacity = isPlaceholder ? 0.55 : 0.92;
        const textFill = isPlaceholder ? "#6a737d" : escapeXml(color);
        // horizontal alignment from computed text-align — use textRect when available for 100% fidelity
        const align = String(st.textAlign || "").toLowerCase();
        let anchor = "start";
        let tx, ty;
        if (el.textRect && Number.isFinite(el.textRect.x) && Number.isFinite(el.textRect.y)) {
          // textRect is Range rect (actual glyph box top) — convert to first-line
          // baseline with the half-leading model, keep float for subpixel fidelity
          tx = el.textRect.x;
          ty = el.textRect.y + Math.max(0, ((el.textRect.height || lineHeight) - (fbaEl + fbdEl)) / 2) + fbaEl;
          if (align === "center") { anchor = "middle"; tx = x + w / 2; }
          else if (align === "right" || align === "end") { anchor = "end"; tx = x + w - padR; }
          if (lines.length === 1 && h > lineHeight * 1.6) {
            const centeredY = y + h / 2 + (fbaEl - fbdEl) / 2;
            if (Math.abs(ty - centeredY) < 4) ty = centeredY;
          }
        } else {
          tx = x + padL;
          if (align === "center") { anchor = "middle"; tx = x + w / 2; }
          else if (align === "right" || align === "end") { anchor = "end"; tx = x + w - padR; }
          ty = y + Math.max(2, (lineHeight - (fbaEl + fbdEl)) / 2) + fbaEl;
          if (lines.length === 1 && h > lineHeight * 1.6) {
            ty = y + (h - (fbaEl + fbdEl)) / 2 + fbaEl;
          }
        }
        const weightNum = parseInt(String(st.fontWeight), 10);
        const fontStyle = String(st.fontStyle || "").toLowerCase();
        const tdLine = textDecoLine.includes("underline") ? "underline" : textDecoLine.includes("line-through") ? "line-through" : "";
        const tdExtra = [
          ...(tdLine ? [`text-decoration="${tdLine}"`] : []),
          ...(textDecoColor && tdLine ? [`text-decoration-color="${escapeXml(textDecoColor)}"`] : []),
          ...(textDecoStyle && tdLine && textDecoStyle !== "solid" ? [`text-decoration-style="${escapeXml(textDecoStyle)}"`] : []),
          ...(verticalAlign && verticalAlign !== "baseline" ? [`dominant-baseline="${verticalAlign==='middle'?'middle':verticalAlign==='super'?'super':verticalAlign==='sub'?'sub':'hanging'}"`] : []),
        ].join(" ");
        const fontAttrs = [
          `font-family="${escapeXml(fontFamily)}, monospace"`,
          `font-size="${fontSize}"`,
          ...(Number.isFinite(weightNum) && weightNum !== 400 ? [`font-weight="${weightNum}"`] : []),
          ...(fontStyle === "italic" || fontStyle === "oblique" ? [`font-style="italic"`] : []),
          ...(letterSpacingNum !== 0 ? [`letter-spacing="${letterSpacingNum}"`] : []),
          ...(tdExtra ? [tdExtra] : []),
        ].join(" ");
        // render
        if (lines.length <= 1) {
          parts.push(
            `  <text x="${tx}" y="${ty}" ${fontAttrs} fill="${textFill}" opacity="${textOpacity}"${anchor !== "start" ? ` text-anchor="${anchor}"` : ""}>${escapeXml(lines[0] || "")}</text>`
          );
        } else {
          parts.push(
            `  <text x="${tx}" y="${ty}" ${fontAttrs} fill="${textFill}" opacity="${textOpacity}"${anchor !== "start" ? ` text-anchor="${anchor}"` : ""}>`
          );
          for (let i = 0; i < lines.length; i++) {
            const dy = i === 0 ? 0 : (typeof lineHeightExact !== 'undefined' ? lineHeightExact : lineHeight);
            parts.push(`    <tspan x="${tx}" dy="${dy}">${escapeXml(lines[i])}</tspan>`);
          }
          parts.push(`  </text>`);
        }
      }
    }

    // title for hover / a11y — full text
    const titleText = escapeXml((textRaw || value || alt || href || selector || tag).slice(0, 300));
    if (titleText) {
      parts.push(`  <title>${titleText}</title>`);
    }

    parts.push(`</g>`);
  }

  parts.push(`</svg>`);
  const svg = parts.join("\n");
  const bytes = Buffer.byteLength(svg, "utf8");

  return {
    svg,
    stats: {
      width: W,
      height: H,
      elementCount: filtered.length,
      totalInput: safeElements.length,
      bytes,
      mode: "render",
    },
  };
}

export { buildSvg, formatLegend };
