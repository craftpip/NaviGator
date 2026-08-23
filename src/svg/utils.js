// src/svg/utils.js — XML, color, geometry, glyph buckets
// Owner: shared — Renderer (D) + others
function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
}

function clampRadius(raw, w, h) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const max = Math.min(w, h) / 2;
  return Math.max(0, Math.min(n, max));
}

function parseRadius(value) {
  if (value == null) return 0;
  const s = String(value).trim();
  if (!s || s === "0" || s === "0px") return 0;
  // borderRadius may be "12px" or "0 0 8px 8px" / "12px 12px" — take max radius (rounded bottoms at max)
  const parts = s.split(/\s+/).map((p) => parseFloat(p)).filter((n) => Number.isFinite(n) && n > 0);
  if (!parts.length) return 0;
  return Math.max(...parts);
}

// Satori-inspired per-corner radius (Satori's radius.js handles 4 values + elliptical). We keep path fallback when corners differ.
function parseRadii(value) {
  if (value == null) return [0,0,0,0];
  const s = String(value).trim();
  if (!s || s === "0" || s === "0px") return [0,0,0,0];
  const raw = s.split(/\s+/).map((p) => parseFloat(p)).filter((n) => Number.isFinite(n));
  if (!raw.length) return [0,0,0,0];
  // CSS shorthand: 1→4 same, 2→[a,b,a,b], 3→[a,b,c,b], 4→[a,b,c,d]
  if (raw.length === 1) return [raw[0], raw[0], raw[0], raw[0]];
  if (raw.length === 2) return [raw[0], raw[1], raw[0], raw[1]];
  if (raw.length === 3) return [raw[0], raw[1], raw[2], raw[1]];
  return [raw[0], raw[1], raw[2], raw[3]];
}
function radiiEqual(r) { return r[0]===r[1] && r[1]===r[2] && r[2]===r[3]; }
function buildRadiusPath(x,y,w,h,radii) {
  const [tl,tr,br,bl] = radii.map((v,i)=> clampRadius(v, w, h));
  // SVG path with per-corner arcs (Satori's getBorderRadiusClipPath equivalent, simplified)
  return `M ${x+tl} ${y} H ${x+w-tr} A ${tr} ${tr} 0 0 1 ${x+w} ${y+tr} V ${y+h-br} A ${br} ${br} 0 0 1 ${x+w-br} ${y+h} H ${x+bl} A ${bl} ${bl} 0 0 1 ${x} ${y+h-bl} V ${y+tl} A ${tl} ${tl} 0 0 1 ${x+tl} ${y} Z`;
}
// Render engine: Satori-inspired gradient handling — full multi-stop parser with parentheses-aware split (dom-to-svg/modern-screenshot inliner)
function isTransparentColor(c) {
  if (!c) return true;
  const s = String(c).trim().toLowerCase();
  if (!s || s === "transparent" || s === "rgba(0, 0, 0, 0)" || s === "rgba(0,0,0,0)") return true;
  // also "rgba(x, y, z, 0)" with spaces
  const m = s.match(/rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/);
  if (m && Number(m[1]) === 0) return true;
  return false;
}

function rectContains(parent, child) {
  return child.x >= parent.x && child.y >= parent.y && child.x + child.width <= parent.x + parent.width && child.y + child.height <= parent.y + parent.height;
}

function shouldSkipContainerText(el, all) {
  // Table cells own exact per-word rects — always render their own text.
  if (el.tagName === 'td' || el.tagName === 'th') return false;
  // Table wrappers aggregate every cell's text — emitting them duplicates all
  // cell glyphs (and they carry opaque striped backgrounds). Never emit.
  if (el.tagName === 'table' || el.tagName === 'thead' || el.tagName === 'tbody' || el.tagName === 'tfoot' || el.tagName === 'tr') return true;
  if (el.kind !== "container") return false;
  const txt = String(el.text ?? "").trim();
  if (!txt || txt.length < 30) return false;
  for (const other of all) {
    if (other === el) continue;
    if (other.kind === "container") continue;
    const ot = String(other.text ?? "").trim();
    // 3+ chars: card titles ("Nexus 6") are real leaves and must suppress the
    // container's aggregated copy of the same text
    if (!ot || ot.length < 3) continue;
    if (!other.rect || !el.rect) continue;
    if (!rectContains(el.rect, other.rect)) continue;
    // if container text contains leaf's first 20 chars, it's duplicate
    if (txt.includes(ot.slice(0, 20))) return true;
    if (ot.includes(txt.slice(0, 20))) return true;
  }
  // also skip very large aggregated containers (main) that span >60% of page height
  if (txt.length > 200 && el.rect.height > 800 && el.rect.width > 1000) return true;
  return false;
}

// Per-glyph em-width buckets — SVG text is laid out by the viewer, but wrap /
// ellipsis decisions must be computed at build time. Monospace fonts are exactly
// 0.6em/char; proportional glyphs use narrow / normal / wide buckets.
const NARROW_GLYPHS = new Set([" ", "i", "j", "l", "t", "f", "r", "I", ".", ",", ":", ";", "!", "|", "'", '"', "`", "(", ")", "[", "]", "{", "}", "-", "/"]);
const WIDE_GLYPHS = new Set(["m", "w", "M", "W", "@", "%"]);


export { escapeXml, clampRadius, parseRadius, parseRadii, radiiEqual, buildRadiusPath, isTransparentColor, rectContains, shouldSkipContainerText, NARROW_GLYPHS, WIDE_GLYPHS };
