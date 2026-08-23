// Pure diff for SVG vs screenshot pixel grids — no browser deps.
// Samples are Uint8Array from SAMPLE_PIXELS_CODE: cols * rows*2 *3 bytes RGB (top+bottom per cell).
function toUint8Array(v) {
  if (!v) return null;
  if (v instanceof Uint8Array) return v;
  if (Array.isArray(v)) return new Uint8Array(v);
  if (typeof v === 'object') {
    // puppeteer serializes Uint8Array as {0:...,1:..., ...} without .length — reconstruct
    const keys = Object.keys(v);
    // check if numeric keys
    if (keys.length && keys[0] === '0') {
      const arr = new Uint8Array(keys.length);
      for (let i = 0; i < keys.length; i++) arr[i] = v[i];
      return arr;
    }
    // fallback: values
    const vals = Object.values(v);
    if (vals.length) return new Uint8Array(vals);
  }
  try { return new Uint8Array(v); } catch { return null; }
}
export function diffPixels(samplesA, samplesB, cols, rows) {
  const a = toUint8Array(samplesA);
  const b = toUint8Array(samplesB);
  const expected = cols * rows * 2 * 3;
  if (!a || !b || a.length !== expected || b.length !== expected) {
    throw new Error(`diffPixels: expected ${expected} bytes, got ${a?.length} vs ${b?.length}`);
  }
  // use a,b from here
  samplesA = a; samplesB = b;
  let diff10 = 0, diff30 = 0, diff80 = 0;
  let sumDelta = 0;
  let maxDelta = 0;
  let worst = null;
  const total = cols * rows;
  // per-cell heatmap for debugging: 2D array of delta
  const heatRows = [];
  for (let r = 0; r < rows; r++) {
    let rowStr = "";
    for (let c = 0; c < cols; c++) {
      const topI = ((r * 2) * cols + c) * 3;
      const botI = ((r * 2 + 1) * cols + c) * 3;
      const drT = samplesA[topI] - samplesB[topI];
      const dgT = samplesA[topI + 1] - samplesB[topI + 1];
      const dbT = samplesA[topI + 2] - samplesB[topI + 2];
      const drB = samplesA[botI] - samplesB[botI];
      const dgB = samplesA[botI + 1] - samplesB[botI + 1];
      const dbB = samplesA[botI + 2] - samplesB[botI + 2];
      const dT = Math.sqrt(drT * drT + dgT * dgT + dbT * dbT);
      const dB = Math.sqrt(drB * drB + dgB * dgB + dbB * dbB);
      const d = Math.max(dT, dB);
      sumDelta += d;
      if (d > maxDelta) { maxDelta = d; worst = { r, c, d, top: [samplesA[topI], samplesA[topI+1], samplesA[topI+2]], topB: [samplesB[topI], samplesB[topI+1], samplesB[topI+2]] }; }
      if (d > 10) diff10++;
      if (d > 30) diff30++;
      if (d > 80) diff80++;
      // heatmap char
      if (d > 80) rowStr += "#";
      else if (d > 30) rowStr += ".";
      else if (d > 10) rowStr += "·";
      else rowStr += " ";
    }
    heatRows.push(rowStr);
  }
  return {
    total,
    diff10, diff30, diff80,
    pct10: total ? diff10 / total : 0,
    pct30: total ? diff30 / total : 0,
    pct80: total ? diff80 / total : 0,
    avgDelta: total ? sumDelta / total : 0,
    maxDelta,
    worst,
    heatmap: heatRows.join("\n"),
  };
}

export function formatDiffMarkdown(diff, meta = {}) {
  const lines = [];
  lines.push(`### SVG vs Screenshot diff — ${meta.url || ""}`);
  lines.push(`- Grid: ${meta.cols}×${meta.rows} · ${diff.total} cells`);
  lines.push(`- >10: ${diff.diff10}/${diff.total} ${(diff.pct10 * 100).toFixed(1)}%`);
  lines.push(`- >30: ${diff.diff30}/${diff.total} ${(diff.pct30 * 100).toFixed(1)}%  ${diff.pct30 < 0.02 ? "✅ <2%" : "❌ >2%"}`);
  lines.push(`- >80: ${diff.diff80}/${diff.total} ${(diff.pct80 * 100).toFixed(1)}%`);
  lines.push(`- avg Δ: ${diff.avgDelta.toFixed(2)} · max Δ: ${diff.maxDelta.toFixed(1)} at ${diff.worst ? `r${diff.worst.r}c${diff.worst.c}` : "?"}`);
  if (meta.svgBytes) lines.push(`- SVG bytes: ${meta.svgBytes} · hybrid: ${meta.hybrid ? "true" : "false"} · W×H: ${meta.W}×${meta.H}`);
  lines.push("");
  lines.push("```");
  lines.push(diff.heatmap.slice(0, 2000));
  lines.push("```");
  lines.push("");
  lines.push(`Legend: " " <10 · "·" >10 · "." >30 · "#" >80`);
  return lines.join("\n");
}
