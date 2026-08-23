// src/svg/style.js — gradients + shadows parsing (Satori-inspired)
// Owner: Agent C — Visual fidelity
export function parseSimpleLinearGradient(str) {
  const s = String(str||'').trim();
  const m = s.match(/linear-gradient\s*\(\s*([^,]+)\s*,\s*(.+)\)/i);
  if (!m) return null;
  const dir = m[1].trim();
  const stopsRaw = m[2];
  // parentheses-aware split: "rgba(255, 0, 0) 0%, #fff 100%" → ["rgba(255, 0, 0) 0%", "#fff 100%"]
  const rawStops = [];
  let cur = '', depth = 0;
  for (let i=0;i<stopsRaw.length;i++) {
    const ch = stopsRaw[i];
    if (ch==='(') depth++;
    else if (ch===')') depth=Math.max(0,depth-1);
    if (ch===',' && depth===0) { rawStops.push(cur.trim()); cur=''; }
    else cur+=ch;
  }
  if (cur.trim()) rawStops.push(cur.trim());
  const stops = [];
  for (const rs of rawStops) {
    // rs like "rgb(255,255,255) 0%" or "rgba(0,0,0,0.5) 50%" or "#fff" or "red 20%"
    const colM = rs.match(/^\s*(rgba?\([^)]+\)|hsla?\([^)]+\)|#[0-9a-fA-F]{3,8}|[a-zA-Z]+)/i);
    if (!colM) continue;
    const color = colM[1].trim();
    const rest = rs.slice(colM[0].length).trim();
    const offM = rest.match(/^([\d.]+%)/);
    const offset = offM ? offM[1] : null;
    stops.push({ color, offset });
  }
  if (stops.length < 2) return null;
  const colors = stops.map(s=>s.color);
  // keep explicit offsets for <linearGradient> if present — interpolate missing ones
  const hasExplicit = stops.some(s=>s.offset);
  if (hasExplicit) {
    const n = stops.length;
    if (!stops[0].offset) stops[0].offset = '0%';
    if (!stops[n-1].offset) stops[n-1].offset = '100%';
    let i = 0;
    while (i < n) {
      if (stops[i].offset) { i++; continue; }
      let j = i + 1;
      while (j < n && !stops[j].offset) j++;
      const start = parseFloat(stops[i-1].offset);
      const end = parseFloat(stops[j].offset);
      const gap = j - (i - 1);
      for (let k = 1; k < gap; k++) {
        const pct = start + (end - start) * (k / gap);
        stops[i - 1 + k].offset = `${Math.round(pct * 10) / 10}%`;
      }
      i = j + 1;
    }
  }
  // direction → x1/y1/x2/y2 (Satori's background-image.js handles more, we cover to right / to bottom / deg)
  // diagonal keywords must be checked before single-axis (to bottom would swallow to bottom right)
  let x1='0%',y1='0%',x2='100%',y2='0%';
  const dl = dir.toLowerCase();
  if (/to\s+bottom\s+right/.test(dl)) { x1='0%'; y1='0%'; x2='100%'; y2='100%'; }
  else if (/to\s+bottom\s+left/.test(dl)) { x1='100%'; y1='0%'; x2='0%'; y2='100%'; }
  else if (/to\s+top\s+right/.test(dl)) { x1='0%'; y1='100%'; x2='100%'; y2='0%'; }
  else if (/to\s+top\s+left/.test(dl)) { x1='100%'; y1='100%'; x2='0%'; y2='0%'; }
  else if (/to\s+bottom/.test(dl)) { x1='0%'; y1='0%'; x2='0%'; y2='100%'; }
  else if (/to\s+top/.test(dl)) { x1='0%'; y1='100%'; x2='0%'; y2='0%'; }
  else if (/to\s+left/.test(dl)) { x1='100%'; y1='0%'; x2='0%'; y2='0%'; }
  else if (/to\s+right/.test(dl)) { x1='0%'; y1='0%'; x2='100%'; y2='0%'; }
  else if (/deg/i.test(dir)) {
    const d = ((parseFloat(dir)%360)+360)%360;
    // continuous trig: 0deg = to top, 90deg = to right — use sin/cos + box-intersection so every angle interpolates
    const rad = d * Math.PI / 180;
    const dx = Math.sin(rad);      // 0deg→0, 90deg→1
    const dy = -Math.cos(rad);     // 0deg→-1 (up), 180deg→1 (down)
    const adx = Math.abs(dx), ady = Math.abs(dy);
    const scale = 0.5 / Math.max(adx, ady, 1e-6);
    const fmt = (v) => {
      const r = Math.round(v * 10) / 10;
      // avoid -0%
      const n = Object.is(r, -0) ? 0 : r;
      return Number.isInteger(n) ? `${n}%` : `${n}%`;
    };
    const cx = 50, cy = 50;
    x1 = fmt(cx - dx * scale * 100);
    y1 = fmt(cy - dy * scale * 100);
    x2 = fmt(cx + dx * scale * 100);
    y2 = fmt(cy + dy * scale * 100);
  }
  return { dir, colors, stops, x1,y1,x2,y2 };
}
export function parseSimpleRadialGradient(str) {
  const s = String(str||'').trim();
  const m = s.match(/radial-gradient\s*\(\s*(.+)\)/i);
  if (!m) return null;
  const inner = m[1];
  // split stops parentheses-aware, first part may be shape/position like "circle at center" — ignore, take colors after
  const rawStops = [];
  let cur='', depth=0;
  for(let i=0;i<inner.length;i++){ const ch=inner[i]; if(ch==='(') depth++; else if(ch===')') depth=Math.max(0,depth-1); if(ch===',' && depth===0){ rawStops.push(cur.trim()); cur=''; } else cur+=ch; }
  if(cur.trim()) rawStops.push(cur.trim());
  // filter to only stops that look like colors (skip shape/pos like "circle at 50% 50%")
  const stops=[];
  for(const rs of rawStops){
    const colM = rs.match(/^\s*(rgba?\([^)]+\)|hsla?\([^)]+\)|#[0-9a-fA-F]{3,8}|[a-zA-Z]+)/i);
    if(!colM) continue;
    // if rs is like "circle at center" it won't match color at start, skip
    if(/^(circle|ellipse|at|closest|farthest)/i.test(rs.trim())) continue;
    const color = colM[1].trim();
    const rest = rs.slice(colM[0].length).trim();
    const offM = rest.match(/^([\d.]+%)/);
    stops.push({color, offset: offM?offM[1]:null});
  }
  if(stops.length<2) return null;
  return { stops, colors: stops.map(s=>s.color) };
}
export function parseSingleBoxShadowToken(token) {
  let t = String(token||'').trim();
  if (!t) return null;
  let isInset = false;
  if (/^\s*inset\b/i.test(t)) { isInset = true; t = t.replace(/^\s*inset\b/i, '').trim(); }
  if (/\binset\b/i.test(t)) { isInset = true; t = t.replace(/\binset\b/i, '').trim(); }
  const m = t.match(/(-?\d+(?:\.\d+)?)(?:px)?\s+(-?\d+(?:\.\d+)?)(?:px)?\s+(-?\d+(?:\.\d+)?)(?:px)?(?:\s+(-?\d+(?:\.\d+)?)(?:px)?)?\s*(rgba?\([^)]+\)|#[0-9a-fA-F]{3,8}|\w+.*)/);
  if (!m) return null;
  return { dx: parseFloat(m[1]), dy: parseFloat(m[2]), blur: parseFloat(m[3]), spread: m[4]?parseFloat(m[4]):0, color: (m[5]||'').trim(), inset: isInset };
}
export function parseBoxShadows(str) {
  const s = String(str||'').trim();
  if (!s || s==='none') return [];
  // parentheses-aware comma split (rgba() contains comma)
  const tokens = [];
  let cur='', depth=0;
  for(let i=0;i<s.length;i++){ const ch=s[i]; if(ch==='(') depth++; else if(ch===')') depth=Math.max(0,depth-1); if(ch===',' && depth===0){ tokens.push(cur.trim()); cur=''; } else cur+=ch; }
  if(cur.trim()) tokens.push(cur.trim());
  const out=[];
  for(const tok of tokens){ const p=parseSingleBoxShadowToken(tok); if(p) out.push(p); }
  return out;
}
export function parseSimpleBoxShadow(str) {
  const arr = parseBoxShadows(str);
  return arr.length ? arr[0] : null;
}

