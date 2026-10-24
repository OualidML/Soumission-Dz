import { CompanyProfile, FatalTrap } from './types';

/**
 * Deterministic Requirement-vs-Reality engine (Loi n° 23-12).
 * Pure functions — no I/O — so they can be unit-tested and shared by the
 * local fallback analyzer and the Pass 2 critic prompt.
 */

// ---------------------------------------------------------------------------
// 1. NUMERICAL COMPARISON (Chiffre d'affaires)
// ---------------------------------------------------------------------------

/** Parses "200", "1,5", "4 500 000", "3.000.000", "6,500,000.00" into a float. */
export function parseLooseNumber(raw: string): number {
  const s = (raw || '').replace(/[\s\u00a0\u202f]/g, '');
  if (!s) return NaN;

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');

  if (lastDot !== -1 && lastComma !== -1) {
    if (lastDot > lastComma) {
      // English format: "6,500,000.00" -> strip commas
      return parseFloat(s.replace(/,/g, ''));
    } else {
      // French format: "6.500.000,00" -> strip dots, comma is decimal
      return parseFloat(s.replace(/\./g, '').replace(',', '.'));
    }
  }

  const commas = (s.match(/,/g) || []).length;
  if (commas >= 2) return parseFloat(s.replace(/,/g, ''));
  if (commas === 1) {
    const after = s.split(',')[1];
    return after.length === 3 ? parseFloat(s.replace(/,/g, '')) : parseFloat(s.replace(',', '.'));
  }

  const dots = (s.match(/\./g) || []).length;
  if (dots >= 2) return parseFloat(s.replace(/\./g, ''));
  if (dots === 1) {
    const after = s.split('.')[1];
    return after.length === 3 ? parseFloat(s.replace(/\./g, '')) : parseFloat(s);
  }

  return parseFloat(s.replace(/[^0-9.-]/g, ''));
}

/** Converts an amount + unit word into an integer number of DZD. */
export function toDzd(amount: number, unit: string): number {
  const u = (unit || '').toLowerCase().replace(/\s/g, '');
  if (/^(milliards?|mds?|mrd)/.test(u)) return Math.round(amount * 1e9);
  if (/^(millions?|mda|mdzd|m)/.test(u)) return Math.round(amount * 1e6);
  return Math.round(amount);
}

export interface TurnoverRequirement {
  requiredValueDZD: number;
  sourceExcerpt: string;
}

/**
 * Extracts the minimum required turnover (chiffre d'affaires) from tender text.
 * Returns null if no explicit numeric threshold is stated.
 */
export function extractRequiredTurnover(text: string): TurnoverRequirement | null {
  if (!text) return null;
  const re =
    /(chiffre\s+d['’\u2019]\s?affaires?|\bc\.?a\.?\b|turnover)([^\n]{0,160}?)(\d[\d\s.,\u00a0\u202f]*\d|\d)\s*(milliards?|mds?|millions?|m\s?da\b|mda\b|m\s?dzd|da\b|dzd\b|dinars?)/gi;
  let best: TurnoverRequirement | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const amount = parseLooseNumber(m[3]);
    if (!isFinite(amount) || amount <= 0) continue;
    const value = toDzd(amount, m[4]);
    if (value < 100000) continue; // ignore noise (years, article numbers)
    if (!best || value > best.requiredValueDZD) {
      best = { requiredValueDZD: value, sourceExcerpt: m[0].trim().slice(0, 200) };
    }
  }
  return best;
}

export function checkTurnover(text: string, profile: CompanyProfile): FatalTrap | null {
  const req = extractRequiredTurnover(text);
  if (!req) return null;
  const actual = Math.round(Number(profile?.avgAnnualTurnoverDZD) || 0);
  if (actual >= req.requiredValueDZD) return null;
  const fmt = (n: number) => `${(n / 1e6).toLocaleString('fr-DZ', { maximumFractionDigits: 2 })} M DA`;
  return {
    trapId: 'TRAP-FINANCIAL-INSUFFICIENCY',
    severity: 'FATAL',
    cause: `Capacité financière insuffisante : chiffre d'affaires exigé ${fmt(req.requiredValueDZD)} — chiffre d'affaires du soumissionnaire ${fmt(actual)} (écart ${fmt(req.requiredValueDZD - actual)}). Extrait : "${req.sourceExcerpt}"`,
    legalBasis: 'Loi n° 23-12 Art. 47 (capacités financières) & critère de qualification minimale du Cahier des Charges.',
    correctionRequired: "Constituer un groupement solidaire avec un partenaire dont le chiffre d'affaires cumulé atteint le seuil exigé, ou renoncer à la soumission.",
  };
}

// ---------------------------------------------------------------------------
// 2. LEGAL LOGIC — Startup exemption vs exclusive reservation
// ---------------------------------------------------------------------------

export interface StartupClauseAnalysis {
  isExemption: boolean;
  isReservation: boolean;
}

export function classifyStartupClauses(text: string): StartupClauseAnalysis {
  const t = (text || '').toLowerCase();
  const isReservation =
    /r[ée]serv[ée]e?s?\s+exclusivement\s+aux\s+start[-\s]?ups?/.test(t) ||
    /exclusively\s+reserved\s+(?:for|to)\s+start[-\s]?ups?/.test(t);
  const mentionsStartup = /start[-\s]?ups?|jeunes?\s+entreprises?\s+innovantes?|art(?:icle|\.)\s*87/.test(t);
  const isExemption =
    mentionsStartup &&
    (/dispens[ée]e?s?/.test(t) || /exempt/.test(t) || /exon[ée]r/.test(t));
  return { isExemption, isReservation };
}

// ---------------------------------------------------------------------------
// 3. EXHAUSTIVE CERTIFICATION CHECKLIST
// ---------------------------------------------------------------------------

const CERT_LABELS: Record<string, string> = {
  'ISO 9001': 'Management de la qualité',
  'ISO 14001': 'Management environnemental',
  'ISO 27001': "Management de la sécurité de l'information",
  'ISO 45001': 'Santé et sécurité au travail',
  'ISO 22000': 'Sécurité des denrées alimentaires',
  'ISO 50001': "Management de l'énergie",
  MAF: 'Agrément de Matériel / Homologation (Algérie Télécom)',
  CISSP: 'Certified Information Systems Security Professional',
  CEH: 'Certified Ethical Hacker',
};

/** Returns every distinct certification explicitly required in the text. */
export function extractRequiredCerts(text: string): string[] {
  const t = text || '';
  const found = new Set<string>();

  // 1. Regex search across entire document
  const isoRe = /\bISO(?:\s*\/\s*IEC)?\s*[-:]?\s*(\d{4,5})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = isoRe.exec(t)) !== null) found.add(`ISO ${m[1]}`);

  // MAF: Agrément de Matériel / Homologation (Algérie Télécom)
  if (/\bMAF\b|agr[ée]ment\s+(?:de\s+)?mat[ée]riel\s*\(?MAF\)?|homologation\s+MAF/i.test(t)) {
    found.add('MAF');
  }

  if (/\bCISSP\b/i.test(t)) found.add('CISSP');
  if (/\bCEH\b|certified\s+ethical\s+hacker/i.test(t)) found.add('CEH');

  // 2. Focused extraction in eliminatory certification sections:
  // "obligatoires sous peine d'élimination", "sous peine d'élimination", "sous peine de rejet"
  const eliminatorySectionRe =
    /(?:obligatoires?|exig[ée]e?s?)\s+sous\s+peine\s+d['’]?[ée]limination[^\n.]*[:\s]([^\n.]{0,350})/gi;
  let elMatch: RegExpExecArray | null;
  while ((elMatch = eliminatorySectionRe.exec(t)) !== null) {
    const snippet = elMatch[1];
    if (/\b9001\b/.test(snippet)) found.add('ISO 9001');
    if (/\b14001\b/.test(snippet)) found.add('ISO 14001');
    if (/\b27001\b/.test(snippet)) found.add('ISO 27001');
    if (/\b45001\b/.test(snippet)) found.add('ISO 45001');
    if (/\bMAF\b|mat[ée]riel/i.test(snippet)) found.add('MAF');
  }

  return Array.from(found);
}

export function profileHasCert(certs: string[], required: string): boolean {
  if (!Array.isArray(certs) || certs.length === 0) return false;
  const key = required.replace(/^ISO\s*/i, '').toLowerCase();

  return certs.some((c) => {
    const lc = c.toLowerCase();
    if (required === 'MAF') {
      return (
        /\bmaf\b/.test(lc) ||
        lc.includes('matériel agréé') ||
        lc.includes('materiel agree') ||
        lc.includes('agrément de matériel') ||
        lc.includes('agrement de materiel') ||
        lc.includes('homologation')
      );
    }
    if (required === 'CEH') return /\bceh\b|ethical\s+hacker/.test(lc);
    if (required === 'CISSP') return lc.includes('cissp');
    return lc.includes(key);
  });
}

/** One FATAL trap per missing certification — never stops at the first. */
export function checkCertifications(text: string, profile: CompanyProfile): { required: string[]; traps: FatalTrap[] } {
  const required = extractRequiredCerts(text);
  const certs = Array.isArray(profile?.certifications) ? profile.certifications : [];
  const traps: FatalTrap[] = [];
  for (const cert of required) {
    if (profileHasCert(certs, cert)) continue;
    const id = cert.replace(/\s+/g, '');
    traps.push({
      trapId: `TRAP-${id}-MISSING`,
      severity: 'FATAL',
      cause: `Certification obligatoire manquante : ${cert}${CERT_LABELS[cert] ? ` (${CERT_LABELS[cert]})` : ''} exigée sous peine d'élimination et non détenue par le soumissionnaire.`,
      legalBasis: 'Loi n° 23-12 Art. 47 & Clause éliminatoire expresse du Cahier des Charges.',
      correctionRequired: `Fournir le certificat ${cert} en cours de validité ou constituer un groupement avec un partenaire certifié avant l'ouverture des plis.`,
    });
  }
  return { required, traps };
}
