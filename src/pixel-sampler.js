// Browser-side pixel sampling for the chafa-style ASCII render.
// Runs inside page.evaluate(). Decodes a base64 PNG screenshot, downscales it
// to a cols × (rows*2) grid (each terminal cell holds 2 vertical pixel rows),
// and returns a packed RGB array for the transformer.

export const SAMPLE_PIXELS_CODE = `
async (base64, cols, rows) => {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const img = await createImageBitmap(new Blob([bytes], { type: "image/png" }));

  const canvas = new OffscreenCanvas(cols, rows * 2);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, cols, rows * 2);

  const data = ctx.getImageData(0, 0, cols, rows * 2).data;
  const out = new Uint8Array(cols * rows * 2 * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    out[j] = data[i];
    out[j + 1] = data[i + 1];
    out[j + 2] = data[i + 2];
  }
  return out;
}
`;

export function asciiGridDims(viewportWidth, viewportHeight, width, maxRows = 200) {
  const cols = Math.max(40, Math.min(200, Math.round(width) || 100));
  const rows = Math.min(
    maxRows,
    Math.max(20, Math.round(cols * (viewportHeight / viewportWidth) / 2))
  );
  return { cols, rows };
}
