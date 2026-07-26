function generateWireframe(viewportWidth, viewportHeight, elements, cols) {
  const aspect = viewportHeight / viewportWidth;
  const rows = Math.min(Math.max(20, Math.round(cols * aspect)), 200);
  const scaleX = cols / viewportWidth;
  const scaleY = rows / viewportHeight;

  const grid = Array.from({ length: rows }, () => Array(cols).fill(" "));
  const owner = Array.from({ length: rows }, () => Array(cols).fill(-1));

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function setCell(r, c, ch, boxIdx) {
    if (r < 0 || r >= rows || c < 0 || c >= cols) return;
    if (owner[r][c] !== -1) return;
    grid[r][c] = ch;
    owner[r][c] = boxIdx;
  }

  function drawBox(x1, y1, x2, y2, boxIdx) {
    const c1 = clamp(x1, 0, cols - 1);
    const c2 = clamp(x2, 0, cols - 1);
    const r1 = clamp(y1, 0, rows - 1);
    const r2 = clamp(y2, 0, rows - 1);
    if (c1 > c2 || r1 > r2) return;

    for (let c = c1; c <= c2; c++) {
      const isLeft = c === c1;
      const isRight = c === c2;
      if (r1 === r2 && isLeft && isRight) setCell(r1, c, "─", boxIdx);
      else if (r1 === r2) setCell(r1, c, "─", boxIdx);
      else if (isLeft) setCell(r1, c, "┌", boxIdx);
      else if (isRight) setCell(r1, c, "┐", boxIdx);
      else setCell(r1, c, "─", boxIdx);

      if (r1 !== r2) {
        if (isLeft) setCell(r2, c, "└", boxIdx);
        else if (isRight) setCell(r2, c, "┘", boxIdx);
        else setCell(r2, c, "─", boxIdx);
      }
    }

    for (let r = r1 + 1; r < r2; r++) {
      setCell(r, c1, "│", boxIdx);
      if (c1 !== c2) setCell(r, c2, "│", boxIdx);
    }
  }

  function placeText(col, row, text) {
    if (!text || row < 0 || row >= rows) return;
    let c = clamp(col, 0, cols - 1);
    for (let i = 0; i < text.length && c < cols; i++) {
      if (owner[row][c] === -1) {
        grid[row][c] = text[i];
      }
      c++;
    }
  }

  const sorted = [...elements].sort(
    (a, b) => (a.priority || 99) - (b.priority || 99)
  );

  const placed = [];

  for (let idx = 0; idx < sorted.length; idx++) {
    const el = sorted[idx];
    if (!el.rect) continue;

    const bx1 = Math.round(el.rect.x * scaleX);
    const by1 = Math.round(el.rect.y * scaleY);
    const bx2 = Math.round((el.rect.x + el.rect.width) * scaleX);
    const by2 = Math.round((el.rect.y + el.rect.height) * scaleY);

    if (bx2 - bx1 < 2 || by2 - by1 < 1) continue;

    drawBox(bx1, by1, bx2, by2, idx);

    const marker = `[${el.index}]`;
    const interiorWidth = bx2 - bx1 - 2;
    const interiorTop = by1 + 1;
    const interiorHeight = by2 - by1 - 2;

    if (interiorWidth >= 1 && interiorHeight >= 1) {
      placeText(bx1 + 1, interiorTop, marker);
      placed.push({ index: el.index, row: interiorTop, col: bx1 + 1 });
    } else if (bx2 - bx1 >= marker.length + 2) {
      placeText(bx1 + 1, by1, marker);
      placed.push({ index: el.index, row: by1, col: bx1 + 1 });
    }

    if (interiorHeight >= 2 && interiorWidth > marker.length + 2) {
      const tagLabel = `<${el.tagName || "?"}>`;
      const available = interiorWidth - marker.length - 2;
      const textSlice = (el.text || "").replace(/\s+/g, " ").trim();
      const content = textSlice
        ? `${tagLabel} ${textSlice}`.slice(0, available)
        : tagLabel.slice(0, available);
      placeText(bx1 + 1, interiorTop + 1, content);
    }
  }

  return {
    wireframe: grid.map((row) => row.join("")).join("\n"),
    placed,
    cols,
    rows,
    viewportWidth,
    viewportHeight,
  };
}

function formatLegend(elements) {
  const header = "| # | Kind | Tag | Selector | Text |";
  const sep = "|---|------|-----|----------|------|";
  const rows = [header, sep];

  for (const el of elements) {
    const text = (el.text || "")
      .replace(/\|/g, "\\|")
      .replace(/\n/g, " ")
      .trim()
      .slice(0, 80);
    const selector = (el.selector || "").replace(/\|/g, "\\|").slice(0, 60);
    rows.push(
      `| ${el.index} | ${el.kind || "—"} | \`${el.tagName || "?"}\` | ${selector} | ${text || "—"} |`
    );
  }

  return rows.join("\n");
}

function transform(viewportWidth, viewportHeight, elements, cols) {
  const { wireframe, placed, rows } = generateWireframe(
    viewportWidth,
    viewportHeight,
    elements,
    cols
  );

  return {
    wireframe,
    elements,
    stats: {
      asciiCols: cols,
      asciiRows: rows,
      viewportWidth,
      viewportHeight,
      elementCount: elements.length,
      placedCount: placed.length,
    },
  };
}

export { generateWireframe, formatLegend, transform };
