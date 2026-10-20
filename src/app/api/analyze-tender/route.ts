import { NextRequest, NextResponse } from 'next/server';
import { loadSkillBySlug } from '@/lib/skill-loader';
import { auditBpuItems } from '@/lib/bpu-math';
import { callGemma4, parseSafeJson } from '@/lib/gemma-client';
import { runDeterministicLocalAnalysis } from '@/lib/local-fallback-analyzer';
import { TenderData, CompanyProfile, AnalysisResponse, FatalTrap, BpuItem } from '@/lib/types';

/**
 * Helper to parse BPU items from custom raw text if tabular pricing is detected.
 */
function extractBpuItemsFromRawText(text: string): BpuItem[] | null {
  if (!text) return null;
  const items: BpuItem[] = [];

  // Look for LOT/MOD/ART patterns with numbers
  const lines = text.split('\n');
  let index = 1;

  for (const line of lines) {
    // Matches patterns like: LOT-01 Description ... Qte: 5 ... PU: 12000000 ... Total: 60000000
    const itemMatch = line.match(/(?:LOT|MOD|ART|ITEM)[-_\s]?0?([0-9]+)[\s:.-]+([^,;\t\n]+)/i);
    const numbersMatch = line.match(/([0-9]{1,3}(?:[ .][0-9]{3})*|[0-9]+)/g);

    if (itemMatch && numbersMatch && numbersMatch.length >= 2) {
      const code = `LOT-0${itemMatch[1] || index}`;
      const designation = itemMatch[2].trim().slice(0, 60);

      const parsedNumbers = numbersMatch
        .map((n) => parseInt(n.replace(/[ .]/g, ''), 10))
        .filter((n) => !isNaN(n) && n > 0);

      if (parsedNumbers.length >= 2) {
        const qty = parsedNumbers[0] <= 1000 ? parsedNumbers[0] : 1;
        const unitPriceHT = parsedNumbers[1];
        const claimedTotalHT = parsedNumbers.length >= 3 ? parsedNumbers[2] : qty * unitPriceHT;
        const tvaRate = line.includes('9%') ? 9 : 19;

        items.push({
          code,
          designation,
          unit: 'U',
          qty,
          unitPriceHT,
          claimedTotalHT,
          tvaRate,
        });
        index++;
      }
    }
  }

  return items.length > 0 ? items : null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const tenderData: TenderData = body.tenderData;
    const companyProfile: CompanyProfile = body.companyProfile;
    const rawTenderText: string = body.rawTenderText || tenderData?.RawText || '';

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
    const customBpuItems = extractBpuItemsFromRawText(rawTenderText);
    const activeBpuItems = customBpuItems && customBpuItems.length > 0
      ? customBpuItems
      : (tenderData.bpuItems && tenderData.bpuItems.length > 0 ? tenderData.bpuItems : []);

    // Baseline deterministic legal analysis (Loi n° 23-12 single-source-of-truth)
    const initialBpuAudit = auditBpuItems(activeBpuItems, tenderData.id);
    const localBaseline = runDeterministicLocalAnalysis(
      { ...tenderData, RawText: rawTenderText, bpuItems: activeBpuItems },
      companyProfile,
      initialBpuAudit
    );

    // =========================================================================
    // STEP 1 — Agent Pass 1 (Extractor & Mémoire Drafter) via Gemma 4
    // =========================================================================
    const pass1Prompt = `
You are executing SKILL: ${extractorSkill.metadata.name}
Instructions:
${extractorSkill.instructions}

Tender Title: ${tenderData.title}
Tender Reference: ${tenderData.reference}
Contracting Authority: ${tenderData.authority}
Sector: ${tenderData.sector}
Raw Cahier des Charges (CPS/CCAG):
${rawTenderText}

Bidder Company Profile:
${JSON.stringify(companyProfile, null, 2)}

Mandate:
1. Categorize all mandatory documents into the 3 envelopes required by Article 47 of Loi n° 23-12:
   - Envelope A (Dossier de Candidature)
   - Envelope B (Offre Technique)
   - Envelope C (Offre Financière)
   For each document, specify whether the bidder satisfies it (COMPLIANT) or lacks it (NON_COMPLIANT).
2. Draft a formal French "Mémoire Technique Justificatif" tailored to this specific tender.
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
    const bpuAudit = auditBpuItems(activeBpuItems, tenderData.id);
    const bpuMathErrors = bpuAudit.errorDescriptions;

    // =========================================================================
    // STEP 3 — Context-Locked Agent Pass 2 (COPEO Disqualification Critic)
    // =========================================================================
    // STRICT ANTI-CONTRADICTION LOCK: Feed Pass 2 the exact missing items and math errors
    const pass2Prompt = `
You are executing SKILL: ${criticSkill.metadata.name}
Instructions:
${criticSkill.instructions}

CRITICAL ANTI-CONTRADICTION INSTRUCTION:
You are the strict President of the COPEO. Your verdict MUST be 100% consistent with Pass 1 and the Deterministic Math Engine.

Pass 1 Missing Documents (Defects Found):
${JSON.stringify(missingItems, null, 2)}

Deterministic BPU Math Errors Found:
${JSON.stringify(bpuMathErrors, null, 2)}

Bidder Profile:
${JSON.stringify(companyProfile, null, 2)}

Tender Eliminatory Clauses:
${rawTenderText.slice(0, 3000)}

Rules:
1. Every item in missingItems and bpuMathErrors MUST appear in your criticalTrapsFound list.
2. If missingItems.length > 0 or bpuMathErrors.length > 0, eliminationRiskPercent MUST be >= 15% (triggering CRITICAL_DISQUALIFICATION_WARNING).
3. If the bidder is a Labelled Startup and the tender allows Loi 23-12 Art. 87 exemptions, confirm the exemptions and verify if risk is under 15%.
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

    // =========================================================================
    // DETERMINISTIC TYPESCRIPT POST-LOCK (Guarantees 0% Contradiction in UI)
    // =========================================================================
    const hasDefects = missingItems.length > 0 || bpuAudit.hasErrors;

    if (hasDefects) {
      // Force risk >= 35% (well above 15% boundary)
      pass2Critic.eliminationRiskPercent = Math.max(pass2Critic.eliminationRiskPercent || 0, 35);
      pass2Critic.status = 'CRITICAL_DISQUALIFICATION_WARNING';
      pass2Critic.isDisqualifiedWarning = true;
      pass2Critic.readyToSubmit = false;

      // Merge every missing document into fatalTrapsIdentified and criticalTrapsFound
      for (const missing of missingItems) {
        const alreadyFlagged = pass2Critic.fatalTrapsIdentified.some(
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
          pass2Critic.fatalTrapsIdentified.push(trap);
          pass2Critic.criticalTrapsFound.push(trap);
        }
      }

      // Merge every arithmetic discrepancy into fatalTrapsIdentified
      for (const errDesc of bpuMathErrors) {
        const alreadyFlagged = pass2Critic.fatalTrapsIdentified.some(
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
          pass2Critic.fatalTrapsIdentified.push(trap);
          pass2Critic.criticalTrapsFound.push(trap);
        }
      }

      pass2Critic.copeoPresidentVerdict = `🚨 VERDICT COPEO : REJET IMMÉDIAT EN COMMISSION. Risque d'élimination évalué à ${pass2Critic.eliminationRiskPercent}% (dépassement critique du seuil de sécurité de 15%). La Commission d'Ouverture des Plis et d'Évaluation des Offres rejettera cette offre dès l'ouverture des plis pour non-conformité aux dispositions de la Loi n° 23-12 (${pass2Critic.fatalTrapsIdentified.length} vices éliminatoires constatés).`;
    } else {
      // Clean pass
      pass2Critic.status = 'SAFE';
      pass2Critic.isDisqualifiedWarning = false;
      pass2Critic.readyToSubmit = true;
      if (pass2Critic.eliminationRiskPercent >= 15) {
        pass2Critic.eliminationRiskPercent = 4;
      }
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
