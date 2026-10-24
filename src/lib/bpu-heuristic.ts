import { BpuItem } from './types';

/**
 * Stage 2 — Heuristic "Deep-Scan" BPU extraction.
 * Incorporates 3 Surgical Guardian Logics:
 * 1. Footer/Header Guard: Instantly discards lines with "DOCUMENT FICTIF", "Page X", "AON N°", "Loi n° 23-12".
 * 2. Structure Guard: Requires a real text designation AND at least 2 valid pricing numbers (never pure references).
 * 3. Amount Guard: Strictly ignores current year "2026" or noise years as pricing figures.
 */

export const CURRENT_YEAR = 2026;

/**
 * The "Footer/Header" Guard:
 * Instantly discards document footers, headers, references, and legal statutes.
 */
export function isExcludedBpuLine(line: string): boolean {
  if (!line || line.trim().length < 4) return true;
  const l = line.toLowerCase();

  // Instant exclusion for footers, headers, and metadata
  if (
    l.includes('document fictif') ||
    /\bpage\s*(?:\d+|[ivxlcdm]+)(?:\s*[\/sur\-]\s*\d+)?\b/i.test(l) ||
    /\baon\s*(?:n[°o]|num[ée]ro)?\b/i.test(l) ||
    /\bloi\s*(?:n[°o]\s*)?23-12\b/i.test(l) ||
    /\bloi\s+23-12\b/i.test(l) ||
    /\bavis\s+d['’]appel\s+d['’]offres?\b/i.test(l) ||
    /\bcahier\s+des\s+charges\b/i.test(l) ||
    /\bdossier\s+d['’]appel\s+d['’]offres?\b/i.test(l) ||
    /\br[ée]publique\s+alg[ée]rienne\b/i.test(l) ||
    /\bminist[èe]re\b/i.test(l)
  ) {
    return true;
  }

  // Legal citation filter (Articles, Laws, Decrees, Bulletins)
  if (
    /\bart\.?\s*\d+/i.test(l) ||
    /\barticle\s+\d+/i.test(l) ||
    /\bloi\s+(?:n[°o]\s*)?\d{2,4}[-\/]\d{2,4}/i.test(l) ||
    /\bn[°o]\s*\d{1,4}\s*\/\s*\d{2,4}/i.test(l) ||
    /\bd[ée]cret\b/i.test(l) ||
    /\barr[êe]t[ée]\b/i.test(l) ||
    /\bjournal\s+officiel\b/i.test(l) ||
    /\balin[ée]a\b/i.test(l) ||
    /\binstruction\b/i.test(l)
  ) {
    return true;
  }

  // Narrative & Administrative Clauses Guard (Turnover, Certifications, Eligibility)
  if (
    /chiffre\s+d['’]affaires/i.test(l) ||
    /capacit[eéè]s?\s+financi[eéè]res?/i.test(l) ||
    /commissaire\s+aux\s+comptes/i.test(l) ||
    /bilans?\s+financiers?/i.test(l) ||
    /certifications?\s+suivantes/i.test(l) ||
    /sous\s+peine\s+d['’]?[eéè]limination/i.test(l) ||
    /sous\s+peine\s+de\s+rejet/i.test(l) ||
    /soumissionnaires?\s+doivent/i.test(l) ||
    /candidats?\s+doit/i.test(l) ||
    /candidats?\s+doivent/i.test(l) ||
    /doit\s+imp[eéè]rativement/i.test(l) ||
    /dossier\s+de\s+candidature/i.test(l) ||
    /\bsection\s+\d+/i.test(l) ||
    /\bchapitre\s+\d+/i.test(l)
  ) {
    return true;
  }

  return false;
}

/**
 * The "Amount" Guard:
 * Returns true if a number is the tender year (e.g. 2026) or a reference year.
 */
export function isYearOrReferenceAmount(num: number, rawToken?: string): boolean {
  if (num === CURRENT_YEAR) return true;
  if (num >= 1990 && num <= 2035) {
    if (!rawToken) return true;
    const clean = rawToken.trim();
    // Bare 4-digit unformatted year
    if (/^\d{4}$/.test(clean)) return true;
  }
  return false;
}

/**
 * The "Structure" Guard:
 * A valid BPU row MUST contain a meaningful designation (text) and not just reference numbers.
 */
export function isValidBpuDesignation(text: string): boolean {
  if (!text) return false;
  const l = text.toLowerCase();

  // If text contains administrative verbs or keywords, it's not a BPU line
  if (
    /doit|doivent|obligatoire|[eéèEÉÈ]limination|chiffre\s+d['’]affaires|certifications?|candidat|soumissionnaire/i.test(
      l
    )
  ) {
    return false;
  }

  const cleaned = text
    .replace(/^[\s\d.|\-–—:]+/, '')
    .replace(/\b(lot|item|n°|no|ref|code|art)\s*[:.-]?\s*\d+\b/gi, '')
    .trim();

  if (cleaned.length < 3) return false;

  const words = cleaned.split(/[\s,;|\/\-]+/).filter((w) => w.length >= 3);
  const nonReferenceWords = words.filter(
    (w) =>
      !/^(aon|ref|lot|doc|pdf|num|page|bpu|dqe|tva|ttc|ht|dzd|da|date|telecom|algerie|section|chapitre)$/i.test(
        w
      )
  );

  return nonReferenceWords.length >= 1;
}

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

  // If the document has a designated BPU section header, prioritize scanning from there
  const bpuHeaderRegex =
    /(?:BORDEREAU\s+DES\s+PRIX(?:\s+UNITAIRES)?|B\.?P\.?U\.?|OFFRE\s+FINANCI[EÉÈ]RE|D[EÉÈ]TAIL\s+(?:QUANTITATIF|ESTIMATIF))/i;
  const allLines = text.split(/\r?\n/);
  let bpuStartLine = -1;
  for (let i = 0; i < allLines.length; i++) {
    if (bpuHeaderRegex.test(allLines[i])) {
      bpuStartLine = i;
      break;
    }
  }
  const scanLines = bpuStartLine >= 0 ? allLines.slice(bpuStartLine) : allLines;

  for (const rawLine of scanLines) {
    const line = rawLine.trim();
    // 1. The "Footer/Header" Guard
    if (line.length < 8 || isExcludedBpuLine(line)) continue;

    const cleaned = line.replace(DATE_RE, ' ').replace(/\b\d{1,3}\s?%/g, ' ');
    const tokens = cleaned.match(NUM_RE) || [];
    const rawPairs = tokens.map((tok) => ({ tok, val: toNumber(tok) }));

    // 3. The "Amount" Guard: eliminate year numbers (2026) and non-financial values
    const filteredPairs = rawPairs.filter(
      (p) => isFinite(p.val) && p.val > 0 && !isYearOrReferenceAmount(p.val, p.tok)
    );

    if (filteredPairs.length < 2) continue;

    const nums = filteredPairs.map((p) => p.val);
    const large = nums.filter((n) => n >= 100);
    if (large.length < 1) continue;

    // 2. The "Structure" Guard: find genuine designation
    const firstNumIdx = line.search(/\d/);
    let candidateDesig = line
      .replace(/^[\s\d.|\-–]+/, '')
      .split(/\s*\|\s*|\t|\s{2,}/)
      .find((p) => /[a-zA-Zàâçéèêëîïôûùüÿœ]{3,}/.test(p)) || '';
    if (!candidateDesig) candidateDesig = line.slice(0, Math.max(firstNumIdx, 0));
    candidateDesig = candidateDesig.replace(/[\d\s.,]+$/, '').trim().slice(0, 80);

    if (!isValidBpuDesignation(candidateDesig)) continue;

    let qty = 1;
    let unitPriceHT = 0;
    let claimedTotalHT = 0;

    if (nums.length >= 3) {
      claimedTotalHT = nums[nums.length - 1];
      unitPriceHT = nums[nums.length - 2];
      const small = nums.slice(0, nums.length - 2).filter((n) => n <= 10000);
      qty = small.length > 0 ? small[small.length - 1] : Math.max(1, Math.round(claimedTotalHT / unitPriceHT));
    } else {
      unitPriceHT = nums[0];
      claimedTotalHT = nums[1];
      qty = unitPriceHT > 0 ? Math.max(1, Math.round(claimedTotalHT / unitPriceHT)) : 1;
    }

    if (unitPriceHT < 100 || isYearOrReferenceAmount(unitPriceHT) || isYearOrReferenceAmount(claimedTotalHT)) {
      continue;
    }

    items.push({
      code: `BPU-${String(index).padStart(2, '0')}`,
      designation: candidateDesig,
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
