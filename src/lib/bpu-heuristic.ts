import { BpuItem } from './types';

/**
 * Stage 2 — Heuristic "Deep-Scan" BPU extraction.
 * Scans the ENTIRE text for lines carrying >= 3 numeric tokens of which >= 2
 * are large amounts (>= 1 000 DA), e.g. "1 | Installation | 5,000,000 | 5,000,000".
 * Legal citations (Art., Loi, N° xx/yyyy, décret...) and dates are rejected.
 */

const LEGAL_RE =
  /\bart\.?\s*\d|\barticle\s+\d|\bloi\s+(?:n[°o]\s*)?\d{2,4}[-\/]\d{2,4}|\bn[°o]\s*\d{1,4}\s*\/\s*\d{2,4}|d[ée]cret|arr[êe]t[ée]|journal\s+officiel|al[ié]n[ée]a/i;
const DATE_RE = /\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b/g;
const NUM_RE = /\d{1,3}(?:[ .,\u00a0\u202f]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d+)?/g;

function toNumber(tok: string): number {
  const s = tok.replace(/[\s\u00a0\u202f]/g, '');
  const groupedDots = /^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(s);
  const groupedCommas = /^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(s);
  if (groupedDots) return parseFloat(s.replace(/\./g, '').replace(',', '.'));
  if (groupedCommas) return parseFloat(s.replace(/,/g, ''));
  return parseFloat(s.replace(',', '.'));
}

export function extractBpuHeuristic(text: string): BpuItem[] | null {
  if (!text) return null;
  const items: BpuItem[] = [];
  let index = 1;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length < 8 || LEGAL_RE.test(line)) continue;

    const cleaned = line.replace(DATE_RE, ' ').replace(/\b\d{1,3}\s?%/g, ' ');
    const tokens = cleaned.match(NUM_RE) || [];
    const nums = tokens.map(toNumber).filter((n) => isFinite(n) && n > 0);
    // Drop bare years (e.g. 2026) that are not thousand-grouped
    const filtered = nums.filter((n, i) => !(Number.isInteger(n) && n >= 1900 && n <= 2100 && !/[ .,]/.test(tokens[i] || '')));
    if (filtered.length < 3) continue;

    const large = filtered.filter((n) => n >= 1000);
    if (large.length < 2) continue;

    const claimedTotalHT = large[large.length - 1];
    const unitPriceHT = large[large.length - 2];
    const small = filtered.filter((n) => n < 1000);
    let qty = small.length > 0 ? small[small.length - 1] : Math.max(1, Math.round(claimedTotalHT / unitPriceHT));
    // If the first token is a row number and there's another small token, prefer the latter as qty
    if (small.length >= 2) qty = small[1];

    const firstNumIdx = line.search(/\d/);
    let designation = line
      .replace(/^[\s\d.|\-–]+/, '')
      .split(/\s*\|\s*|\t|\s{2,}/)
      .find((p) => /[a-zA-Zàâçéèêëîïôûùüÿœ]{3,}/.test(p)) || '';
    if (!designation) designation = line.slice(0, Math.max(firstNumIdx, 0));
    designation = designation.replace(/[\d\s.,]+$/, '').trim().slice(0, 80);
    if (designation.length < 3) continue;

    items.push({
      code: `BPU-${String(index).padStart(2, '0')}`,
      designation,
      unit: 'U',
      qty,
      unitPriceHT,
      claimedTotalHT,
      tvaRate: /\b9\s?%/.test(line) ? 9 : 19,
    });
    index++;
  }

  return items.length > 0 ? items : null;
}
