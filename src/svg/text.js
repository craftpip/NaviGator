// src/svg/text.js — text measurement, wrapping, ellipsis, kinsoku
// Owner: Agent B — Text fidelity
import { NARROW_GLYPHS, WIDE_GLYPHS } from './utils.js';

// Object-oriented core — encapsulates per-call options and calibration,
// keeps functional exports for tests (wrapWithWordWidths / wrapTextToWidth etc).
const KINSOKU_NOT_START = new Set(["、","。","，","．",",",".","）",")","]","｝","}", "」","』","】","》","〉","»","・","：",":","；",";","！","!","？","?","ー","‐"]);
const KINSOKU_NOT_END = new Set(["（","(","［","[","｛","{","「","『","【","《","〈","«"]);

function hasCJK(str) {
  // includes Hiragana/Katakana/Hangul/CJK Unified + punctuation block
  return /[\u3000-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/.test(str);
}

class TextMeasurer {
  constructor(opts = {}) {
    this.opts = opts;
    this.size = Math.max(6, Number(opts.fontSize) || 12);
    this.fam = String(opts.fontFamily || "").toLowerCase();
    this.ls = Number(opts.letterSpacing) || 0;
    this.isMono = /mono|consolas|courier|menlo/.test(this.fam);
    const weightNum = parseInt(String(opts.fontWeight), 10);
    this.isBold = Number.isFinite(weightNum) ? weightNum >= 600 : /bold/i.test(String(opts.fontWeight));
    this.isSerif = /times|georgia|garamond|serif|playfair|merriweather|lora/.test(this.fam) && !/sans/.test(this.fam);
    const c = Number(opts._calib);
    // builder clamps 0.6–1.8; keep measurer aligned (was 0.5–2.5, too loose → over-corrects spaceW drift)
    this.calib = Number.isFinite(c) && c > 0.6 && c < 1.8 ? c : 1;
  }
  // expand tabs to 4 spaces before bucket (builder handles pre via wordRects; fallback still needs deterministic tab width)
  normalize(str) {
    const raw = String(str ?? "");
    // tab = 4 spaces (CSS tab-size default 8, but 4 is conservative and matches console pre; 8 would over-estimate nowrap ellipsis)
    return raw.replace(/\t/g, "    ");
  }
  measure(str) {
    const s = this.normalize(str);
    const lsAdd = this.ls * Math.max(0, s.length - 1);
    let base;
    if (this.isMono) {
      base = s.length * this.size * 0.6 + lsAdd;
    } else {
      let em = 0;
      for (const ch of s) {
        // space: narrow bucket 0.27 underestimates sans (≈0.25em real) but keep bucket for fallback; calib corrects when available
        if (NARROW_GLYPHS.has(ch)) em += 0.27;
        else if (WIDE_GLYPHS.has(ch)) em += 0.8;
        else {
          const cp = ch.codePointAt(0);
          if (cp >= 48 && cp <= 57) em += 0.52;
          else if (cp >= 65 && cp <= 90) em += 0.64;
          else if (cp >= 97 && cp <= 122) em += 0.47;
          else em += 0.55;
        }
      }
      if (this.isSerif) em *= 0.96;
      base = em * this.size * (this.isBold ? 1.05 : 1) + lsAdd;
    }
    return this.calib !== 1 ? base * this.calib : base;
  }
  fits(str, maxWidth) {
    return this.measure(str) <= maxWidth;
  }
}

function measureTextWidth(str, opts = {}) {
  return new TextMeasurer(opts).measure(str);
}

// Longest prefix of str whose measured width fits maxWidth.
function maxCharsFitting(str, opts, maxWidth) {
  const s = String(str ?? "");
  if (measureTextWidth(s, opts) <= maxWidth) return s.length;
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (measureTextWidth(s.slice(0, mid), opts) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function appendEllipsis(text, maxChars) {
  const s = String(text ?? "");
  if (maxChars < 2) return "…";
  if (s.length + 1 <= maxChars) return s + "…";
  return s.slice(0, maxChars - 1) + "…";
}

// Width-aware word wrap. Newlines in the source are hard breaks (innerText
// emits one \n per block-level line). Words wider than a whole line are
// hard-broken by measured width via per-glyph measureTextWidth (letterSpacing
// is added per glyph, so Range-equivalent). CJK kinsoku: avoid starting line
// with trailing punctuation and ending with opening brackets.
// P0: wordBreak:break-all / overflowWrap:break-word → per-char fill (builder passes opts.wordBreak/overflowWrap)
function wrapTextToWidth(text, opts) {
  const raw = String(text ?? "");
  if (!raw.trim()) return [];
  const isBreakAll = String(opts.wordBreak||"").toLowerCase()==="break-all" || String(opts.overflowWrap||"").toLowerCase()==="break-word" || String(opts.wordWrap||"").toLowerCase()==="break-word";
  if (isBreakAll) {
    const measurer = new TextMeasurer(opts);
    const outBA = [];
    for (const paraRaw of raw.split("\n")) {
      const para = paraRaw.replace(/\s+/g, " ").trim();
      if (!para) continue;
      let cur = "";
      for (const ch of para) {
        if (ch===" ") {
          if (measurer.fits(cur + " ", opts.maxWidth)) cur += " ";
          else { if(cur) outBA.push(cur.trimEnd()); cur=""; }
          continue;
        }
        if (!measurer.fits(cur + ch, opts.maxWidth)) {
          if(cur) outBA.push(cur);
          cur = ch;
          if (outBA.length >= (opts.maxLines||Infinity)) break;
        } else cur += ch;
      }
      if (cur) outBA.push(cur);
      if (outBA.length >= (opts.maxLines||Infinity)) break;
    }
    return outBA.slice(0, opts.maxLines||Infinity);
  }
  const maxLines = Number.isFinite(opts.maxLines) ? opts.maxLines : Infinity;
  const measurer = new TextMeasurer(opts);
  const fits = (s) => measurer.fits(s, opts.maxWidth);
  const breakWord = (word) => {
    const isCJK = hasCJK(word);
    const chunks = [];
    let cur = "";
    for (const ch of word) {
      const trial = cur + ch;
      if (cur && !fits(trial)) {
        // kinsoku only for CJK context — prevents ASCII "," drift on Latin pages (benchmark 1994 has no CJK)
        if (isCJK && KINSOKU_NOT_START.has(ch) && cur.length > 1) {
          const last = cur.slice(-1);
          if (KINSOKU_NOT_END.has(last)) {
            // both ends forbidden — hard break is unavoidable
            chunks.push(cur);
            cur = ch;
          } else if (!fits(cur + ch) && fits(cur.slice(0, -1)) && fits(last + ch)) {
            // move last char to next line with ch to avoid line starting with forbidden char
            chunks.push(cur.slice(0, -1));
            cur = last + ch;
          } else {
            chunks.push(cur);
            cur = ch;
          }
        } else {
          chunks.push(cur);
          cur = ch;
        }
      } else {
        cur = trial;
      }
    }
    if (cur) chunks.push(cur);
    return chunks;
  };
  const out = [];
  for (const paraRaw of raw.split("\n")) {
    if (out.length >= maxLines) break;
    const para = paraRaw.replace(/\s+/g, " ").trim();
    if (!para) continue;
    if (fits(para)) {
      out.push(para);
      continue;
    }
    let cur = "";
    for (const word of para.split(" ")) {
      if (!cur) {
        cur = word;
        continue;
      }
      if (fits(cur + " " + word)) {
        cur += " " + word;
        continue;
      }
      // current line overflows on its own (long word) — hard-break instead of pushing
      if (!fits(cur)) {
        const chunks = breakWord(cur);
        for (let i = 0; i < chunks.length - 1; i++) {
          out.push(chunks[i]);
          if (out.length >= maxLines) return out.slice(0, maxLines);
        }
        cur = chunks[chunks.length - 1];
        if (fits(cur + " " + word)) {
          cur += " " + word;
          continue;
        }
      }
      out.push(cur);
      if (out.length >= maxLines) return out.slice(0, maxLines);
      cur = word;
    }
    if (cur) {
      if (!fits(cur)) {
        for (const chunk of breakWord(cur)) {
          out.push(chunk);
          if (out.length >= maxLines) return out.slice(0, maxLines);
        }
      } else {
        out.push(cur);
      }
    }
  }
  return out.slice(0, maxLines);
}

// Satori-inspired per-word measured wrap: when extractor provides wordWidths (canvas per word), use them directly
// instead of em-bucket for 100% fidelity. Falls back to wrapTextToWidth if no word data.
function wrapWithWordWidths(text, wordWidths, words, opts) {
  const raw = String(text ?? "");
  if (!raw.trim()) return [];
  const isBreakAllW = String(opts.wordBreak||"").toLowerCase()==="break-all";
  if (isBreakAllW) return wrapTextToWidth(text, opts);
  if (!Array.isArray(wordWidths) || !Array.isArray(words) || wordWidths.length !== words.length || wordWidths.length===0) {
    return wrapTextToWidth(text, opts);
  }
  const maxLines = Number.isFinite(opts.maxLines) ? opts.maxLines : Infinity;
  const spaceW = Number.isFinite(opts.spaceWidth) && opts.spaceWidth>0 ? opts.spaceWidth : measureTextWidth(' ', opts);
  // queue per word string to handle duplicate words in order (e.g., "GET GET" in console tables)
  const queue = new Map();
  for (let i=0;i<words.length;i++) {
    const q = queue.get(words[i]) || [];
    q.push(wordWidths[i]);
    queue.set(words[i], q);
  }
  const nextWidth = (w) => {
    const q = queue.get(w);
    if (q && q.length) return q.shift();
    return measureTextWidth(w, opts);
  };
  // hard-break a single overlong word by char-level calibrated measure (kinsoku not needed for Latin fallback)
  const hardBreakWord = (word) => {
    const chunks = [];
    let rest = word;
    while (rest && measureTextWidth(rest, opts) > opts.maxWidth) {
      let n = maxCharsFitting(rest, opts, opts.maxWidth);
      if (!n || n <= 0) n = 1;
      if (n >= rest.length) break;
      chunks.push(rest.slice(0, n));
      rest = rest.slice(n);
    }
    if (rest) chunks.push(rest);
    return chunks;
  };
  const out = [];
  for (const paraRaw of raw.split("\n")) {
    if (out.length >= maxLines) break;
    const para = paraRaw.replace(/\s+/g, " ").trim();
    if (!para) continue;
    const paraWords = para.split(" ");
    let cur = "";
    let curW = 0;
    for (const w of paraWords) {
      const wW = nextWidth(w);
      const need = cur ? curW + spaceW + wW : wW;
      if (need <= opts.maxWidth) {
        cur = cur ? cur + " " + w : w;
        curW = need;
        continue;
      }
      if (cur) {
        out.push(cur);
        if (out.length >= maxLines) return out.slice(0, maxLines);
        cur = w;
        curW = wW;
        // if single word wider than maxWidth, hard-break by chars (calibrated, not wrapTextToWidth para)
        if (curW > opts.maxWidth) {
          const chunks = hardBreakWord(w);
          for (let i=0;i<chunks.length-1;i++) {
            out.push(chunks[i]);
            if (out.length >= maxLines) return out.slice(0, maxLines);
          }
          cur = chunks[chunks.length-1];
          curW = measureTextWidth(cur, opts);
        }
      } else {
        // first word already too wide
        const chunks = hardBreakWord(w);
        for (let i=0;i<chunks.length;i++) {
          out.push(chunks[i]);
          if (out.length >= maxLines) return out.slice(0, maxLines);
        }
        cur = "";
        curW = 0;
      }
    }
    if (cur) out.push(cur);
  }
  return out.slice(0, maxLines);
}


export { measureTextWidth, maxCharsFitting, appendEllipsis, wrapTextToWidth, wrapWithWordWidths };
