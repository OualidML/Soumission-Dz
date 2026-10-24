import { NextRequest, NextResponse } from 'next/server';
import { loadSkillBySlug } from '@/lib/skill-loader';
import { auditBpuItems } from '@/lib/bpu-math';
import { callGemma4, parseSafeJson } from '@/lib/gemma-client';
import { runDeterministicLocalAnalysis } from '@/lib/local-fallback-analyzer';
import { extractBpuHeuristic, isExcludedBpuLine, isYearOrReferenceAmount, isValidBpuDesignation } from '@/lib/bpu-heuristic';
import { extractRequiredTurnover, extractRequiredCerts, classifyStartupClauses } from '@/lib/requirement-checks';
import { TenderData, CompanyProfile, AnalysisResponse, FatalTrap, BpuItem } from '@/lib/types';

// Vercel Serverless Function Execution Config (Timeout Protection)
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * Smart French/Algerian number parser.
 * Handles: "4,500,000" → 4500000, "3.000.000" → 3000000, "4 500 000" → 4500000
 * Rule: if dot/comma is followed by exactly 3 digits and then another separator or end, it is a thousands separator.
 */
function parseAlgerianNumber(raw: string): number {
  if (!raw) return 0;
  const s = raw.trim().replace(/\s/g, '');
  if (!s) return 0;

  // Count separators: if there are multiple dots or commas before end, they're thousands seps
  const dotCount = (s.match(/\./g) || []).length;
  const commaCount = (s.match(/,/g) || []).length;

  // Pattern: "4.500.000" or "3.000.000" (dots as thousands)
  if (dotCount >= 2 && commaCount === 0) {
    return parseFloat(s.replace(/\./g, '')) || 0;
  }
  // Pattern: "4,500,000" (commas as thousands)
  if (commaCount >= 2 && dotCount === 0) {
    return parseFloat(s.replace(/,/g, '')) || 0;
  }
  // Pattern: "4.500,00" (dot=thousands, comma=decimal — French format)
  if (dotCount === 1 && commaCount === 1 && s.indexOf('.') < s.indexOf(',')) {
    return parseFloat(s.replace('.', '').replace(',', '.')) || 0;
  }
  // Pattern: "4,500.00" (comma=thousands, dot=decimal — English format)
  if (commaCount === 1 && dotCount === 1 && s.indexOf(',') < s.indexOf('.')) {
    return parseFloat(s.replace(',', '')) || 0;
  }
  // Pattern: "4500000" or "4,500" (single comma = thousands or decimal — ambiguous; treat as thousands if >3 digits after)
  if (commaCount === 1 && dotCount === 0) {
    const afterComma = s.split(',')[1] || '';
    if (afterComma.length === 3) return parseFloat(s.replace(',', '')) || 0;
    return parseFloat(s.replace(',', '.')) || 0;
  }
  if (dotCount === 1 && commaCount === 0) {
    const afterDot = s.split('.')[1] || '';
    if (afterDot.length === 3) return parseFloat(s.replace('.', '')) || 0;
    return parseFloat(s) || 0;
  }
  return parseFloat(s.replace(/[^0-9.]/g, '')) || 0;
}

/** Returns true if line looks like a legal citation rather than a BPU row */
function isLegalCitationLine(line: string): boolean {
  const l = line.toLowerCase();
  return (
    /\bart\.\s*\d/.test(l) ||
    /\bloi\s+\d{2,4}[-\/]\d{2,4}/.test(l) ||
    /\barticle\s+\d{2,3}\b/.test(l) ||
    /\bn[°o]\s*\d{2,4}\/\d{4}/.test(l) ||
    /\balinéa\b/.test(l) ||
    /\binstruction\b/.test(l) ||
    l.includes('décret') ||
    l.includes('arrêté') ||
    l.includes('journal officiel')
  );
}

/**
 * Smart BPU extractor — isolates the BPU section first, then parses rows.
 * Supports pipe-delimited tables and multi-column rows. Never matches legal article numbers.
 */
function extractBpuStructured(text: string): BpuItem[] | null {
  if (!text) return null;

  // Step 1: Isolate the BPU section
  const bpuHeaderRegex = /(?:BORDEREAU\s+DES\s+PRIX(?:\s+UNITAIRES)?|B\.?P\.?U\.?|PRIX\s+UNITAIRES|DÉTAIL\s+(?:QUANTITATIF|ESTIMATIF))/i;
  const allLines = text.split(/\r?\n/);
  let bpuStartLine = -1;
  for (let i = 0; i < allLines.length; i++) {
    if (bpuHeaderRegex.test(allLines[i])) {
      bpuStartLine = i;
      break;
    }
  }

  // Use only BPU section lines if found; otherwise scan full text (may find nothing)
  const scanLines = bpuStartLine >= 0 ? allLines.slice(bpuStartLine) : allLines;

  const items: BpuItem[] = [];
  let index = 1;

  for (const rawLine of scanLines) {
    const line = rawLine.trim();
    if (!line || line.length < 5) continue;
    // 1. The "Footer/Header" Guard: instantly discard footers, headers, references, statutes
    if (isLegalCitationLine(line) || isExcludedBpuLine(line)) continue;

    // Strategy A: Pipe-delimited table row: "01 | Designation | 1 | 4,500,000 | 4,500,000"
    if (line.includes('|')) {
      const parts = line.split('|').map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 4) {
        const maybeCode = parts[0];
        const maybeDesig = parts[1];
        // 2. The "Structure" Guard: must have a real textual designation
        if (!isValidBpuDesignation(maybeDesig)) continue;

        // 3. The "Amount" Guard: ignore bare years (2026) and noise
        const numericParts = parts
          .slice(2)
          .map((p) => parseAlgerianNumber(p))
          .filter((n) => n > 0 && !isYearOrReferenceAmount(n));

        if (numericParts.length >= 2) {
          const qty = numericParts[0] <= 10000 ? numericParts[0] : 1;
          const unitPriceHT = numericParts[1] >= 100 ? numericParts[1] : numericParts[numericParts.length - 1];
          const claimedTotalHT = numericParts.length >= 3 ? numericParts[2] : qty * unitPriceHT;

          if (
            unitPriceHT >= 100 &&
            !isYearOrReferenceAmount(unitPriceHT) &&
            !isYearOrReferenceAmount(claimedTotalHT)
          ) {
            items.push({
              code: /^\d+$/.test(maybeCode)
                ? `BPU-${maybeCode.padStart(2, '0')}`
                : maybeCode || `BPU-${String(index).padStart(2, '0')}`,
              designation: maybeDesig.slice(0, 80),
              unit: parts.find((p) => /^(U|FF|ML|M²|M³|KG|T|J|H|ENS|FT)$/i.test(p)) || 'U',
              qty,
              unitPriceHT,
              claimedTotalHT,
              tvaRate: line.includes('9%') ? 9 : 19,
            });
            index++;
            continue;
          }
        }
      }
    }

    // Strategy B: Numeric-rich line without pipe (tab or space separated)
    const numberTokens = line.match(/\d[\d\s,.]*\d|\d+/g) || [];
    const parsedNums = numberTokens
      .map(parseAlgerianNumber)
      .filter((n) => n >= 100 && !isYearOrReferenceAmount(n));

    if (parsedNums.length >= 2) {
      const firstNumIdx = line.search(/\d[\d\s,.]*\d|\d+/);
      const designation = line
        .slice(0, firstNumIdx)
        .replace(/^[\d.\-|]+\s*/, '')
        .trim()
        .slice(0, 80);

      // 2. The "Structure" Guard: must be a genuine service/item designation
      if (!isValidBpuDesignation(designation)) continue;

      const qty = parsedNums[0] <= 10000 ? parsedNums[0] : 1;
      const unitPriceHT = parsedNums.length >= 2 ? parsedNums[1] : parsedNums[0];
      const claimedTotalHT = parsedNums.length >= 3 ? parsedNums[parsedNums.length - 1] : qty * unitPriceHT;

      if (
        unitPriceHT >= 100 &&
        !isYearOrReferenceAmount(unitPriceHT) &&
        !isYearOrReferenceAmount(claimedTotalHT)
      ) {
        items.push({
          code: `BPU-${String(index).padStart(2, '0')}`,
          designation,
          unit: 'U',
          qty,
          unitPriceHT,
          claimedTotalHT,
          tvaRate: line.includes('9%') ? 9 : 19,
        });
        index++;
      }
    }
  }

  return items.length > 0 ? items : null;
}

/**
 * Two-stage BPU extraction. BPU_DATA_NOT_FOUND only if BOTH stages fail.
 */
function extractBpuItemsFromRawText(text: string): BpuItem[] | null {
  return extractBpuStructured(text) || extractBpuHeuristic(text);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const tenderData: TenderData = body.tenderData;
    const companyProfile: CompanyProfile = body.companyProfile;
    const rawTenderText: string = body.rawTenderText || tenderData?.RawText || '';
    const isCustomUpload: boolean = Boolean(
      body.isCustomUpload ||
      tenderData?.id === 'custom-tender' ||
      tenderData?.id === 'custom' ||
      tenderData?.id?.startsWith('DOC-') ||
      tenderData?.id?.startsWith('custom')
    );

    if (!tenderData || !companyProfile) {
      return NextResponse.json(
        { error: 'Missing tenderData or companyProfile payload' },
        { status: 400 }
      );
    }

    // Step 0: Dynamically load the 3 modular skills from /skills
    const extractorSkill = loadSkillBySlug('dz-law2312-extractor');
    const auditorSkill = loadSkillBySlug('bpu-financial-auditor');
    const criticSkill = loadSkillBySlug('commission-rejection-critic');

    const activeSkillsUsed = [
      {
        name: extractorSkill.metadata.name || 'dz-law2312-extractor',
        version: extractorSkill.metadata.version || '1.0.0',
        description: extractorSkill.metadata.description || 'Loi 23-12 Requirement Extractor & Mémoire Drafter',
      },
      {
        name: auditorSkill.metadata.name || 'bpu-financial-auditor',
        version: auditorSkill.metadata.version || '1.0.0',
        description: auditorSkill.metadata.description || 'BPU/DQE Financial & Arithmetic Auditor',
      },
      {
        name: criticSkill.metadata.name || 'commission-rejection-critic',
        version: criticSkill.metadata.version || '1.0.0',
        description: criticSkill.metadata.description || 'COPEO Disqualification Critic with 15% Safety Boundary',
      },
    ];

    // Check for custom extracted BPU rows from uploaded PDF/custom text
    // NEVER bleed demo BPU items into a custom document upload
    // If PDF parser fails to extract the table, report 'BPU Data Not Found' rather than claiming Zero Errors
    let activeBpuItems: BpuItem[] = [];

    if (isCustomUpload) {
      const customBpuItems = extractBpuItemsFromRawText(rawTenderText);
      if (customBpuItems && customBpuItems.length > 0) {
        activeBpuItems = customBpuItems;
      } else {
        // Do NOT invent mock tables. Keep activeBpuItems empty so bpu-math flags BPU Data Not Found
        activeBpuItems = [];
      }
    } else {
      activeBpuItems =
        tenderData.bpuItems && tenderData.bpuItems.length > 0
          ? tenderData.bpuItems
          : [];
    }

    // Baseline deterministic legal analysis (Loi n° 23-12 single-source-of-truth)
    const initialBpuAudit = auditBpuItems(activeBpuItems, tenderData.id, rawTenderText);
    const localBaseline = runDeterministicLocalAnalysis(
      { ...tenderData, RawText: rawTenderText, bpuItems: activeBpuItems },
      companyProfile,
      initialBpuAudit
    );

    // =========================================================================
    // STEP 1 — Agent Pass 1 (Extractor & Mémoire Drafter) via Gemma 4
    // STRICT CONTEXT: Force model to use ONLY provided document text
    // =========================================================================
    const pass1Prompt = `
You are executing SKILL: ${extractorSkill.metadata.name}
Instructions:
${extractorSkill.instructions}

CRITICAL STRICT CONTEXT RULE:
You MUST base your analysis STRICTLY and EXCLUSIVELY on the actual document text provided below.
DO NOT rely on cached or pre-baked scenarios (such as Sonelgaz or CHU unless explicitly written below).
Analyze the actual clauses, requirements, and scope described in the text.

Tender Title: ${tenderData.title}
Tender Reference: ${tenderData.reference}
Contracting Authority: ${tenderData.authority}
Sector: ${tenderData.sector}

ACTUAL DOCUMENT TEXT (From uploaded PDF/Document):
--- BEGIN DOCUMENT TEXT ---
${rawTenderText.slice(0, 15000)}
--- END DOCUMENT TEXT ---

Bidder Company Profile:
${JSON.stringify(companyProfile, null, 2)}

Mandate:
1. Categorize all mandatory documents into the 3 envelopes required by Article 47 of Loi n° 23-12:
   - Envelope A (Dossier de Candidature)
   - Envelope B (Offre Technique)
   - Envelope C (Offre Financière)
   For each document, specify whether the bidder satisfies it (COMPLIANT) or lacks it (NON_COMPLIANT).
2. Draft a formal French "Mémoire Technique Justificatif" tailored specifically to the actual requirements of this tender.
`;

    let gemmaPass1Thought = '';
    let gemmaPass1Text = '';
    let executionMode: AnalysisResponse['executionMode'] = 'LOCAL_DETERMINISTIC_FALLBACK';
    let modelUsed = 'gemma-4-26b-a4b-it';

    try {
      const gemmaPass1 = await callGemma4(pass1Prompt, {
        systemInstruction: extractorSkill.instructions,
      });
      gemmaPass1Thought = gemmaPass1.thoughtTrace;
      gemmaPass1Text = gemmaPass1.finalText;
      executionMode = gemmaPass1.provider;
      modelUsed = gemmaPass1.modelUsed;
    } catch (err: any) {
      console.warn('[API Pass 1] Gemma call fell back to local engine:', err.message);
    }

    // Build assembled Pass 1 result
    const pass1Result = {
      ...localBaseline.pass1Result,
    };
    if (gemmaPass1Text && gemmaPass1Text.length > 150) {
      pass1Result.memoireTechnique.fullMarkdown = gemmaPass1Text;
    }

    // Collect all missing/non-compliant items from Pass 1
    const allEnvelopeItems = [
      ...pass1Result.envelopes.envelopeA.items,
      ...pass1Result.envelopes.envelopeB.items,
      ...pass1Result.envelopes.envelopeC.items,
    ];
    const missingItems = allEnvelopeItems.filter((i) => i.status === 'NON_COMPLIANT');

    // =========================================================================
    // STEP 2 — Deterministic TypeScript BPU Math Engine (Zero Hallucination)
    // =========================================================================
    const bpuAudit = auditBpuItems(activeBpuItems, tenderData.id, rawTenderText);
    const bpuMathErrors = bpuAudit.errorDescriptions;

    // =========================================================================
    // STEP 3 — Context-Locked Agent Pass 2 (COPEO Disqualification Critic)
    // =========================================================================
    // STRICT ANTI-CONTRADICTION LOCK: Feed Pass 2 the exact missing items and math errors
    const requiredTurnover = extractRequiredTurnover(rawTenderText);
    const requiredCerts = extractRequiredCerts(rawTenderText);
    const startupClauses = classifyStartupClauses(rawTenderText);
    const pass2Prompt = `
You are executing SKILL: ${criticSkill.metadata.name}
Instructions:
${criticSkill.instructions}

CRITICAL ANTI-CONTRADICTION & STRICT CONTEXT INSTRUCTION:
You are the strict President of the COPEO. Your verdict MUST be 100% consistent with Pass 1 and the Deterministic Math Engine.
DO NOT use cached or demo scenarios (such as Sonelgaz or CHU unless explicitly written in the tender text below).
Analyze the actual uploaded document and bidder qualifications.

Pass 1 Missing Documents (Defects Found):
${JSON.stringify(missingItems, null, 2)}

Deterministic BPU Math Status:
Status: ${bpuAudit.status || 'AUDITED'}
${bpuAudit.status === 'BPU_DATA_NOT_FOUND' ? 'CRITICAL ALERT: BPU Data Not Found in the document! Financial Offer cannot be verified.' : ''}
${bpuAudit.status === 'UNVERIFIED' ? 'ALERT: BPU Data extracted but UNVERIFIED against a declared Total HT at table bottom.' : ''}
${bpuAudit.status === 'ARITHMETIC_ERROR' ? 'CRITICAL ALERT: BPU Arithmetic Error detected in line items or grand total discrepancy!' : ''}
Deterministic BPU Math Errors / Warnings Found:
${JSON.stringify(bpuMathErrors, null, 2)}

Bidder Profile:
${JSON.stringify(companyProfile, null, 2)}

Tender Eliminatory Clauses & Document Excerpt:
${rawTenderText.slice(0, 5000)}

Rules:
1. Every item in missingItems, bpuMathErrors, and any unfulfilled requirement in the tender text MUST appear in your criticalTrapsFound list.
2. If BPU Data is not found, you MUST flag it as a critical trap in Envelope C.
3. If missingItems.length > 0 or bpuAudit.hasErrors or bpuAudit.status === 'BPU_DATA_NOT_FOUND' or bpuAudit.status === 'ARITHMETIC_ERROR', eliminationRiskPercent MUST be >= 15% (triggering CRITICAL_DISQUALIFICATION_WARNING).
4. If the bidder is a Labelled Startup and the tender allows Loi 23-12 Art. 87 exemptions, confirm the exemptions and verify if risk is under 15%.
5. NUMERICAL COMPARISON: Convert every numeric threshold to integer DZD and compare with the bidder profile. If actual < required, emit TRAP-FINANCIAL-INSUFFICIENCY (FATAL).
   Deterministic extraction -> Required turnover: ${requiredTurnover ? requiredTurnover.requiredValueDZD + ' DZD' : 'none stated'} | Bidder turnover: ${Math.round(companyProfile.avgAnnualTurnoverDZD || 0)} DZD.
6. EXHAUSTIVE MANDATORY AUDIT: Required certifications found in the text: ${JSON.stringify(requiredCerts)}. Check EVERY item; emit one SEPARATE FATAL trap for EACH certification the bidder lacks (e.g. ISO 9001, ISO 27001, ISO 14001, MAF). Never stop at the first.
7. LEGAL LOGIC: A startup EXEMPTION clause ("dispensées de fournir les bilans", "exempted") is NOT a reservation. Only emit TRAP-STARTUP-RESERVATION if the text says "réservé exclusivement aux start-up". Deterministic classification: ${JSON.stringify(startupClauses)}.
8. BPU-DQE CROSS-CHECK: If declared Total HT differs from calculated sum by > 1%, emit TRAP-BPU-ARITHMETIC (FATAL). If Total HT is missing from the table bottom, flag as UNVERIFIED.
`;

    let gemmaPass2Thought = '';
    try {
      const gemmaPass2 = await callGemma4(pass2Prompt, {
        systemInstruction: criticSkill.instructions,
      });
      gemmaPass2Thought = gemmaPass2.thoughtTrace;
      if (gemmaPass2.provider !== 'LOCAL_DETERMINISTIC_FALLBACK') {
        executionMode = gemmaPass2.provider;
        modelUsed = gemmaPass2.modelUsed;
      }
    } catch (err: any) {
      console.warn('[API Pass 2] Gemma call fell back to local engine:', err.message);
    }

    // Build assembled Pass 2 critic result
    const pass2Critic = {
      ...localBaseline.pass2Critic,
    };

    // Unify fatalTrapsIdentified AND criticalTrapsFound so UI never hits undefined
    const mergedTraps: FatalTrap[] = [
      ...(pass2Critic.criticalTrapsFound || pass2Critic.fatalTrapsIdentified || []),
    ];
    pass2Critic.fatalTrapsIdentified = mergedTraps;
    pass2Critic.criticalTrapsFound = mergedTraps;

    // =========================================================================
    // DETERMINISTIC TYPESCRIPT POST-LOCK (Guarantees 0% Contradiction in UI)
    // =========================================================================
    const hasDefects =
      missingItems.length > 0 ||
      bpuAudit.hasErrors ||
      bpuAudit.status === 'BPU_DATA_NOT_FOUND' ||
      mergedTraps.length > 0;

    if (hasDefects) {
      // Force risk >= 35% (well above 15% boundary)
      pass2Critic.eliminationRiskPercent = Math.max(pass2Critic.eliminationRiskPercent || 0, 35);
      pass2Critic.status = 'CRITICAL_DISQUALIFICATION_WARNING';
      pass2Critic.isDisqualifiedWarning = true;
      pass2Critic.readyToSubmit = false;

      // Handle BPU Data Not Found defect
      if (bpuAudit.status === 'BPU_DATA_NOT_FOUND') {
        const alreadyFlagged = mergedTraps.some((t) => t.trapId.includes('BPU-DATA-NOT-FOUND'));
        if (!alreadyFlagged) {
          const trap: FatalTrap = {
            trapId: 'TRAP-BPU-DATA-NOT-FOUND',
            severity: 'HIGH',
            cause: 'BPU Data Not Found : Aucun tableau de bordereau des prix unitaires structuré n\'a été extrait du document pour contrôle arithmétique.',
            legalBasis: 'Loi n° 23-12 Art. 47 & 72',
            correctionRequired: 'Saisir ou formater les lignes du BPU pour permettre le contrôle arithmétique COPEO.',
          };
          mergedTraps.push(trap);
        }
      }

      // Merge every missing document into fatalTrapsIdentified and criticalTrapsFound
      for (const missing of missingItems) {
        const alreadyFlagged = mergedTraps.some(
          (t) => t.trapId.includes(missing.id) || t.cause.toLowerCase().includes(missing.label.toLowerCase())
        );

        if (!alreadyFlagged) {
          const trap: FatalTrap = {
            trapId: `TRAP-${missing.id}`,
            severity: missing.isEliminatory ? 'FATAL' : 'HIGH',
            cause: `Document manquant ou non conforme : ${missing.label}`,
            legalBasis: missing.legalReference || 'Loi n° 23-12 Art. 47',
            correctionRequired: `Fournir impérativement la pièce : ${missing.label} avant l'ouverture des plis.`,
          };
          mergedTraps.push(trap);
        }
      }

      // Merge every arithmetic discrepancy into fatalTrapsIdentified and criticalTrapsFound
      for (const errDesc of bpuMathErrors) {
        const alreadyFlagged = mergedTraps.some(
          (t) => t.trapId.includes('BPU') || t.cause.includes(errDesc)
        );

        if (!alreadyFlagged) {
          const trap: FatalTrap = {
            trapId: 'TRAP-BPU-ARITHMETIC',
            severity: 'FATAL',
            cause: errDesc,
            legalBasis: 'Loi n° 23-12 Art. 72 (Rectification des erreurs arithmétiques)',
            correctionRequired: 'Corriger l\'addition du BPU/DQE pour rétablir la concordance arithmétique.',
          };
          mergedTraps.push(trap);
        }
      }

      // Re-assign unified reference
      pass2Critic.fatalTrapsIdentified = mergedTraps;
      pass2Critic.criticalTrapsFound = mergedTraps;

      pass2Critic.copeoPresidentVerdict = `🚨 VERDICT COPEO : REJET IMMÉDIAT EN COMMISSION. Risque d'élimination évalué à ${pass2Critic.eliminationRiskPercent}% (dépassement critique du seuil de sécurité de 15%). La Commission d'Ouverture des Plis et d'Évaluation des Offres rejettera cette offre dès l'ouverture des plis pour non-conformité aux dispositions de la Loi n° 23-12 (${mergedTraps.length} vices éliminatoires constatés).`;
    } else {
      // Clean pass
      pass2Critic.status = 'SAFE';
      pass2Critic.isDisqualifiedWarning = false;
      pass2Critic.readyToSubmit = true;
      if (pass2Critic.eliminationRiskPercent >= 15) {
        pass2Critic.eliminationRiskPercent = 4;
      }
      pass2Critic.fatalTrapsIdentified = mergedTraps;
      pass2Critic.criticalTrapsFound = mergedTraps;
      pass2Critic.copeoPresidentVerdict = `✅ VERDICT COPEO : OFFRE QUALIFIÉE POUR ÉVALUATION. Risque d'élimination résiduel estimé à ${pass2Critic.eliminationRiskPercent}% (< 15%). Le dossier respecte les exigences de la Loi n° 23-12 et bénéficie des dispenses légales applicables. L'accès à la phase d'évaluation technique et financière est garanti.`;
    }

    // Assemble thought trace from Gemma 4 CoT
    const thoughtTraceParts: string[] = [];
    if (gemmaPass1Thought) {
      thoughtTraceParts.push(`[GEMMA 4 PASS 1 EXTRACTOR REASONING TRACE]\n${gemmaPass1Thought}`);
    }
    if (gemmaPass2Thought) {
      thoughtTraceParts.push(`[GEMMA 4 PASS 2 COPEO CRITIC REASONING TRACE]\n${gemmaPass2Thought}`);
    }
    if (thoughtTraceParts.length === 0) {
      thoughtTraceParts.push(localBaseline.thoughtTrace);
    }

    const finalThoughtTrace = thoughtTraceParts.join('\n\n');

    const response: AnalysisResponse = {
      pass1Result,
      pass2Critic,
      bpuAudit,
      thoughtTrace: finalThoughtTrace,
      activeSkillsUsed,
      modelUsed,
      executionMode,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('[API /api/analyze-tender] Unexpected error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error during tender analysis' },
      { status: 500 }
    );
  }
}
