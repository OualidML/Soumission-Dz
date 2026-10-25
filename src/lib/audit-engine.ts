import { BpuAuditResult } from './types';

/**
 * SOUMISSIONAI-DZ: DETERMINISTIC AUDIT ENGINE
 * This module removes all "reasoning" from the LLM and replaces it with 
 * hard-coded legal and mathematical logic.
 */

export type RiskLevel = 'FATAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface AuditFinding {
  id: string;
  level: RiskLevel;
  message: string;
  legalBasis: string;
  correctiveAction: string;
  category: 'FINANCIAL' | 'LEGAL' | 'TECHNICAL' | 'ADMINISTRATIVE';
  trapId?: string;
  severity?: RiskLevel;
  cause?: string;
  correctionRequired?: string;
}

export interface AuditResult {
  isQualified: boolean;
  eliminationRisk: number; // 0 to 100
  findings: AuditFinding[];
  verdict: 'QUALIFIED' | 'CRITICAL_DISQUALIFICATION_WARNING' | 'REJECTED';
  overallStatus?: 'QUALIFIED' | 'CRITICAL_DISQUALIFICATION_WARNING' | 'REJECTED';
  complianceScore?: number;
  eliminationRiskPercent?: number;
  fatalTraps?: AuditFinding[];
}

export interface ExtractedTenderData {
  // Required by the Tender (CDC)
  requiredTurnover: number | null;
  requiredCategory: string | null; // e.g., "IV"
  requiredCertifications: string[]; // e.g., ["ISO 9001", "ISO 27001"]
  maxDeadlineDays: number | null;
  
  // Provided by the Bidder (Profile)
  actualTurnover: number | null;
  actualCategory: string | null; // e.g., "III"
  heldCertifications: string[];
  proposedDeadlineDays: number | null;
  envelopeBText: string; // The raw text of the technical offer
  isStartup?: boolean;
}

// Roman Numeral Mapping for Category Comparison (IV > III > II > I)
const CATEGORY_RANK: Record<string, number> = {
  'I': 1,
  'II': 2,
  'III': 3,
  'IV': 4,
  'V': 5,
};

export class AuditEngine {
  /**
   * The Core Audit Logic
   * This function is deterministic: Same input always equals same output.
   */
  static performAudit(data: ExtractedTenderData, bpuAudit?: BpuAuditResult): AuditResult {
    const findings: AuditFinding[] = [];
    let riskScore = 0;

    // 1. FINANCIAL CAPACITY CHECK (Loi 23-12, with Art. 87 Startup Exemption)
    if (!data.isStartup && typeof data.requiredTurnover === 'number' && typeof data.actualTurnover === 'number') {
      if (data.actualTurnover < data.requiredTurnover) {
        const gap = data.requiredTurnover - data.actualTurnover;
        findings.push({
          id: 'TRAP-FINANCIAL-INSUFFICIENCY',
          level: 'FATAL',
          message: `Insufficient financial capacity: Required ${data.requiredTurnover.toLocaleString()} DA, but found ${data.actualTurnover.toLocaleString()} DA (Gap: ${gap.toLocaleString()} DA).`,
          legalBasis: 'Loi n° 23-12 Art. 39 (Financial Capacities)',
          correctiveAction: 'Form a joint venture (Groupement) to meet the total turnover requirement.',
          category: 'FINANCIAL',
        });
        riskScore += 40;
      }
    }

    // 2. PROFESSIONAL CATEGORY CHECK
    if (data.requiredCategory && data.actualCategory) {
      const cleanReq = data.requiredCategory.replace(/cat[ée]gorie\s*/i, '').trim().toUpperCase();
      const cleanAct = data.actualCategory.replace(/cat[ée]gorie\s*/i, '').trim().toUpperCase();
      const reqRank = CATEGORY_RANK[cleanReq] || 0;
      const actRank = CATEGORY_RANK[cleanAct] || 0;

      if (reqRank > 0 && actRank > 0 && actRank < reqRank) {
        findings.push({
          id: 'TRAP-CATEGORY-INSUFFICIENT',
          level: 'FATAL',
          message: `Insufficient Professional Category: Required Category ${cleanReq} or higher, but bidder holds Category ${cleanAct}.`,
          legalBasis: 'Loi n° 23-12 Art. 39 & CDC Section 1.2',
          correctiveAction: 'Provide a valid Qualification Certificate of Category ' + cleanReq + ' or higher.',
          category: 'LEGAL',
        });
        riskScore += 30;
      }
    }

    // 3. EXHAUSTIVE CERTIFICATION CHECK (Zero Skimming, Normalized Matching)
    const normalizeCert = (s: string) =>
      s.toUpperCase()
        .replace(/\([^)]*\)/g, '')
        .replace(/\/?IEC\b/g, '')
        .replace(/\b(NORME|CERTIFICAT|CERTIFICATION)\b/g, '')
        .replace(/:\s*\d{4}\b/g, '')
        .replace(/[-_/]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    (data.requiredCertifications || []).forEach(cert => {
      if (!cert || !cert.trim()) return;
      const normReq = normalizeCert(cert);
      const isHeld = (data.heldCertifications || []).some(held => {
        const normHeld = normalizeCert(held);
        return normHeld.includes(normReq) || normReq.includes(normHeld);
      });

      if (!isHeld) {
        findings.push({
          id: `TRAP-CERT-${cert.replace(/\s+/g, '_').toUpperCase()}-MISSING`,
          level: 'FATAL',
          message: `Mandatory Certification Missing: ${cert} is required under penalty of elimination.`,
          legalBasis: 'Loi n° 23-12 Art. 47 & CDC Obligations',
          correctiveAction: `Provide a valid ${cert} certificate or a partner certification in a groupement.`,
          category: 'LEGAL',
        });
        riskScore += 20;
      }
    });

    // 4. DEADLINE COMPLIANCE (Surgical Check)
    if (typeof data.maxDeadlineDays === 'number' && typeof data.proposedDeadlineDays === 'number') {
      if (data.proposedDeadlineDays > data.maxDeadlineDays) {
        findings.push({
          id: 'TRAP-DEADLINE-EXCEEDED',
          level: 'FATAL',
          message: `Proposed deadline (${data.proposedDeadlineDays} days) exceeds the contractual maximum of ${data.maxDeadlineDays} days.`,
          legalBasis: 'CCTP Execution Deadline Clause',
          correctiveAction: 'Revise the Gantt chart to ensure total execution is within the legal limit.',
          category: 'TECHNICAL',
        });
        riskScore += 25;
      }
    }

    // 5. ANONYMITY LEAK (The "Financial Leak" in Envelope B)
    // Search for numbers with "DA", "DZD", "Dinars" (either before or after the amount) in the technical offer
    const cleanEnvB = (data.envelopeBText || '').replace(
      /[^.\n]*\b(?:ne\s+doit\s+(?:en\s+aucun\s+cas\s+)?(?:contenir|comporter|mentionner|inclure|faire\s+appara[îi]tre)|aucun(?:e)?\s+(?:indication\s+de\s+)?(?:prix|montant)|sans\s+indication\s+de\s+prix)[^.\n]*/gi,
      ''
    );
    const priceLeakRegex =
      /(?:\b\d[\d\s.,]{2,}\s*(?:millions?|milliards?|M|Mrd)?\s*(?:DA|DZD|Dinars)\b|\b(?:DA|DZD|Dinars)\s*[:=]?\s*\d[\d\s.,]{2,})/i;
    if (priceLeakRegex.test(cleanEnvB)) {
      findings.push({
        id: 'TRAP-ANONYMITY-VIOLATION',
        level: 'FATAL',
        message: `Critical Violation of Financial Anonymity: Financial amounts detected inside Envelope B (Technical Offer).`,
        legalBasis: 'Loi n° 23-12 Art. 47 (Secret de l\'offre financière)',
        correctiveAction: 'Remove all prices, totals, and financial estimates from the Technical Memoir.',
        category: 'LEGAL',
      });
      riskScore += 100; // Immediate rejection
    }

    // 6. BPU ARITHMETIC & PRESENCE INTEGRATION (Loi n° 23-12 Art. 47 & 72)
    if (bpuAudit) {
      const failedRows = (bpuAudit.rows || []).filter(r => r.isError || r.isValid === false);
      if (
        bpuAudit.status === 'DISCREPANCY_DETECTED' ||
        bpuAudit.status === 'ARITHMETIC_ERROR' ||
        failedRows.length > 0
      ) {
        const rowDetails = failedRows.length > 0
          ? ` Failed rows: ${failedRows
              .map((r) =>
                r.missingQty
                  ? `${r.code} (missing Qty — Art. 15, inferred Qty: ${r.qty})`
                  : `${r.code} (diff: ${r.diff.toLocaleString()} DA)`
              )
              .join(', ')}.`
          : '';
        findings.push({
          id: 'TRAP-BPU-ARITHMETIC',
          level: 'FATAL',
          message: `BPU arithmetic discrepancy detected: Declared HT (${bpuAudit.totalHTDeclared.toLocaleString()} DA) vs Computed HT (${bpuAudit.totalHTComputed.toLocaleString()} DA), global diff: ${bpuAudit.globalDiff.toLocaleString()} DA.${rowDetails}`,
          legalBasis: 'Loi n° 23-12 Art. 72',
          correctiveAction: 'Correct all unit price multiplications (Qty × PU HT) and reconcile the BPU/DQE grand total before submission.',
          category: 'FINANCIAL',
        });
        riskScore += 45;
      } else if (bpuAudit.status === 'BPU_DATA_NOT_FOUND') {
        findings.push({
          id: 'TRAP-BPU-MISSING',
          level: 'HIGH',
          message: 'BPU / DQE financial table not found or could not be extracted from the tender document.',
          legalBasis: 'Loi n° 23-12 Art. 47 & 72',
          correctiveAction: 'Ensure the Bordereau des Prix Unitaires (BPU) and Détail Quantitatif et Estimatif (DQE) are properly formatted and included in Envelope C.',
          category: 'FINANCIAL',
        });
        riskScore += 25;
      }
    }

    // FINAL VERDICT CALCULATION
    const finalRisk = Math.min(riskScore, 100);
    let verdict: AuditResult['verdict'] = 'QUALIFIED';

    if (finalRisk >= 15) {
      verdict = 'CRITICAL_DISQUALIFICATION_WARNING';
    }
    if (finalRisk >= 80 || findings.some(f => f.id === 'TRAP-ANONYMITY-VIOLATION')) {
      verdict = 'REJECTED';
    }

    const enrichedFindings: AuditFinding[] = findings.map((f) => ({
      ...f,
      trapId: f.id,
      severity: f.level,
      cause: f.message,
      correctionRequired: f.correctiveAction,
    }));

    return {
      isQualified: finalRisk < 15,
      eliminationRisk: finalRisk,
      findings: enrichedFindings,
      verdict: verdict,
      overallStatus: verdict,
      complianceScore: Math.max(0, 100 - finalRisk),
      eliminationRiskPercent: finalRisk,
      fatalTraps: enrichedFindings,
    };
  }
}
