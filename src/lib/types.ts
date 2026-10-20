export type EnvelopeKey = 'ENVELOPE_A' | 'ENVELOPE_B' | 'ENVELOPE_C';

export interface BpuItem {
  code: string;
  designation: string;
  unit: string;
  qty: number;
  unitPriceHT: number;
  claimedTotalHT: number;
  tvaRate: number; // 19 or 9
}

export interface BpuAuditLine {
  code: string;
  designation: string;
  unit: string;
  qty: number;
  unitPriceHT: number;
  claimedTotalHT: number;
  computedTotalHT: number;
  discrepancyHT: number;
  hasDiscrepancy: boolean;
  tvaRate: number;
  computedTVA: number;
  computedTTC: number;
  notes?: string;
}

export interface BpuAuditSummary {
  lines: BpuAuditLine[];
  claimedGrandTotalHT: number;
  computedGrandTotalHT: number;
  grandDiscrepancyHT: number;
  totalTva9HT: number;
  totalTva9Amount: number;
  totalTva19HT: number;
  totalTva19Amount: number;
  totalTVA: number;
  grandTotalTTC: number;
  hasErrors: boolean;
  criticalErrorsCount: number;
  errorDescriptions: string[];
}

export interface CompanyProfile {
  id: string;
  name: string;
  type: string;
  wilaya: string;
  rc: string;
  nif: string;
  nis: string;
  yearsActive: number;
  avgAnnualTurnoverDZD: number;
  certifications: string[];
  cnasCasnosUpdated: boolean;
  extraitDeRoleStatus: string;
  cacobatphUpdated: boolean;
  startupLabel?: string | null;
  engineersCount: number;
  keyEquipment: string[];
}

export interface TenderData {
  id: string;
  reference: string;
  title: string;
  authority: string;
  sector: string;
  RawText: string;
  bpuItems: BpuItem[];
}

export interface EnvelopeCheckItem {
  id: string;
  label: string;
  legalReference: string;
  required: boolean;
  isEliminatory: boolean;
  status: 'COMPLIANT' | 'NON_COMPLIANT' | 'EXEMPTED_BY_LAW' | 'WARNING';
  details: string;
}

export interface EnvelopeData {
  envelopeKey: EnvelopeKey;
  title: string;
  subtitle: string;
  legalBasis: string;
  items: EnvelopeCheckItem[];
  complianceScore: number; // 0 - 100
}

export interface Pass1Result {
  tenderReference: string;
  tenderTitle: string;
  contractingAuthority: string;
  envelopes: {
    envelopeA: EnvelopeData;
    envelopeB: EnvelopeData;
    envelopeC: EnvelopeData;
  };
  technicalRubric: {
    minEliminatoryScore: string;
    totalPossibleScore: string;
    criteriaSummary: string[];
  };
  memoireTechnique: {
    title: string;
    introduction: string;
    companyPresentation: string;
    humanResourcesMethodology: string;
    materialAndTechnicalExecution: string;
    timelineAndQualityCommitment: string;
    conclusion: string;
    fullMarkdown: string;
  };
  extractedBpuItems?: BpuItem[];
  eliminatoryClauses?: string[];
}

export interface FatalTrap {
  trapId: string;
  severity: 'FATAL' | 'HIGH' | 'MEDIUM';
  cause: string;
  legalBasis: string;
  correctionRequired: string;
}

export interface Pass2Critic {
  status: 'SAFE' | 'WARNING' | 'CRITICAL_DISQUALIFICATION_WARNING';
  isDisqualifiedWarning: boolean;
  eliminationRiskPercent: number; // 0 - 100
  safetyThreshold: number; // 15%
  fatalTrapsIdentified: FatalTrap[];
  criticalTrapsFound: FatalTrap[];
  regulatoryExemptionsApplied: {
    exemptionTitle: string;
    legalBasis: string;
    impact: string;
  }[];
  copeoPresidentVerdict: string;
  readyToSubmit: boolean;
}

export interface AnalysisResponse {
  pass1Result: Pass1Result;
  pass2Critic: Pass2Critic;
  bpuAudit: BpuAuditSummary;
  thoughtTrace: string;
  activeSkillsUsed: {
    name: string;
    version: string;
    description: string;
  }[];
  modelUsed: string;
  executionMode: 'GOOGLE_AI_STUDIO' | 'OPENROUTER_FALLBACK' | 'LOCAL_DETERMINISTIC_FALLBACK';
  timestamp: string;
}
