import { NextResponse } from 'next/server';
import { gemmaClient } from '@/lib/gemma-client';
import { BpuMathEngine, BpuAuditResult, formatDZD } from '@/lib/bpu-math';
import { AuditEngine, ExtractedTenderData } from '@/lib/audit-engine';
import { AuditResult } from '@/lib/types';
import { skillLoader } from '@/lib/skill-loader';

/**
 * Deterministic French Markdown Mémoire Technique Justificatif generator (<1ms).
 * Used when offline/rate-limited or as a fallback so raw JSON is never rendered in the UI.
 */
function buildDeterministicMemoire(
  extractedData: any,
  companyProfile: any,
  auditInput: ExtractedTenderData,
  legalAudit: AuditResult,
  bpuAudit: BpuAuditResult
): string {
  const bidderName = companyProfile?.name || companyProfile?.companyName || 'Entreprise Soumissionnaire';
  const bidderType = companyProfile?.type || 'SARL';
  const findingsMd =
    legalAudit.findings.length === 0
      ? '- **Aucune anomalie éliminatoire détectée.** Le dossier de candidature et l’offre technique respectent les prescriptions de la Loi n° 23-12.'
      : legalAudit.findings
          .map(
            (f) =>
              `- **[${f.level}] ${f.id}** — ${f.message}\n  - *Référence légale :* ${f.legalBasis}\n  - *Action corrective requise :* ${f.correctiveAction}`
          )
          .join('\n');

  const bpuRowsMd =
    bpuAudit.rows && bpuAudit.rows.length > 0
      ? [
          '| Code | Désignation | Qté | P.U HT | Total Déclaré HT | Total Recalculé HT | Statut |',
          '| :--- | :--- | :---: | ---: | ---: | ---: | :---: |',
          ...bpuAudit.rows.map(
            (r) =>
              `| ${r.code} | ${r.designation} | ${r.qty} | ${formatDZD(r.unitPriceHT)} | ${formatDZD(r.claimedTotalHT)} | ${formatDZD(r.computedTotalHT)} | ${r.isError ? 'ERREUR' : 'CONFORME'} |`
          ),
        ].join('\n')
      : '_Aucun tableau BPU détaillé détecté dans le texte extrait._';

  return [
    `# MÉMOIRE TECHNIQUE JUSTIFICATIF`,
    `**Objet du Marché :** ${extractedData.tenderTitle || 'Cahier des Charges'}`,
    `**Référence :** ${extractedData.tenderReference || 'N/A'}`,
    `**Autorité Contractante :** ${extractedData.issuingAuthority || 'Commission des Marchés Publics'}`,
    `**Soumissionnaire :** ${bidderName} (${bidderType})`,
    '',
    `## 1. Synthèse de Conformité (Loi n° 23-12)`,
    `- **Verdict de la Commission COPEO :** **${legalAudit.verdict}**`,
    `- **Risque d'Élimination :** **${legalAudit.eliminationRisk}%**`,
    `- **Capacité Financière :** CA Minimal Requis : ${auditInput.requiredTurnover ? formatDZD(auditInput.requiredTurnover) : 'Non spécifié'} | CA Soumissionnaire : ${auditInput.actualTurnover ? formatDZD(auditInput.actualTurnover) : 'Non renseigné'}${auditInput.isStartup ? ' *(Dispensé de bilans — Art. 87 Loi 23-12)*' : ''}`,
    `- **Classification Professionnelle :** Catégorie Requise : ${auditInput.requiredCategory || 'Non spécifiée'} | Catégorie Détenue : ${auditInput.actualCategory || 'Non renseignée'}`,
    `- **Délai d'Exécution :** Plafond CPS : ${auditInput.maxDeadlineDays ?? 'Non spécifié'} jours | Délai Proposé : ${auditInput.proposedDeadlineDays ?? 'Conforme'} jours`,
    '',
    `## 2. Diagnostic Juridique & Clauses Éliminatoires (Art. 47 & Art. 87)`,
    findingsMd,
    '',
    `## 3. Audit Arithmétique du BPU / DQE`,
    `- **Statut Arithmétique :** **${bpuAudit.status}**`,
    `- **Total Général HT Déclaré :** ${formatDZD(bpuAudit.totalHTDeclared)}`,
    `- **Total Général HT Recalculé :** ${formatDZD(bpuAudit.totalHTComputed)} (Écart : ${formatDZD(bpuAudit.globalDiff)})`,
    `- **Total TVA :** ${formatDZD(bpuAudit.totalTVA)} | **Total Général TTC :** ${formatDZD(bpuAudit.totalTTC)}`,
    '',
    bpuRowsMd,
  ].join('\n');
}

/**
 * Deterministic <2ms regex baseline extractor for Algerian Tenders (Loi n° 23-12).
 * Handles both multi-line text and pdf.js single-line flattened pages.
 */
function extractDeterministicBaseline(rawText: string, tenderData?: any) {
  const fullNormalized = BpuMathEngine.normalizePdfText(rawText || '');
  const text = BpuMathEngine.stripBenchmarkCommentary(fullNormalized);

  // 1. Tender Title (multi-line "Objet : ...", stopping cleanly before metadata/section headers)
  const objetMatch = text.match(
    /Objet\s*(?:du\s+march[eéè]|\s*de\s+la\s+consultation|\s*de\s+l['’]appel\s+d['’]offres|\s*du\s+cahier\s+des\s+charges)?\s*:\s*([\s\S]{5,420}?)(?=\r?\n\s*(?:Lot\b|Allotissement\b|Mode\s+de\s+passation\b|Nature\b|Financement\b|Cadre\s+l[eéè]gal\b|R[eéè]f[eéè]rence\b|Ma[îi]tre\s+d['’]ouvrage\b|Autorit[eé]\s+contractante\b|\d+\.\s+[A-ZÉÈÀ]|PARTIE\s+[I1V]|SECTION\s+[I1V\d]|CHAPITRE\b|Article\s+\d)|\s+\d+\.\s+[A-ZÉÈÀ]|\s+SECTION\s+\d|\s+CONFORM[EÉÈ]MENT|\s+Article\s+\d)/i
  );
  const tenderTitle =
    objetMatch?.[1]?.replace(/\s+/g, ' ').trim() ||
    (tenderData?.title && !tenderData.title.startsWith('Cahier des Charges —') ? tenderData.title : null) ||
    'Marché Public (Loi n° 23-12)';

  // 2. Tender Reference (must contain at least one digit, never match "malies" or "23-12")
  const isValidRefCandidate = (cand: string): boolean => {
    const c = cand.trim();
    if (c.length < 4 || !/\d/.test(c)) return false;
    if (/^(?:23-12|15-247|18-07|95-07|25-0841|2026|9001|14001|27001|45001)$/i.test(c)) return false;
    return true;
  };

  let tenderReference: string | null = null;
  const explicitRefPatterns = [
    /R[eéè]f[eéè]rence(?:\s+du\s+march[eéè]|\s+de\s+l['’]appel\s+d['’]offres|\s+du\s+dossier)?\s*[:|-]\s*([A-Z0-9][A-Z0-9\/._-]{3,45})/i,
    /\b(?:AON|AONO|AONI|AO|CONSULTATION|BAOSEM|BOMOP|APPEL\s+D['’]OFFRES[^\nN°]{0,45}?)\s+\bN\s*[°o]\s*:?\s*([A-Z0-9][A-Z0-9\/._-]{3,45})/i,
  ];
  for (const pat of explicitRefPatterns) {
    const mRef = text.match(pat);
    if (mRef?.[1] && isValidRefCandidate(mRef[1])) {
      tenderReference = mRef[1].trim();
      break;
    }
  }
  if (!tenderReference) {
    const genericRefRe = /\bN\s*°\s*:?\s*([A-Z0-9][A-Z0-9\/._-]{3,45})/gi;
    let gMatch: RegExpExecArray | null;
    while ((gMatch = genericRefRe.exec(text)) !== null) {
      const candidate = gMatch[1].trim();
      const prefix = text.slice(Math.max(0, gMatch.index - 40), gMatch.index);
      if (
        !isValidRefCandidate(candidate) ||
        /\b(?:Loi|D[eéè]cret|Arr[êe]t[eé]|Ordonnance|Label|Agr[eéè]ment|Certificat)\b/i.test(prefix)
      ) {
        continue;
      }
      tenderReference = candidate;
      break;
    }
  }
  if (!tenderReference) {
    tenderReference =
      (tenderData?.reference && !tenderData.reference.startsWith('DOC-') ? tenderData.reference : null) ||
      'REF-N/A';
  }

  // 3. Issuing Authority (explicit "Maître d'ouvrage :" first, then clean header lines)
  let issuingAuthority =
    tenderData?.authority &&
    tenderData.authority !== 'Commission des Marchés Publics' &&
    tenderData.authority !== "Maître d'Ouvrage"
      ? tenderData.authority
      : null;

  if (!issuingAuthority) {
    const moMatch = text.match(/Ma[îi]tre\s+d['’]ouvrage\s*[:|]?\s*([^\r\n]+)/i);
    if (
      moMatch &&
      moMatch[1].trim().length > 3 &&
      !/^(?:le\s+client|l['’]autorit[eé]\s+contractante)$/i.test(moMatch[1].trim())
    ) {
      issuingAuthority = moMatch[1].trim();
    }
  }

  if (!issuingAuthority) {
    const headerCutoff = text.search(/AVIS\s+D['’]APPEL\s+D['’]OFFRES|CAHIER\s+DES\s+CHARGES/i);
    const headerSlice = (headerCutoff > 0 ? text.slice(0, headerCutoff) : text.slice(0, 600))
      .replace(/---\s*Page\s+\d+\s*---/gi, '\n')
      .replace(/DOCUMENT\s+FICTIF[^\n]*/gi, '\n')
      .replace(/R[EÉÈ]PUBLIQUE\s+ALG[EÉÈ]RIENNE\s+D[EÉÈ]MOCRATIQUE\s+ET\s+POPULAIRE/gi, '\n');

    const headerLines = headerSlice
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(
        (l) =>
          l.length > 4 &&
          l.length < 140 &&
          !/^---/.test(l) &&
          !/AON\s+N[°o]|Dossier\s+d['’]appel\s+d['’]offres|Page\s+\d+|DOCUMENT\s+FICTIF|AUCUNE\s+VALEUR/i.test(l)
      );

    if (headerLines.length > 0) {
      issuingAuthority = headerLines.slice(0, 2).join(' — ');
    }
  }

  // 4. Required Certifications (ISO 9001, ISO 14001, ISO 27001, ISO 45001, CISSP, CEH, MAF)
  const certs = new Set<string>();
  const isoRe = /\bISO(?:\s*\/\s*IEC)?\s*[-:]?\s*(\d{4,5})(?::\d{4})?\b/gi;
  let m: RegExpExecArray | null;
  while ((m = isoRe.exec(text)) !== null) {
    certs.add(`ISO ${m[1]}`);
  }
  if (/\bCISSP\b/i.test(text)) certs.add('CISSP');
  if (/\bCEH\b|Certified\s+Ethical\s+Hacker/i.test(text)) certs.add('CEH');
  if (/\bMAF\b|agr[eéè]ment\s+(?:de\s+)?mat[eéè]riel/i.test(text)) certs.add('MAF');

  // 5. Required Professional Category (e.g. "Catégorie IV" required vs "Catégorie III" submitted)
  const catRanks: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5 };
  let requiredCategory: string | null = null;
  let embeddedActualCategory: string | null = null;

  const submissionSplitIdx = text.search(
    /Enveloppe\s+A\s+Soumise|Dossier\s+de\s+Candidature\s+Soumis|PROFIL\s+DU\s+SOUMISSIONNAIRE|OFFRE\s+DU\s+SOUMISSIONNAIRE/i
  );
  const cdcText = submissionSplitIdx > 0 ? text.slice(0, submissionSplitIdx) : text;
  const subText = submissionSplitIdx > 0 ? text.slice(submissionSplitIdx) : '';

  const catRe = /\bcat[eéè]gorie\b[^.\r\n:;]{0,40}?(?:[:=\s]\s*|\b)(V|IV|III|II|I)\b/gi;
  let cMatch: RegExpExecArray | null;
  while ((cMatch = catRe.exec(cdcText)) !== null) {
    const roman = cMatch[1].toUpperCase();
    const context = cdcText.slice(Math.max(0, cMatch.index - 50), cMatch.index + cMatch[0].length + 40);
    if (/\b(?:soumissionnaire\s+d[eé]tient|fourni\s*:|soumis\s*:|d[eé]tenue\s*:)/i.test(context)) {
      embeddedActualCategory = roman;
      continue;
    }
    if (!requiredCategory || (catRanks[roman] || 0) > (catRanks[requiredCategory] || 0)) {
      requiredCategory = roman;
    }
  }
  if (subText) {
    const subCatMatch = subText.match(
      /\bcat[eéè]gorie\b[^.\r\n:;]{0,40}?(?:[:=\s]\s*|\b)(V|IV|III|II|I)\b/i
    );
    if (subCatMatch?.[1]) {
      embeddedActualCategory = subCatMatch[1].toUpperCase();
    }
  }

  // 6. Required Turnover (e.g., "200 Millions DA", ">= 80 000 000 DA", "150 Millions DA")
  let requiredTurnover: number | null = null;
  const caRe =
    /(?:chiffre\s+d['’]affaires|\bC\.?A\.?\b)[^.\n]{0,140}?(\d[\d\s.,]*\d|\d+)\s*(milliards?|mds?|millions?|m\s*da\b|mda\b|da\b|dzd\b)/gi;
  let caMatch: RegExpExecArray | null;
  while ((caMatch = caRe.exec(text)) !== null) {
    const rawAmt = BpuMathEngine.cleanNum(caMatch[1]);
    const unit = caMatch[2].toLowerCase();
    let val = rawAmt;
    if (/milliard|mds/.test(unit)) val = rawAmt * 1_000_000_000;
    else if (/million|mda|m\s*da/.test(unit)) val = rawAmt * 1_000_000;
    if (val >= 100_000 && (requiredTurnover === null || val > requiredTurnover)) {
      requiredTurnover = val;
    }
  }

  // 7. Max Deadline Days & Embedded Proposed Deadline Days
  let maxDeadlineDays: number | null = null;
  const deadlineMatch = text.match(
    /d[eéè]lai\s+(?:d['’]ex[eéè]cution|de\s+livraison|global|maximal|contractuel|imparti)[^.\n]{0,70}?(\d{1,4})\s*(jours?|mois)/i
  );
  if (deadlineMatch) {
    const num = parseInt(deadlineMatch[1], 10);
    maxDeadlineDays = /mois/i.test(deadlineMatch[2]) ? num * 30 : num;
  }

  let proposedDeadlineDays: number | null = null;
  const propDeadlineMatch = text.match(
    /(?:d[eéè]lai\s+propos[eéè]|dur[eéè]e\s+(?:totale\s+)?propos[eéè]e|planning\s+(?:propos[eéè]|soumis|d['’]ex[eéè]cution\s+propos[eéè])|calendrier\s+propos[eéè]|offre\s+du\s+soumissionnaire[^.\n]{0,40}?d[eéè]lai)[^.\n]{0,70}?(\d{1,4})\s*(jours?|mois)/i
  );
  if (propDeadlineMatch) {
    const num = parseInt(propDeadlineMatch[1], 10);
    proposedDeadlineDays = /mois/i.test(propDeadlineMatch[2]) ? num * 30 : num;
  }

  // 8. Envelope B Text (Technical Offer / Enveloppe B content & any financial leak in Envelope B)
  let envelopeBText = '';
  const envBSectionMatch = text.match(
    /(?:ENVELOPPE\s+B(?:\s+SOUMISE)?\b|2\s*[\).]\s*OFFRE\s+TECHNIQUE|OFFRE\s+TECHNIQUE\s+SOUMISE|DOSSIER\s+TECHNIQUE\s+SOUMIS|EXTRAIT\s+DE\s+L['’]OFFRE\s+TECHNIQUE|M[EÉÈ]MOIRE\s+TECHNIQUE\s+DU\s+SOUMISSIONNAIRE)([\s\S]{10,3500}?)(?=(?:ENVELOPPE\s+C\b|Tableau\s+Combin[eéè]\s+BPU|3\s*[\).]\s*OFFRE\s+FINANCI[EÈ]RE|OFFRE\s+FINANCI[EÈ]RE|BORDEREAU\s+DES\s+PRIX|D[EÉÈ]TAIL\s+QUANTITATIF|ANNEXE\s+\d|$))/i
  );
  if (envBSectionMatch?.[1]) {
    envelopeBText = envBSectionMatch[1].trim();
  }
  const explicitLeakMatch = text.match(
    /[^\r\n]*(?:enveloppe\s+B|offre\s+technique|m[eéè]moire\s+technique)[^\r\n]{0,160}?\b\d[\d\s.,]{2,}\s*(?:millions?|milliards?|M|Mrd)?\s*(?:DA|DZD|Dinars?)\b[^\r\n]*/i
  );
  if (explicitLeakMatch?.[0] && !envelopeBText.includes(explicitLeakMatch[0])) {
    envelopeBText = `${envelopeBText}\n${explicitLeakMatch[0]}`.trim();
  }

  // 9. Declared Total HT
  const declaredTotalHT = BpuMathEngine.extractDeclaredTotalHT(text);

  return {
    tenderTitle,
    tenderReference,
    issuingAuthority: issuingAuthority || 'Commission des Marchés Publics',
    requiredTurnover,
    requiredCategory,
    embeddedActualCategory,
    requiredCertifications: Array.from(certs),
    maxDeadlineDays,
    proposedDeadlineDays,
    declaredTotalHT,
    envelopeBText,
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { companyProfile, tenderData } = body;
    const rawInputText =
      body.rawTenderText ||
      body.rawText ||
      body.tenderData?.RawText ||
      body.tenderData?.rawText ||
      '';
    const rawTenderText = BpuMathEngine.normalizePdfText(rawInputText);

    if (!rawTenderText && (!tenderData?.bpuItems || tenderData.bpuItems.length === 0)) {
      return NextResponse.json({ error: 'No tender text provided' }, { status: 400 });
    }

    // Deterministic <2ms baseline extraction
    const baseline = extractDeterministicBaseline(rawTenderText, tenderData);

    // --- PHASE 1: DATA EXTRACTION (The AI as a Clerk) ---
    const extractionPrompt = `
      You are a professional data extractor for Algerian Public Procurement (Loi 23-12).
      Extract data from the text below into a STRICT JSON object.
      
      TEXT TO ANALYZE:
      "${rawTenderText}"

      REQUIRED JSON STRUCTURE:
      {
        "tenderTitle": "string or null",
        "tenderReference": "string or null",
        "issuingAuthority": "string or null",
        "requiredTurnover": number or null,
        "requiredCategory": "string or null",
        "requiredCertifications": ["string", "string"],
        "maxDeadlineDays": number or null,
        "declaredTotalHT": number or null,
        "envelopeBText": "string"
      }

      STRICT RULES:
      1. Return ONLY the JSON object. No markdown, no explanation.
      2. If a value is not found, use null.
    `;

    const aiResponse = await gemmaClient.generate(extractionPrompt);
    const parsed = gemmaClient.parseSafeJson(aiResponse.finalText);

    const isPlaceholderTitle = (t: any) =>
      !t ||
      typeof t !== 'string' ||
      t.includes('Local Fallback') ||
      t.includes('Extraction Failed') ||
      t.startsWith('Cahier des Charges —');

    // Union AI certifications + deterministic regex certifications (Zero Skimming)
    const mergedCerts = Array.from(
      new Set([
        ...baseline.requiredCertifications,
        ...(Array.isArray(parsed?.requiredCertifications) ? parsed.requiredCertifications : []),
      ])
    );

    const resolvedReference =
      parsed?.tenderReference &&
      parsed.tenderReference !== 'N/A' &&
      /\d/.test(String(parsed.tenderReference)) &&
      !/^(?:23-12|15-247|18-07|95-07)$/i.test(String(parsed.tenderReference).trim())
        ? parsed.tenderReference
        : baseline.tenderReference;
    const resolvedAuthority =
      parsed?.issuingAuthority && parsed.issuingAuthority !== 'Unknown'
        ? parsed.issuingAuthority
        : baseline.issuingAuthority;
    const resolvedMaxDeadlineDays =
      typeof parsed?.maxDeadlineDays === 'number' && parsed.maxDeadlineDays > 0
        ? parsed.maxDeadlineDays
        : baseline.maxDeadlineDays;

    const extractedData = {
      tenderTitle: !isPlaceholderTitle(parsed?.tenderTitle) ? parsed.tenderTitle : baseline.tenderTitle,
      tenderReference: resolvedReference,
      reference: resolvedReference,
      issuingAuthority: resolvedAuthority,
      authority: resolvedAuthority,
      requiredTurnover:
        typeof parsed?.requiredTurnover === 'number' && parsed.requiredTurnover > 0
          ? parsed.requiredTurnover
          : baseline.requiredTurnover,
      requiredCategory: parsed?.requiredCategory || baseline.requiredCategory,
      requiredCertifications: mergedCerts,
      maxDeadlineDays: resolvedMaxDeadlineDays,
      maxExecutionDays: resolvedMaxDeadlineDays,
      envelopeBText: parsed?.envelopeBText || baseline.envelopeBText,
      declaredTotalHT:
        typeof parsed?.declaredTotalHT === 'number' && parsed.declaredTotalHT > 0
          ? parsed.declaredTotalHT
          : baseline.declaredTotalHT,
    };

    // --- PHASE 2: DETERMINISTIC AUDIT (The TypeScript Judge) ---
    const bpuAudit = BpuMathEngine.auditBpu(
      rawTenderText,
      Number(body.declaredTotalHT) || extractedData.declaredTotalHT || 0,
      tenderData?.bpuItems
    );

    const extractBidderCategory = (profile: any): string | null => {
      if (typeof profile?.category === 'string' && profile.category.trim()) {
        return profile.category.trim().toUpperCase();
      }
      const certs: string[] = Array.isArray(profile?.certifications) ? profile.certifications : [];
      for (const cert of certs) {
        const match = cert.match(/cat[eéè]gorie\s+(V|IV|III|II|I)\b/i);
        if (match) return match[1].toUpperCase();
      }
      return null;
    };

    const rawTurnover = companyProfile?.avgAnnualTurnoverDZD ?? companyProfile?.annualTurnover ?? null;
    const actualTurnover =
      typeof rawTurnover === 'number' && !Number.isNaN(rawTurnover) ? rawTurnover : null;

    const rawProposedDeadline =
      companyProfile?.proposedDeadlineDays ??
      companyProfile?.proposedDeadline ??
      baseline.proposedDeadlineDays ??
      null;
    const proposedDeadlineDays =
      typeof rawProposedDeadline === 'number' && !Number.isNaN(rawProposedDeadline)
        ? rawProposedDeadline
        : null;

    const combinedEnvelopeBText = [parsed?.envelopeBText, baseline.envelopeBText]
      .filter((s) => typeof s === 'string' && s.trim().length > 0)
      .join('\n');

    const auditInput: ExtractedTenderData = {
      requiredTurnover:
        typeof extractedData.requiredTurnover === 'number' ? extractedData.requiredTurnover : null,
      requiredCategory:
        typeof extractedData.requiredCategory === 'string' ? extractedData.requiredCategory : null,
      requiredCertifications: Array.isArray(extractedData.requiredCertifications)
        ? extractedData.requiredCertifications
        : [],
      maxDeadlineDays:
        typeof extractedData.maxDeadlineDays === 'number' ? extractedData.maxDeadlineDays : null,
      actualTurnover,
      actualCategory: baseline.embeddedActualCategory || extractBidderCategory(companyProfile),
      heldCertifications: Array.isArray(companyProfile?.certifications)
        ? companyProfile.certifications
        : [],
      proposedDeadlineDays,
      envelopeBText: combinedEnvelopeBText,
      isStartup: Boolean(companyProfile?.startupLabel),
    };

    const legalAudit = AuditEngine.performAudit(auditInput, bpuAudit);

    // --- PHASE 3: REPORT GENERATION (Fast Failover & Deterministic Memoire) ---
    const deterministicMemoire = buildDeterministicMemoire(
      extractedData,
      companyProfile,
      auditInput,
      legalAudit,
      bpuAudit
    );

    let finalReportText = deterministicMemoire;
    let finalThoughtTrace = aiResponse.thoughtTrace;
    let finalModelUsed = aiResponse.modelUsed || 'local-deterministic-engine';

    if (aiResponse.provider !== 'LOCAL_DETERMINISTIC_FALLBACK') {
      const reportPrompt = `
      You are the Senior Rapporteur for the COPEO Commission. 
      Based on the following DETERMINISTIC AUDIT results, draft a formal French 'Mémoire Technique Justificatif'.
      
      TENDER DATA:
      - Title: ${extractedData.tenderTitle}
      - Reference: ${extractedData.tenderReference}
      - Authority: ${extractedData.issuingAuthority}
      
      AUDIT VERDICT:
      - Status: ${legalAudit.verdict}
      - Risk Level: ${legalAudit.eliminationRisk}%
      - Findings: ${JSON.stringify(legalAudit.findings)}
      
      BPU STATUS:
      - Status: ${bpuAudit.status}
      - Global Difference: ${bpuAudit.globalDiff} DA
      
      Tenderer Profile: ${companyProfile?.name || 'Soumissionnaire'}
      
      INSTRUCTIONS:
      1. Use formal administrative French.
      2. If the status is REJECTED, be firm and cite the Loi 23-12.
      3. If QUALIFIED, emphasize the strengths.
      4. Structure the report into: Presentation, Understanding of Needs, Methodology, and Conclusion.
    `;

      const finalReport = await gemmaClient.generate(reportPrompt, {
        timeoutMs: 8000,
        fallbackText: deterministicMemoire,
      });

      if (finalReport.finalText && !finalReport.finalText.trim().startsWith('{')) {
        finalReportText = finalReport.finalText;
      }
      finalThoughtTrace = finalReport.thoughtTrace || aiResponse.thoughtTrace;
      finalModelUsed = finalReport.modelUsed || aiResponse.modelUsed || 'gemma-4-26b-a4b-it';
    }

    // --- PHASE 4: UNIFIED RESPONSE ---
    const responsePayload = {
      metadata: {
        title: extractedData.tenderTitle,
        reference: extractedData.tenderReference,
        authority: extractedData.issuingAuthority,
      },
      legalAudit: legalAudit,
      bpuAudit: bpuAudit,
      finalReport: finalReportText,
      memoireTechnique: {
        title: `MÉMOIRE TECHNIQUE JUSTIFICATIF — ${extractedData.tenderTitle}`,
        fullMarkdown: finalReportText,
      },
      thoughtTrace: finalThoughtTrace,
      modelUsed: finalModelUsed,
    };

    return NextResponse.json({
      success: true,
      ...responsePayload,
      data: responsePayload,
    });
  } catch (error: any) {
    console.error('Critical Audit Error:', error);
    return NextResponse.json(
      {
        error: 'Audit Pipeline Failure',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
