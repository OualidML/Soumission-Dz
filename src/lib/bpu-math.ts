/**
 * SOUMISSIONAI-DZ: DETERMINISTIC BPU MATH ENGINE
 * This module handles the extraction and calculation of financial tables.
 * It uses strict anchors, PDF line normalization, and blacklists to eliminate "Phantom Rows".
 */

/**
 * Formats a number into Algerian Dinar currency format (e.g., 1234567 -> "1 234 567,00 DA")
 */
export function formatDZD(amount: number): string {
  const safeAmount = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XCD',
    minimumFractionDigits: 2,
  })
    .format(safeAmount)
    .replace('XCD', 'DA');
}

export interface BpuRow {
  code: string;
  designation: string;
  qty: number;
  unitPriceHT: number;
  claimedTotalHT: number;
  computedTotalHT: number;
  tvaRate: number; // 0.09 or 0.19
  diff: number;
  isError: boolean;
  isValid?: boolean;
  missingQty?: boolean;
  itemNumber?: string;
  quantity?: number;
  unitPrice?: number;
  declaredTotal?: number;
  calculatedTotal?: number;
}

export interface BpuAuditResult {
  rows: BpuRow[];
  totalHTDeclared: number;
  totalHTComputed: number;
  totalTVA: number;
  totalTTC: number;
  status: 'AUDITED' | 'ARITHMETIC_ERROR' | 'DISCREPANCY_DETECTED' | 'BPU_DATA_NOT_FOUND' | 'UNVERIFIED';
  globalDiff: number;
  items?: BpuRow[];
  declaredTotalHT?: number;
  calculatedTotalHT?: number;
  tvaRate?: number;
  tvaAmount?: number;
}

export class BpuMathEngine {
  // 1. The Blacklist: Any line containing these words is INSTANTLY discarded
  private static BLACKLIST = [
    'DOCUMENT FICTIF',
    'Page ',
    'AON N°',
    'Loi n° 23-12',
    'Loi 23-12',
    'Article',
    'Art.',
    'SOUMISSIONAI',
    'Cahier des Charges',
    'SOUmissionAI',
  ];

  /**
   * Smart Algerian/French/International number parser.
   * - "4,500,000" -> 4500000 | "12,000" -> 12000
   * - "3.000.000" -> 3000000 | "2.000"  -> 2000
   * - "6,500,000.00" -> 6500000 | "6.500.000,00" -> 6500000
   */
  static cleanNum(val: string | number | null | undefined): number {
    if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
    if (!val) return 0;
    const s = String(val)
      .replace(/(?:DA|DZD|Dinars?|HT|TTC|%)/gi, '')
      .replace(/[\s\u00a0\u202f]/g, '')
      .trim();
    if (!s) return 0;

    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');

    // Both dot and comma present (e.g. "4,500,000.00" or "4.500.000,00")
    if (lastDot !== -1 && lastComma !== -1) {
      if (lastDot > lastComma) {
        return parseFloat(s.replace(/,/g, '')) || 0;
      } else {
        return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
      }
    }

    // Only commas present
    const commas = (s.match(/,/g) || []).length;
    if (commas >= 2) return parseFloat(s.replace(/,/g, '')) || 0;
    if (commas === 1) {
      const after = s.split(',')[1] || '';
      return after.length === 3
        ? parseFloat(s.replace(/,/g, '')) || 0
        : parseFloat(s.replace(',', '.')) || 0;
    }

    // Only dots present
    const dots = (s.match(/\./g) || []).length;
    if (dots >= 2) return parseFloat(s.replace(/\./g, '')) || 0;
    if (dots === 1) {
      const after = s.split('.')[1] || '';
      return after.length === 3
        ? parseFloat(s.replace(/\./g, '')) || 0
        : parseFloat(s) || 0;
    }

    return parseFloat(s.replace(/[^0-9.-]/g, '')) || 0;
  }

  /**
   * Auto-extracts declared Total HT from the raw tender text, supporting multiple pipe columns
   * and DQE summary rows like "Total HT   229 000 000 DA".
   */
  static extractDeclaredTotalHT(rawText: string): number {
    if (!rawText) return 0;
    const patterns = [
      /(?:MONTANT\s+)?TOTAL(?:\s+G[EÉÈ]N[EÉÈ]RAL|\s+GLOBAL|\s+DE\s+L['’]OFFRE)?\s*(?:EN\s+)?(?:HORS\s+TAXES?|H\.?T\.?)[\s:=|]+([\d][\d\s.,\u00a0\u202f]*[\d])\s*(?:DA|DZD)?/gi,
      /(?:TOTAL|MONTANT)\s+(?:HORS\s+TAXES?|H\.?T\.?)\s*(?:G[EÉÈ]N[EÉÈ]RAL|GLOBAL)?[\s:=|]+([\d][\d\s.,\u00a0\u202f]*[\d])\s*(?:DA|DZD)?/gi,
      /\bTotal\s+HT[\s|:]+([\d][\d\s.,\u00a0\u202f]*[\d])\s*(?:DA|DZD)?/gi,
    ];
    let bestVal = 0;
    for (const pat of patterns) {
      let m: RegExpExecArray | null;
      while ((m = pat.exec(rawText)) !== null) {
        if (m[1]) {
          // Take only the first space-grouped number on the same line
          const firstLineNum = m[1].split(/\r?\n/)[0].trim();
          const val = this.cleanNum(firstLineNum);
          if (val > 1000 && val !== 2026) {
            bestVal = val;
          }
        }
      }
      if (bestVal > 0) return bestVal;
    }
    return 0;
  }

  private static isExcludedLine(line: string): boolean {
    if (!line || line.trim().length < 4) return true;
    const trimmed = line.trim();
    if (/^---\s*Page\s+\d+/i.test(trimmed)) return true;
    if (/^DOCUMENT\s+FICTIF/i.test(trimmed)) return true;
    if (/^AON\s+N[°o]/i.test(trimmed)) return true;

    // If the line starts with a valid item code (e.g. "1.1", "01", "LOT-01"), only exclude if it's a section title like "LOT 1 —"
    const startsWithItemCode = /^(?:LOT-|ITEM-|BPU-|MOD-)?\d{1,2}(?:\.\d{1,2})?(?:\s+|\|)/i.test(trimmed);
    if (startsWithItemCode && !/^LOT\s+\d+\s*[—:-]/i.test(trimmed)) {
      return false;
    }

    const u = trimmed.toUpperCase();
    if (this.BLACKLIST.some((w) => u.includes(w.toUpperCase()))) return true;
    return (
      /\b(ARTICLE|ART\.|LOI\s+N|DÉCRET|ARRÊTÉ|SECTION\s+\d|CHAPITRE\s+\d)\b/i.test(trimmed) ||
      /\b(CHIFFRE\s+D['’]AFFAIRES|SOUS\s+PEINE\s+D['’]ÉLIMINATION|CERTIFICATIONS?\s+SUIVANTES)\b/i.test(trimmed) ||
      /\b(TOTAL\s+G[EÉÈ]N[EÉÈ]RAL|MONTANT\s+TOTAL|SOUS-TOTAL|TOTAL\s+HT|TOTAL\s+TTC|TVA\s*\(?19%|TVA\s*\(?9%)\b/i.test(trimmed)
    );
  }

  /**
   * Normalizes flattened PDF text and strips running headers/footers so each BPU/DQE row
   * and summary line starts cleanly on its own newline.
   */
  private static normalizeBpuText(text: string): string {
    return text
      .replace(/^DOCUMENT\s+FICTIF.*$/gim, '')
      .replace(/^AON\s+N[°o].*Page\s+\d+.*$/gim, '')
      .replace(/^---\s*Page\s+\d+\s*---$/gim, '')
      .replace(/DOCUMENT\s+FICTIF[^\n]*?(?:CONTRACTUELLE|$)/gi, '\n')
      .replace(/AON\s+N[°o][^\n]*?Page\s+\d+(?:\s*\/\s*\d+)?/gi, '\n')
      .replace(/---\s*Page\s+\d+\s*---/gi, '\n')
      .replace(/((?:19|9)\s*%)\s+(?=(?:LOT-|ITEM-|BPU-|MOD-)?\d{1,2}(?:\.\d{1,2})?\s+[A-Za-zÀ-ÿ])/gi, '$1\n')
      .replace(/\s+(?=(?:0[1-9]|[1-9]\d|\d{1,2}\.\d{1,2})\s*\|)/g, '\n')
      .replace(/\s+(?=(?:LOT|BPU|ITEM|MOD)-\d{1,3}\b)/gi, '\n')
      .replace(/\s+(?=(?:MONTANT\s+)?(?:SOUS-)?TOTAL\s+(?:G[EÉÈ]N[EÉÈ]RAL|GLOBAL|HT|TTC|LOT))/gi, '\n')
      .replace(/\s+(?=TVA\s*\(?(?:19|9)\s*%)/gi, '\n');
  }

  /**
   * Joins 2-line wrapped DQE/BPU items (e.g. "1.3 Appliance pare-feu...\n(fiche S3) U 6 7 250 000 42 500 000 19%")
   * into single complete lines before row extraction.
   */
  private static mergeWrappedRows(rawLines: string[]): string[] {
    const cleaned = rawLines
      .map((l) => l.trim())
      .filter(
        (l) =>
          l.length > 0 &&
          !/^DOCUMENT\s+FICTIF/i.test(l) &&
          !/^AON\s+N[°o].*Page\s+\d+/i.test(l) &&
          !/^---\s*Page\s+\d+/i.test(l)
      );

    const merged: string[] = [];
    const itemStartRe = /^(?:LOT-|ITEM-|BPU-|MOD-)?(\d{1,2}(?:\.\d{1,2})?)(?:\s+|\|)/i;
    const stopContinuationRe =
      /^(?:(?:LOT-|ITEM-|BPU-|MOD-)?\d{1,2}(?:\.\d{1,2})?(?:\s+|\|)|Total\b|Montant\b|Sous-total\b|TVA\b|N[°o]\b|Item\b|Code\b|Annexe\b|LOT\s+\d+\s*[—:-]|Estimation\b|Planning\b|Récapitulatif\b|NB\s*:|Note\s*:)/i;
    const hasCompletePriceTailRe = /(\d[\d\s.,]*\d)\s+(?:(19|9)\s*%\s*)?$/;

    let i = 0;
    while (i < cleaned.length) {
      let current = cleaned[i];
      if (itemStartRe.test(current) && !/^LOT\s+\d+\s*[—:-]/i.test(current)) {
        while (
          i + 1 < cleaned.length &&
          !hasCompletePriceTailRe.test(current) &&
          !stopContinuationRe.test(cleaned[i + 1])
        ) {
          current = `${current} ${cleaned[i + 1]}`;
          i++;
        }
      }
      merged.push(current);
      i++;
    }
    return merged;
  }

  /**
   * Parses space-separated or comma/dot-separated numeric tail at the end of a DQE/BPU line
   * into { qty, pu, claimed, missingQty }.
   * Example 1: "6 4 850 000 29 100 000" -> { qty: 6, pu: 4850000, claimed: 29100000, missingQty: false }
   * Example 2: "600 000 12 000 000" -> { qty: 20, pu: 600000, claimed: 12000000, missingQty: true }
   */
  private static parseNumericTail(
    tailStr: string,
    hasUnitToken: boolean
  ): { qty: number; pu: number; claimed: number; missingQty: boolean } | null {
    const tokens = tailStr
      .trim()
      .split(/\s+/)
      .filter((t) => t.length > 0);
    if (tokens.length < 2) return null;

    const isValidNumberSlice = (start: number, end: number, isPrice: boolean): number | null => {
      if (start > end || start < 0 || end >= tokens.length) return null;
      if (start === end) {
        const tok = tokens[start];
        if (/^0\d+$/.test(tok)) return null; // "000" alone cannot start or be a number
        const val = this.cleanNum(tok);
        if (val <= 0 || val === 2026) return null;
        return val;
      }
      // Multi-token space-grouped number: first token 1..3 digits (no leading 0), subsequent tokens exactly 3 digits
      if (!/^[1-9]\d{0,2}$/.test(tokens[start])) return null;
      for (let k = start + 1; k <= end; k++) {
        const isLast = k === end;
        if (isLast ? !/^\d{3}(?:[.,]\d{1,2})?$/.test(tokens[k]) : !/^\d{3}$/.test(tokens[k])) {
          return null;
        }
      }
      const val = this.cleanNum(tokens.slice(start, end + 1).join(''));
      if (val <= 0 || val === 2026) return null;
      if (isPrice && val < 100) return null;
      return val;
    };

    // 1. Search all valid 3-number partitions: (qty: [0..i], pu: [i+1..j], claimed: [j+1..n-1])
    let best3: { qty: number; pu: number; claimed: number; score: number } | null = null;
    for (let i = 0; i < tokens.length - 2; i++) {
      const qty = isValidNumberSlice(0, i, false);
      if (qty === null || qty <= 0 || qty > 100000) continue;
      for (let j = i + 1; j < tokens.length - 1; j++) {
        const pu = isValidNumberSlice(i + 1, j, true);
        const claimed = isValidNumberSlice(j + 1, tokens.length - 1, true);
        if (pu === null || claimed === null || pu < 100 || claimed < 100) continue;
        const expected = qty * pu;
        const ratio = claimed / expected;
        if (ratio >= 0.05 && ratio <= 20) {
          const score = Math.abs(Math.log(ratio));
          if (!best3 || score < best3.score) {
            best3 = { qty, pu, claimed, score };
          }
        }
      }
    }

    if (best3) {
      return {
        qty: best3.qty,
        pu: best3.pu,
        claimed: best3.claimed,
        missingQty: false,
      };
    }

    // 2. Search valid 2-number partitions: (pu: [0..j], claimed: [j+1..n-1]) -> missing quantity!
    let best2: { pu: number; claimed: number; score: number } | null = null;
    for (let j = 0; j < tokens.length - 1; j++) {
      const pu = isValidNumberSlice(0, j, true);
      const claimed = isValidNumberSlice(j + 1, tokens.length - 1, true);
      if (pu === null || claimed === null || pu < 100 || claimed < 100) continue;
      if (claimed < pu * 0.5) continue;
      const impliedQty = claimed / pu;
      const nearestInt = Math.max(1, Math.round(impliedQty));
      const intError = Math.abs(impliedQty - nearestInt) / nearestInt;
      if (!best2 || intError < best2.score) {
        best2 = { pu, claimed, score: intError };
      }
    }

    if (best2) {
      const inferredQty = best2.claimed > best2.pu ? Math.round(best2.claimed / best2.pu) : 1;
      const missingQty = best2.claimed > best2.pu || hasUnitToken;
      return {
        qty: inferredQty > 0 ? inferredQty : 1,
        pu: best2.pu,
        claimed: best2.claimed,
        missingQty,
      };
    }

    return null;
  }

  /**
   * Selects the best pricing table slice from rawText:
   * - Prefers the LAST occurrence of DÉTAIL QUANTITATIF ET ESTIMATIF / ANNEXE 8 (skipping SOMMAIRE)
   * - Falls back to the LAST occurrence of BORDEREAU DES PRIX UNITAIRES / BPU
   * - Stops slicing at ANNEXE 9, PLANNING INDICATIF, or Estimation administrative
   */
  private static extractPricingSlice(safeText: string, preferDqe: boolean): string {
    const findLastMatchIndex = (re: RegExp): number => {
      let lastIdx = -1;
      let m: RegExpExecArray | null;
      while ((m = re.exec(safeText)) !== null) {
        if (m.index !== undefined) lastIdx = m.index;
      }
      return lastIdx;
    };

    const dqeRe = /(?:D[EÉÈ]TAIL\s+QUANTITATIF\s+ET\s+ESTIMATIF|ANNEXE\s+8\b)/gi;
    const bpuRe = /(?:BORDEREAU\s+DES\s+PRIX\s+UNITAIRES|BORDEREAU\s+DES\s+PRIX|\bB\.?P\.?U\.?\b|ITEM\s*\|\s*D[EÉÈ]SIGNATION)/gi;

    let startIdx = preferDqe ? findLastMatchIndex(dqeRe) : -1;
    if (startIdx === -1) {
      startIdx = findLastMatchIndex(bpuRe);
    }
    if (startIdx === -1) return safeText;

    const tail = safeText.substring(startIdx);
    const stopMatch = tail
      .substring(40)
      .match(/(?:ANNEXE\s+9\b|PLANNING\s+INDICATIF|Estimation\s+administrative)/i);
    if (stopMatch && stopMatch.index !== undefined) {
      return tail.substring(0, 40 + stopMatch.index);
    }
    return tail;
  }

  /**
   * The Core Extraction & Audit Logic
   */
  static auditBpu(rawText: string, declaredTotalHT: number = 0, presetItems?: any[]): BpuAuditResult {
    const safeText = rawText || '';
    const rawSlice = this.extractPricingSlice(safeText, true);
    const effectiveDeclaredHT =
      declaredTotalHT > 0
        ? declaredTotalHT
        : this.extractDeclaredTotalHT(rawSlice) || this.extractDeclaredTotalHT(safeText);

    const parseSlice = (sliceText: string): { rows: BpuRow[]; computedTotalHT: number } => {
      const normalizedText = this.normalizeBpuText(sliceText);
      const lines = this.mergeWrappedRows(normalizedText.split(/\r?\n/));
      const rows: BpuRow[] = [];
      let totalHT = 0;

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (this.isExcludedLine(line)) continue;

        // Strategy A: Pipe-delimited rows (including decimal codes & blank qty like "05 | Main d'oeuvre | | 7.000.000 | 7,000,000")
        if (line.includes('|')) {
          const rawCells = line.split('|').map((c) => c.trim());
          const nonEmpty = rawCells.filter((c) => c.length > 0);
          if (nonEmpty.length >= 3) {
            if (/^(item|n°|no|code|lot|r[eé]f)/i.test(nonEmpty[0]) && /d[eé]signation/i.test(line)) {
              continue;
            }

            const codeMatch = nonEmpty[0].match(/^(?:LOT-|ITEM-|BPU-|MOD-)?(\d{1,3}(?:\.\d{1,2})?)$/i);
            if (codeMatch) {
              const rawCode = codeMatch[1];
              const code = rawCode.includes('.')
                ? `BPU-${rawCode}`
                : `BPU-${rawCode.padStart(2, '0')}`;
              const designation = nonEmpty[1] || `Prestation ${code}`;
              const numericTail = nonEmpty
                .slice(2)
                .filter((c) => !/^(?:19|9)\s*%$/.test(c))
                .map((c) => this.cleanNum(c))
                .filter((n) => n > 0 && n !== 2026);

              if (numericTail.length >= 2) {
                const hasOnlyTwoNums = numericTail.length === 2;
                const pu = hasOnlyTwoNums ? numericTail[0] : numericTail[1];
                const claimed = numericTail[numericTail.length - 1];
                const qty = hasOnlyTwoNums
                  ? claimed > pu && pu > 0
                    ? Math.round(claimed / pu)
                    : 1
                  : numericTail[0];
                const missingQty = hasOnlyTwoNums && claimed > pu;

                if (pu >= 100) {
                  const computed = Math.round(qty * pu * 100) / 100;
                  const diff = Math.round((claimed - computed) * 100) / 100;
                  const isError = Math.abs(diff) > 1 || missingQty;
                  rows.push({
                    code,
                    designation,
                    qty,
                    unitPriceHT: pu,
                    claimedTotalHT: claimed,
                    computedTotalHT: computed,
                    tvaRate: /9\s*%/.test(line) ? 0.09 : 0.19,
                    diff,
                    isError,
                    isValid: !isError,
                    missingQty,
                    itemNumber: code,
                    quantity: qty,
                    unitPrice: pu,
                    declaredTotal: claimed,
                    calculatedTotal: computed,
                  });
                  totalHT += computed;
                  continue;
                }
              }
            }
          }
        }

        // Strategy B: Space/tab-separated DQE & BPU rows (supports decimal codes "1.1".."2.5", space-separated thousands, and missing qty)
        let workingLine = line;
        let tvaRate = 0.19;
        const tvaMatch = workingLine.match(/\s+(19|9)\s*%\s*$/);
        if (tvaMatch) {
          tvaRate = tvaMatch[1] === '9' ? 0.09 : 0.19;
          workingLine = workingLine.slice(0, tvaMatch.index).trim();
        }
        workingLine = workingLine.replace(/\s+(?:DA|DZD)\s*$/i, '').trim();

        const codeHeadMatch = workingLine.match(
          /^(?:LOT-|ITEM-|BPU-|MOD-)?(\d{1,2}(?:\.\d{1,2})?)\s+(.+)$/i
        );
        if (codeHeadMatch) {
          const rawCode = codeHeadMatch[1];
          const rest = codeHeadMatch[2].trim();

          // Extract the contiguous numeric tail at the end of the line
          const tailMatch = rest.match(/^(.*?)(\d[\d\s.,]*)$/);
          if (tailMatch && tailMatch[1].trim().length >= 3) {
            let designationPart = tailMatch[1].trim();
            const rawTail = tailMatch[2].trim();

            const unitRe =
              /\s+\b(U|Unit[eé]|Ens|Ensemble|Forfait|Fft|Socket|Licence|Session|Site|Jours?|H\/J|Mois|An|Lot)\s*$/i;
            const hasUnitToken = unitRe.test(designationPart);
            if (hasUnitToken) {
              designationPart = designationPart.replace(unitRe, '').trim();
            }

            const parsedNumbers = this.parseNumericTail(rawTail, hasUnitToken);
            if (parsedNumbers && parsedNumbers.pu >= 100) {
              const code = rawCode.includes('.')
                ? `BPU-${rawCode}`
                : `BPU-${rawCode.padStart(2, '0')}`;
              const { qty, pu, claimed, missingQty } = parsedNumbers;
              const computed = Math.round(qty * pu * 100) / 100;
              const diff = Math.round((claimed - computed) * 100) / 100;
              const isError = Math.abs(diff) > 1 || missingQty;

              rows.push({
                code,
                designation: designationPart,
                qty,
                unitPriceHT: pu,
                claimedTotalHT: claimed,
                computedTotalHT: computed,
                tvaRate,
                diff,
                isError,
                isValid: !isError,
                missingQty,
                itemNumber: code,
                quantity: qty,
                unitPrice: pu,
                declaredTotal: claimed,
                calculatedTotal: computed,
              });
              totalHT += computed;
            }
          }
        }
      }

      return { rows, computedTotalHT: totalHT };
    };

    let { rows: extractedRows, computedTotalHT } = parseSlice(rawSlice);
    if (extractedRows.length === 0) {
      const fallbackSlice = this.extractPricingSlice(safeText, false);
      if (fallbackSlice !== rawSlice) {
        const retry = parseSlice(fallbackSlice);
        extractedRows = retry.rows;
        computedTotalHT = retry.computedTotalHT;
      }
    }

    // Fallback to presetItems (for demo-data sample tenders)
    if (extractedRows.length === 0 && Array.isArray(presetItems) && presetItems.length > 0) {
      for (const item of presetItems) {
        const code = item.code || `BPU-0${extractedRows.length + 1}`;
        const designation = item.designation || 'Prestation';
        const qty = this.cleanNum(item.qty) || 1;
        const pu = this.cleanNum(item.unitPriceHT);
        const claimed = this.cleanNum(item.claimedTotalHT);
        const computed = Math.round(qty * pu * 100) / 100;
        const diff = Math.round((claimed - computed) * 100) / 100;
        const isError = Math.abs(diff) > 1;
        extractedRows.push({
          code,
          designation,
          qty,
          unitPriceHT: pu,
          claimedTotalHT: claimed,
          computedTotalHT: computed,
          tvaRate: item.tvaRate === 9 || item.tvaRate === 0.09 ? 0.09 : 0.19,
          diff,
          isError,
          isValid: !isError,
          itemNumber: code,
          quantity: qty,
          unitPrice: pu,
          declaredTotal: claimed,
          calculatedTotal: computed,
        });
        computedTotalHT += computed;
      }
    }

    if (extractedRows.length === 0) {
      return {
        rows: [],
        items: [],
        totalHTDeclared: effectiveDeclaredHT,
        declaredTotalHT: effectiveDeclaredHT,
        totalHTComputed: 0,
        calculatedTotalHT: 0,
        totalTVA: 0,
        tvaAmount: 0,
        tvaRate: 19,
        totalTTC: 0,
        status: 'BPU_DATA_NOT_FOUND',
        globalDiff: 0,
      };
    }

    const totalTVA = Math.round(
      extractedRows.reduce((acc, r) => acc + r.computedTotalHT * r.tvaRate, 0) * 100
    ) / 100;
    const totalTTC = Math.round((computedTotalHT + totalTVA) * 100) / 100;
    const finalDeclaredHT =
      effectiveDeclaredHT > 0
        ? effectiveDeclaredHT
        : extractedRows.reduce((acc, r) => acc + r.claimedTotalHT, 0);
    const globalDiff = Math.round((finalDeclaredHT - computedTotalHT) * 100) / 100;

    let status: BpuAuditResult['status'] = 'AUDITED';
    if (extractedRows.some((r) => r.isError) || Math.abs(globalDiff) > 100) {
      status = 'ARITHMETIC_ERROR';
    } else if (effectiveDeclaredHT === 0 && (!presetItems || presetItems.length === 0)) {
      status = 'UNVERIFIED';
    }

    const dominantTvaRate = extractedRows.every((r) => r.tvaRate === 0.09) ? 9 : 19;

    return {
      rows: extractedRows,
      items: extractedRows,
      totalHTDeclared: finalDeclaredHT,
      declaredTotalHT: finalDeclaredHT,
      totalHTComputed: computedTotalHT,
      calculatedTotalHT: computedTotalHT,
      totalTVA,
      tvaAmount: totalTVA,
      tvaRate: dominantTvaRate,
      totalTTC,
      status,
      globalDiff,
    };
  }
}
