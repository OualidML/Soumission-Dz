import { NextRequest, NextResponse } from 'next/server';
import { loadSkillBySlug } from '@/lib/skill-loader';
import { auditBpuItems } from '@/lib/bpu-math';
import { callGemma4 } from '@/lib/gemma-client';
import { runDeterministicLocalAnalysis } from '@/lib/local-fallback-analyzer';
import { TenderData, CompanyProfile, AnalysisResponse } from '@/lib/types';

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

    // Step 1: Pure TypeScript Deterministic BPU Math Engine (Zero Hallucination)
    const bpuAudit = auditBpuItems(tenderData.bpuItems || [], tenderData.id);

    // Baseline deterministic legal analysis (guarantees completeness & Algerian legal accuracy)
    const localBaseline = runDeterministicLocalAnalysis(tenderData, companyProfile, bpuAudit);

    // Step 2: Agent Pass 1 (Extractor & Mémoire Drafter) with Gemma 4
    const pass1Prompt = `
You are executing SKILL: ${extractorSkill.metadata.name}
Instructions:
${extractorSkill.instructions}

Tender Title: ${tenderData.title}
Tender Reference: ${tenderData.reference}
Contracting Authority: ${tenderData.authority}
Sector: ${tenderData.sector}
Raw Cahier des Charges:
${rawTenderText}

Bidder Company Profile:
Name: ${companyProfile.name}
Type: ${companyProfile.type}
Wilaya: ${companyProfile.wilaya}
RC: ${companyProfile.rc} | NIF: ${companyProfile.nif}
Turnover DZD: ${companyProfile.avgAnnualTurnoverDZD}
Certifications: ${companyProfile.certifications.join(', ')}
Startup Label: ${companyProfile.startupLabel || 'None'}
Engineers Count: ${companyProfile.engineersCount}
Equipment: ${companyProfile.keyEquipment.join(', ')}

Perform Pass 1 extraction under Loi n° 23-12 (Article 47 Envelopes A, B, C) and draft a formal French Mémoire Technique Justificatif.
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
      console.warn('[API] Gemma Pass 1 call fell back to local engine:', err.message);
    }

    // Step 3: Agent Pass 2 (COPEO Disqualification Critic - 15% Safety Boundary)
    const pass2Prompt = `
You are executing SKILL: ${criticSkill.metadata.name}
Instructions:
${criticSkill.instructions}

Tender Eliminatory Clauses and Raw Text:
${rawTenderText}

Bidder Profile:
${JSON.stringify(companyProfile, null, 2)}

BPU Arithmetic Discrepancy Status:
${JSON.stringify(bpuAudit, null, 2)}

Mandate: Calculate eliminationRiskPercent (0-100%).
CRITICAL RULE: If eliminationRiskPercent >= 15%, trigger CRITICAL_DISQUALIFICATION_WARNING.
Flag fatal disqualifying traps (such as missing ISO 14001:2015 or BPU arithmetic errors) and acknowledge Startup Law 23-12 Article 87 exemptions.
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
      console.warn('[API] Gemma Pass 2 call fell back to local engine:', err.message);
    }

    // Build assembled Pass 1 result
    const pass1Result = {
      ...localBaseline.pass1Result,
    };
    if (gemmaPass1Text && gemmaPass1Text.length > 200) {
      pass1Result.memoireTechnique.fullMarkdown = gemmaPass1Text;
    }

    // Build assembled Pass 2 critic result
    const pass2Critic = {
      ...localBaseline.pass2Critic,
    };

    // STRICT REQUIREMENT ENFORCEMENT:
    // "In src/app/api/analyze-tender/route.ts, enforce the Pass-2 Critic logic: if eliminationRisk >= 15, set status to CRITICAL_DISQUALIFICATION_WARNING."
    if (pass2Critic.eliminationRiskPercent >= 15) {
      pass2Critic.status = 'CRITICAL_DISQUALIFICATION_WARNING';
      pass2Critic.readyToSubmit = false;
    } else {
      pass2Critic.status = 'SAFE';
      pass2Critic.readyToSubmit = true;
    }

    // Combine thought trace from Gemma 4 CoT
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
