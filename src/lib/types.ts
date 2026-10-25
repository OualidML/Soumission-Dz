/**
 * SOUMISSIONAI-DZ: CORE TYPE DEFINITIONS
 * Synchronized with the Deterministic Audit Engine and BPU Math Engine.
 */

export type EnvelopeKey = 'ENVELOPE_A' | 'ENVELOPE_B' | 'ENVELOPE_C';

// --- BPU & FINANCIAL TYPES ---
export interface BpuItem {
  code: string;
  designation: string;
  unit: string;
  qty: number;
  unitPriceHT: number;
  claimedTotalHT: number;
  tvaRate: number; // 19 or 9
}

export interface BpuRow {
  code: string;
  designation: string;
  qty: number;
  unitPriceHT: number;
  claimedTotalHT: number;
  computedTotalHT: number;
  tvaRate: number;
  diff: number;
  isError: boolean;
  isValid?: boolean;
  missingQty?: boolean;
  // Backward/cross-module aliases
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
  // Backward/cross-module aliases
  items?: BpuRow[];
  declaredTotalHT?: number;
  calculatedTotalHT?: number;
  tvaRate?: number;
  tvaAmount?: number;
}

// --- LEGAL & AUDIT TYPES ---
export interface AuditFinding {
  id: string;
  level: 'FATAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  message: string;
  legalBasis: string;
  correctiveAction: string;
  category: 'FINANCIAL' | 'LEGAL' | 'TECHNICAL' | 'ADMINISTRATIVE';
  // Backward/cross-module aliases
  trapId?: string;
  severity?: 'FATAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  cause?: string;
  correctionRequired?: string;
}

export interface AuditResult {
  isQualified: boolean;
  eliminationRisk: number; // 0 - 100
  findings: AuditFinding[];
  verdict: 'QUALIFIED' | 'CRITICAL_DISQUALIFICATION_WARNING' | 'REJECTED';
  // Backward/cross-module aliases
  overallStatus?: 'QUALIFIED' | 'CRITICAL_DISQUALIFICATION_WARNING' | 'REJECTED';
  complianceScore?: number;
  eliminationRiskPercent?: number;
  fatalTraps?: AuditFinding[];
}

// --- PROFILE & TENDER TYPES ---
export interface CompanyProfile {
  id: string;
  name: string;
  companyName?: string;
  type: string;
  legalForm?: string;
  wilaya: string;
  rc: string;
  nif: string;
  nis: string;
  yearsActive: number;
  avgAnnualTurnoverDZD: number;
  annualTurnover?: number;
  category?: string;
  certifications: string[];
  cnasCasnosUpdated: boolean;
  extraitDeRoleStatus: string;
  cacobatphUpdated: boolean;
  startupLabel?: string | null;
  engineersCount: number;
  keyEquipment: string[];
  proposedDeadlineDays?: number;
  proposedDeadline?: number;
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

// --- FINAL API RESPONSE (The Master Contract) ---
export interface AnalysisResponse {
  metadata: {
    title: string;
    reference: string;
    authority: string;
  };
  legalAudit: AuditResult;
  bpuAudit: BpuAuditResult;
  finalReport: string;
  thoughtTrace: string;
  modelUsed: string;
}