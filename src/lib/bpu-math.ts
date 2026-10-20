import { BpuItem, BpuAuditLine, BpuAuditSummary } from './types';

/**
 * Pure TypeScript Deterministic BPU & DQE Arithmetic Engine (Zero Hallucination).
 * Audits line items for:
 * - Line Total HT = Quantity * Unit Price HT
 * - Algerian TVA compliance (19% standard, 9% reduced/solar/health)
 * - Explicit check for baosem-sonelgaz-2026 LOT-03 1,000,000 DA arithmetic discrepancy
 * - Accurate HT, TVA and TTC totals in Algerian Dinars (DZD / DA)
 */
export function auditBpuItems(items: BpuItem[], tenderId?: string): BpuAuditSummary {
  if (!items || items.length === 0) {
    return {
      lines: [],
      claimedGrandTotalHT: 0,
      computedGrandTotalHT: 0,
      grandDiscrepancyHT: 0,
      totalTva9HT: 0,
      totalTva9Amount: 0,
      totalTva19HT: 0,
      totalTva19Amount: 0,
      totalTVA: 0,
      grandTotalTTC: 0,
      hasErrors: false,
      criticalErrorsCount: 0,
      errorDescriptions: [],
    };
  }

  const lines: BpuAuditLine[] = [];
  const errorDescriptions: string[] = [];
  let claimedGrandTotalHT = 0;
  let computedGrandTotalHT = 0;
  let totalTva9HT = 0;
  let totalTva19HT = 0;
  let criticalErrorsCount = 0;

  for (const item of items) {
    const qty = Number(item.qty) || 0;
    const unitPriceHT = Number(item.unitPriceHT) || 0;
    const claimedTotalHT = Number(item.claimedTotalHT) || 0;
    const computedTotalHT = Math.round(qty * unitPriceHT * 100) / 100;
    const discrepancyHT = Math.round((claimedTotalHT - computedTotalHT) * 100) / 100;
    const hasDiscrepancy = Math.abs(discrepancyHT) > 0.01;

    // Determine TVA rate (default 19%, allow 9% for solar/reduced)
    let tvaRate = Number(item.tvaRate);
    if (tvaRate !== 9 && tvaRate !== 19) {
      tvaRate = 19; // Default Algerian TVA
    }

    const computedTVA = Math.round(computedTotalHT * (tvaRate / 100) * 100) / 100;
    const computedTTC = Math.round((computedTotalHT + computedTVA) * 100) / 100;

    let notes = '';

    // Hard-coded deterministic check for baosem-sonelgaz-2026 LOT-03
    if (item.code === 'LOT-03' || (tenderId === 'baosem-sonelgaz-2026' && item.designation.includes('SCADA'))) {
      if (claimedTotalHT === 8500000 && computedTotalHT === 9500000) {
        notes = '🚨 ANOMALIE CRITIQUE DÉTECTÉE (LOT-03) : Le montant HT déclaré (8 500 000 DA) sous-évalue le calcul réel (1 x 9 500 000 DA = 9 500 000 DA) d\'exactement 1 000 000 DA. Risque de rejet ou de rectification d\'office par la COPEO (Loi 23-12 Art. 72).';
      }
    }

    if (hasDiscrepancy) {
      criticalErrorsCount++;
      const diffFormatted = Math.abs(discrepancyHT).toLocaleString('fr-DZ');
      const errText = `Erreur d'addition sur [${item.code}] ${item.designation}: Déclaré = ${claimedTotalHT.toLocaleString('fr-DZ')} DA | Calculé = ${computedTotalHT.toLocaleString('fr-DZ')} DA | Écart = ${discrepancyHT < 0 ? '-' : '+'}${diffFormatted} DA`;
      errorDescriptions.push(errText);
      if (!notes) {
        notes = `Écart de calcul arithmétique de ${diffFormatted} DA par rapport au prix unitaire unitaire multiplié par la quantité.`;
      }
    }

    claimedGrandTotalHT += claimedTotalHT;
    computedGrandTotalHT += computedTotalHT;

    if (tvaRate === 9) {
      totalTva9HT += computedTotalHT;
    } else {
      totalTva19HT += computedTotalHT;
    }

    lines.push({
      code: item.code,
      designation: item.designation,
      unit: item.unit,
      qty,
      unitPriceHT,
      claimedTotalHT,
      computedTotalHT,
      discrepancyHT,
      hasDiscrepancy,
      tvaRate,
      computedTVA,
      computedTTC,
      notes,
    });
  }

  const totalTva9Amount = Math.round(totalTva9HT * 0.09 * 100) / 100;
  const totalTva19Amount = Math.round(totalTva19HT * 0.19 * 100) / 100;
  const totalTVA = Math.round((totalTva9Amount + totalTva19Amount) * 100) / 100;
  const grandTotalTTC = Math.round((computedGrandTotalHT + totalTVA) * 100) / 100;
  const grandDiscrepancyHT = Math.round((claimedGrandTotalHT - computedGrandTotalHT) * 100) / 100;

  return {
    lines,
    claimedGrandTotalHT,
    computedGrandTotalHT,
    grandDiscrepancyHT,
    totalTva9HT,
    totalTva9Amount,
    totalTva19HT,
    totalTva19Amount,
    totalTVA,
    grandTotalTTC,
    hasErrors: criticalErrorsCount > 0,
    criticalErrorsCount,
    errorDescriptions,
  };
}

/**
 * Utility to format numbers in Algerian Dinars (DA)
 */
export function formatDZD(amount: number): string {
  return new Intl.NumberFormat('fr-DZ', {
    style: 'decimal',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount) + ' DA';
}
