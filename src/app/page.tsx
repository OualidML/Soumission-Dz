'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Cpu,
  FileText,
  Calculator,
  Terminal,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Copy,
  Printer,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Layers,
  Building2,
  FileCode,
  Flame,
  Award,
  BookOpen,
  ArrowRight,
  ExternalLink,
  Info,
} from 'lucide-react';
import demoData from '../../demo-data/algerian-tenders.json';
import { TenderData, CompanyProfile, AnalysisResponse, EnvelopeKey } from '@/lib/types';
import { formatDZD } from '@/lib/bpu-math';
import { DocumentUploader } from '@/components/DocumentUploader';

export default function HomePage() {
  const tenders: TenderData[] = demoData.sampleTenders as any;
  const profiles: CompanyProfile[] = demoData.companyProfiles as any;

  // Selected state
  const [selectedTenderId, setSelectedTenderId] = useState<string>(tenders[0].id);
  const [selectedProfileId, setSelectedProfileId] = useState<string>(profiles[0].id);
  const [customText, setCustomText] = useState<string>('');
  const [isCustomMode, setIsCustomMode] = useState<boolean>(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [inputTab, setInputTab] = useState<'sample' | 'pdf'>('sample');

  // Analysis result & loading state
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [stepMessage, setStepMessage] = useState<string>('');
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // UI tabs & toggles
  const [activeEnvelope, setActiveEnvelope] = useState<'ENVELOPE_A' | 'ENVELOPE_B' | 'ENVELOPE_C'>('ENVELOPE_A');
  const [isTerminalExpanded, setIsTerminalExpanded] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState<boolean>(false);

  // Current objects
  const currentTender = isCustomMode
    ? {
        id: 'custom-tender',
        reference: 'CUSTOM/2026/DZ',
        title: 'Cahier des charges personnalisé (Texte libre)',
        authority: 'Maître d\'Ouvrage Non Spécifié',
        sector: 'Marché Public Personnalisé',
        RawText: customText || 'Cahier des charges...',
        bpuItems: [],
      }
    : tenders.find((t) => t.id === selectedTenderId) || tenders[0];

  const currentProfile = profiles.find((p) => p.id === selectedProfileId) || profiles[0];

  // Auto-run analysis on initial load
  useEffect(() => {
    runAudit(selectedTenderId, selectedProfileId);
  }, []);

  const runAudit = async (tenderIdToUse = selectedTenderId, profileIdToUse = selectedProfileId) => {
    setIsLoading(true);
    setErrorMsg(null);
    setStepMessage('1/4 Chargement des 3 Agents Skills modulaires (SKILL.md)...');

    try {
      const uploadedCustomText = customText;
      const isCustom = inputTab === 'pdf' || isCustomMode || selectedTenderId === 'custom' || selectedTenderId === 'custom-tender' || (!!uploadedCustomText && uploadedCustomText.trim().length > 0);
      const isCustomUpload = isCustom || selectedTenderId === 'custom' || Boolean(uploadedCustomText);

      const activeT = isCustom
        ? {
            id: 'custom-tender',
            reference: uploadedFileName
              ? `DOC-${uploadedFileName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)}/2026`
              : 'CUSTOM/2026/DZ',
            title: uploadedFileName ? `Cahier des Charges — ${uploadedFileName}` : 'Cahier des charges personnalisé',
            authority: 'Commission des Marchés Publics',
            sector: 'Marché Public Personnalisé',
            RawText: uploadedCustomText || 'Cahier des charges soumis à l\'audit...',
            bpuItems: [],
          }
        : tenders.find((t) => t.id === tenderIdToUse) || tenders[0];

      const activeP = profiles.find((p) => p.id === profileIdToUse) || profiles[0];

      // Simulate step progress for user feedback
      setTimeout(() => setStepMessage('2/4 Audit arithmétique déterministe BPU & DQE (DZD)...'), 400);
      setTimeout(() => setStepMessage('3/4 Pass 1: Extraction Enveloppes Loi 23-12 & Mémoire Gemma 4...'), 800);
      setTimeout(() => setStepMessage('4/4 Pass 2: Critique Adversarial COPEO & Règle des 15%...'), 1200);

      const res = await fetch('/api/analyze-tender', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenderData: activeT,
          companyProfile: activeP,
          rawTenderText: activeT.RawText,
          isCustomUpload: selectedTenderId === 'custom' || Boolean(uploadedCustomText) || isCustomUpload,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Erreur serveur HTTP ${res.status}`);
      }

      const data: AnalysisResponse = await res.json();
      setResult(data);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Une erreur est survenue lors de l\'analyse');
    } finally {
      setIsLoading(false);
      setStepMessage('');
    }
  };

  const handleAnalyze = async (tenderIdToUse = selectedTenderId, profileIdToUse = selectedProfileId) => {
    return runAudit(tenderIdToUse, profileIdToUse);
  };

  const copyMemoireToClipboard = () => {
    if (!result?.pass1Result?.memoireTechnique?.fullMarkdown) return;
    navigator.clipboard.writeText(result.pass1Result.memoireTechnique.fullMarkdown);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  };

  const handlePrint = () => {
    window.print();
  };

  // Quick preset triggers
  const setPresetSonelgazAderfp = () => {
    setIsCustomMode(false);
    setInputTab('sample');
    setUploadedFileName(null);
    setCustomText('');
    setSelectedTenderId('baosem-sonelgaz-2026');
    setSelectedProfileId('enterprise-solar-dz');
    runAudit('baosem-sonelgaz-2026', 'enterprise-solar-dz');
  };

  const setPresetChuSolvetech = () => {
    setIsCustomMode(false);
    setInputTab('sample');
    setUploadedFileName(null);
    setCustomText('');
    setSelectedTenderId('bomop-chu-constantine-2026');
    setSelectedProfileId('startup-ai-constantine');
    runAudit('bomop-chu-constantine-2026', 'startup-ai-constantine');
  };

  return (
    <div className="min-h-screen text-slate-100 flex flex-col font-sans">
      {/* TOP HEADER */}
      <header className="border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-cyan-500 to-emerald-500 flex items-center justify-center shadow-cyber-neon">
              <Cpu className="h-6 w-6 text-slate-950 font-bold" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xl font-black tracking-tight text-white">
                  Soumission<span className="text-cyan-400">AI</span><span className="text-emerald-400">-DZ</span>
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono border border-slate-700">
                  v1.0.0
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Système Multi-Agents d&apos;Audit des Cahiers des Charges — <span className="text-slate-300 font-medium">Loi n° 23-12</span> du 5 août 2023
              </p>
            </div>
          </div>

          {/* STATUS BADGES */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-cyan-950/60 border border-cyan-800/60 text-cyan-300">
              <span className="h-2 w-2 rounded-full bg-cyan-400 neon-pulse"></span>
              <span className="font-semibold">Gemma 4 26B-A4B MoE</span>
              <span className="text-cyan-400/80">Active</span>
            </div>

            <div className="flex items-center space-x-1 px-2.5 py-1 rounded-md bg-emerald-950/60 border border-emerald-800/60 text-emerald-300">
              <Award className="h-3.5 w-3.5" />
              <span>Apache-2.0</span>
              <span className="text-emerald-400/80">Open Source</span>
            </div>

            <div className="flex items-center space-x-1 px-2.5 py-1 rounded-md bg-slate-800/80 border border-slate-700 text-slate-300">
              <Layers className="h-3.5 w-3.5 text-amber-400" />
              <span>3 Modular</span>
              <span className="text-amber-400">SKILL.md</span>
            </div>
          </div>
        </div>
      </header>

      {/* QUICK PRESETS BANNER */}
      <div className="bg-slate-900/60 border-b border-slate-800/60 px-4 py-2">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center space-x-2 text-slate-400">
            <Sparkles className="h-4 w-4 text-cyan-400" />
            <span className="font-medium text-slate-300">Scénarios Démo 1-Click (Évaluation Jury) :</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={setPresetSonelgazAderfp}
              className="px-3 py-1 rounded bg-red-950/50 hover:bg-red-900/60 text-red-300 border border-red-800/70 transition-colors flex items-center space-x-1.5"
            >
              <ShieldAlert className="h-3.5 w-3.5 text-red-400" />
              <span>🔴 Test Rejet COPEO (Sonelgaz + ADERFP : ISO manquant + Erreur 1M DA)</span>
            </button>
            <button
              onClick={setPresetChuSolvetech}
              className="px-3 py-1 rounded bg-emerald-950/50 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/70 transition-colors flex items-center space-x-1.5"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              <span>🟢 Test Succès Start-up (CHU Constantine + SolveTech : Dispense Art. 87)</span>
            </button>
          </div>
        </div>
      </div>

      {/* MAIN CONTAINER */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full space-y-6">
        {/* CONTROL BAR */}
        <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 backdrop-blur shadow-xl">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            {/* SELECTOR 1: TENDER & DOCUMENT UPLOADER */}
            <div className="md:col-span-5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                  <FileText className="h-3.5 w-3.5 text-cyan-400" />
                  <span>1. Cahier des Charges Algérien</span>
                </span>
                <div className="flex items-center space-x-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[11px]">
                  <button
                    type="button"
                    onClick={() => {
                      setInputTab('sample');
                      setIsCustomMode(false);
                    }}
                    className={`px-2 py-0.5 rounded transition-colors ${
                      inputTab === 'sample' && !isCustomMode
                        ? 'bg-cyan-950 text-cyan-300 font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Modèles
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setInputTab('pdf');
                      setIsCustomMode(true);
                    }}
                    className={`px-2 py-0.5 rounded transition-colors ${
                      inputTab === 'pdf' || isCustomMode
                        ? 'bg-cyan-950 text-cyan-300 font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Importer PDF/TXT
                  </button>
                </div>
              </div>

              {inputTab === 'pdf' || isCustomMode ? (
                <DocumentUploader
                  extractedText={customText}
                  onTextExtracted={(text, fileName) => {
                    setCustomText(text);
                    if (fileName) setUploadedFileName(fileName);
                    setIsCustomMode(true);
                  }}
                  activeFileName={uploadedFileName}
                  onClearFile={() => {
                    setUploadedFileName(null);
                    setCustomText('');
                    setIsCustomMode(false);
                    setInputTab('sample');
                  }}
                />
              ) : (
                <select
                  value={selectedTenderId}
                  onChange={(e) => setSelectedTenderId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                >
                  {tenders.map((t) => (
                    <option key={t.id} value={t.id}>
                      [{t.reference}] {t.title} — {t.authority}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* SELECTOR 2: BIDDER PROFILE */}
            <div className="md:col-span-4 space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                <Building2 className="h-3.5 w-3.5 text-emerald-400" />
                <span>2. Profil de l&apos;Entreprise Soumissionnaire</span>
              </label>
              <select
                value={selectedProfileId}
                onChange={(e) => setSelectedProfileId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.type} - {p.wilaya})
                  </option>
                ))}
              </select>
            </div>

            {/* PRIMARY CTA */}
            <div className="md:col-span-3">
              <button
                onClick={() => runAudit(selectedTenderId, selectedProfileId)}
                disabled={isLoading}
                className={`w-full py-2.5 px-4 rounded-lg font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center space-x-2 shadow-lg ${
                  isLoading
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                    : 'bg-gradient-to-r from-cyan-500 via-teal-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 shadow-cyber-neon hover:shadow-cyan-500/50 active:scale-[0.98]'
                }`}
              >
                {isLoading ? (
                  <>
                    <span className="h-4 w-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></span>
                    <span>Audit en cours...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 text-slate-950" />
                    <span>⚡ Lancer l&apos;Audit Multi-Agents</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* ACTIVE PARAMETERS SNIPPET */}
          <div className="mt-3 pt-3 border-t border-slate-800/60 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-slate-300 font-medium">Soumissionnaire actif :</span>
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 font-mono">
                RC: {currentProfile.rc}
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 font-mono">
                NIF: {currentProfile.nif}
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200">
                {currentProfile.engineersCount} Ingénieurs
              </span>
              {currentProfile.startupLabel && (
                <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-semibold">
                  ★ Start-up Labellisée
                </span>
              )}
            </div>

            {isLoading && (
              <div className="text-cyan-400 font-mono text-xs flex items-center space-x-2">
                <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping"></span>
                <span>{stepMessage}</span>
              </div>
            )}
          </div>
        </section>

        {errorMsg && (
          <div className="p-4 rounded-xl bg-red-950/80 border border-red-700 text-red-200 text-xs flex items-start space-x-3">
            <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Erreur lors de l&apos;exécution :</p>
              <p className="font-mono mt-1">{errorMsg}</p>
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-6">
            {/* PANEL 1: COPEO SAFETY TRIAGE BANNER (15% BOUNDARY) */}
            <section
              className={`rounded-xl border p-5 transition-all shadow-xl ${
                result.pass2Critic.status === 'CRITICAL_DISQUALIFICATION_WARNING'
                  ? 'bg-red-950/30 border-red-700/80 shadow-cyber-danger'
                  : 'bg-emerald-950/30 border-emerald-700/80 shadow-cyber-success'
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-start space-x-3.5">
                  <div
                    className={`h-12 w-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      result.pass2Critic.status === 'CRITICAL_DISQUALIFICATION_WARNING'
                        ? 'bg-red-900/60 text-red-300 border border-red-600'
                        : 'bg-emerald-900/60 text-emerald-300 border border-emerald-600'
                    }`}
                  >
                    {result.pass2Critic.status === 'CRITICAL_DISQUALIFICATION_WARNING' ? (
                      <ShieldAlert className="h-7 w-7 text-red-400" />
                    ) : (
                      <ShieldCheck className="h-7 w-7 text-emerald-400" />
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-full font-mono font-bold tracking-wider uppercase border ${
                          result.pass2Critic.status === 'CRITICAL_DISQUALIFICATION_WARNING'
                            ? 'bg-red-950 text-red-300 border-red-700'
                            : 'bg-emerald-950 text-emerald-300 border-emerald-700'
                        }`}
                      >
                        {result.pass2Critic.status === 'CRITICAL_DISQUALIFICATION_WARNING'
                          ? '🚨 CRITICAL_DISQUALIFICATION_WARNING'
                          : '✅ CONFORME & QUALIFIÉ (COPEO SAFE)'}
                      </span>
                      <span className="text-xs font-mono text-slate-400">
                        Seuil de sécurité COPEO : <span className="text-amber-400 font-semibold">15.0% Max</span>
                      </span>
                    </div>

                    <h2 className="text-lg font-bold text-white">
                      {result.pass2Critic.status === 'CRITICAL_DISQUALIFICATION_WARNING'
                        ? 'Défaut Éliminatoire Majeur Détecté — Risque de Rejet Imminent'
                        : 'Dossier Conforme aux Prescriptions de la Loi n° 23-12'}
                    </h2>
                    <p className="text-xs text-slate-300 leading-relaxed max-w-4xl">
                      {result.pass2Critic.copeoPresidentVerdict}
                    </p>
                  </div>
                </div>

                {/* GAUGE & METRICS */}
                <div className="flex items-center space-x-6 bg-slate-950/60 border border-slate-800 p-3.5 rounded-lg flex-shrink-0">
                  <div className="text-center">
                    <div className="text-xs uppercase font-mono text-slate-400">Risque Rejet</div>
                    <div
                      className={`text-2xl font-black font-mono ${
                        result.pass2Critic.eliminationRiskPercent >= 15 ? 'text-red-400' : 'text-emerald-400'
                      }`}
                    >
                      {result.pass2Critic.eliminationRiskPercent}%
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      {result.pass2Critic.eliminationRiskPercent >= 15 ? '≥ 15% (Alerte)' : '< 15% (Sécurisé)'}
                    </div>
                  </div>

                  <div className="w-px h-10 bg-slate-800" />

                  <div className="text-center">
                    <div className="text-xs uppercase font-mono text-slate-400">Note Technique</div>
                    <div className="text-lg font-bold font-mono text-cyan-400">
                      {result.pass1Result.technicalRubric.minEliminatoryScore}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">Seuil Éliminatoire</div>
                  </div>
                </div>
              </div>

              {/* FATAL TRAPS LIST OR STARTUP EXEMPTIONS */}
              {((result?.pass2Critic?.criticalTrapsFound || result?.pass2Critic?.fatalTrapsIdentified || []).length > 0) && (
                <div className="mt-4 pt-4 border-t border-red-900/40 space-y-2">
                  <div className="text-xs font-bold text-red-300 uppercase tracking-wider flex items-center space-x-1.5">
                    <Flame className="h-3.5 w-3.5 text-red-400" />
                    <span>Pièges Fatals Relevés par le Président de la COPEO (Pass 2 Critic) :</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(result?.pass2Critic?.criticalTrapsFound || result?.pass2Critic?.fatalTrapsIdentified || []).map((trap: any, idx: number) => {
                      const trapId = typeof trap === 'string' ? `TRAP-0${idx + 1}` : (trap?.trapId || `TRAP-0${idx + 1}`);
                      const severity = typeof trap === 'string' ? 'FATAL' : (trap?.severity || 'FATAL');
                      const cause = typeof trap === 'string' ? trap : (trap?.cause || String(trap));
                      const legalBasis = typeof trap !== 'string' && trap?.legalBasis ? trap.legalBasis : 'Loi n° 23-12 Art. 47 & 72';
                      const correctionRequired = typeof trap !== 'string' && trap?.correctionRequired ? trap.correctionRequired : 'Régulariser impérativement la pièce ou rectifier l\'addition avant l\'ouverture des plis.';

                      return (
                        <div
                          key={idx}
                          className="bg-red-950/40 border border-red-800/80 rounded-lg p-3 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between text-red-300 font-semibold">
                            <span>⚠️ {trapId}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/60 font-mono">
                              {severity}
                            </span>
                          </div>
                          <p className="text-red-200">{cause}</p>
                          <p className="text-[11px] text-red-300/80 italic">Loi : {legalBasis}</p>
                          <div className="pt-1 text-[11px] text-amber-300 font-medium">
                            ➜ Action corrective : {correctionRequired}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {((result?.pass2Critic?.regulatoryExemptionsApplied || []).length > 0) && (
                <div className="mt-4 pt-4 border-t border-emerald-900/40 space-y-2">
                  <div className="text-xs font-bold text-emerald-300 uppercase tracking-wider flex items-center space-x-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Mesures Dérogatoires & Dispenses Légales Activées (Loi n° 23-12 Art. 87) :</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(result?.pass2Critic?.regulatoryExemptionsApplied || []).map((ex, idx) => (
                      <div
                        key={idx}
                        className="bg-emerald-950/40 border border-emerald-800/80 rounded-lg p-3 text-xs space-y-1"
                      >
                        <div className="font-semibold text-emerald-300">★ {ex.exemptionTitle}</div>
                        <p className="text-[11px] text-emerald-400/90 font-mono">{ex.legalBasis}</p>
                        <p className="text-slate-300 text-[11px]">{ex.impact}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* 2-COLUMN SECTION: ENVELOPES (LEFT) & BPU MATH (RIGHT) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* PANEL 2: LES 3 ENVELOPPES RÉGLEMENTAIRES (LOI 23-12 ART. 47) */}
              <section className="lg:col-span-7 bg-slate-900/70 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center space-x-2">
                    <Layers className="h-4 w-4 text-cyan-400" />
                    <h3 className="text-sm font-bold uppercase tracking-wider text-white">
                      Les 3 Enveloppes Réglementaires
                    </h3>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400">
                    Loi n° 23-12 Art. 47
                  </span>
                </div>

                {/* ENVELOPE TABS */}
                <div className="flex border-b border-slate-800 mt-3 text-xs font-medium">
                  <button
                    onClick={() => setActiveEnvelope('ENVELOPE_A')}
                    className={`py-2 px-3 border-b-2 flex items-center space-x-1.5 transition-colors ${
                      activeEnvelope === 'ENVELOPE_A'
                        ? 'border-cyan-400 text-cyan-400 bg-cyan-950/20'
                        : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span>1. Candidature</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 font-mono">
                      {result.pass1Result.envelopes.envelopeA.items.length}
                    </span>
                  </button>

                  <button
                    onClick={() => setActiveEnvelope('ENVELOPE_B')}
                    className={`py-2 px-3 border-b-2 flex items-center space-x-1.5 transition-colors ${
                      activeEnvelope === 'ENVELOPE_B'
                        ? 'border-cyan-400 text-cyan-400 bg-cyan-950/20'
                        : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span>2. Offre Technique</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 font-mono">
                      {result.pass1Result.envelopes.envelopeB.items.length}
                    </span>
                  </button>

                  <button
                    onClick={() => setActiveEnvelope('ENVELOPE_C')}
                    className={`py-2 px-3 border-b-2 flex items-center space-x-1.5 transition-colors ${
                      activeEnvelope === 'ENVELOPE_C'
                        ? 'border-cyan-400 text-cyan-400 bg-cyan-950/20'
                        : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span>3. Offre Financière</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 font-mono">
                      {result.pass1Result.envelopes.envelopeC.items.length}
                    </span>
                  </button>
                </div>

                {/* ACTIVE ENVELOPE CONTENT */}
                <div className="mt-4 space-y-3 flex-1">
                  {(() => {
                    const currentEnv =
                      activeEnvelope === 'ENVELOPE_A'
                        ? result.pass1Result.envelopes.envelopeA
                        : activeEnvelope === 'ENVELOPE_B'
                        ? result.pass1Result.envelopes.envelopeB
                        : result.pass1Result.envelopes.envelopeC;

                    return (
                      <>
                        <div className="flex items-center justify-between text-xs text-slate-400 pb-1">
                          <span className="font-semibold text-slate-200">{currentEnv.title}</span>
                          <span className="text-emerald-400 font-mono font-medium">
                            Conformité : {Math.round(currentEnv.complianceScore)}%
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 italic mb-2">{currentEnv.subtitle}</p>

                        <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                          {currentEnv.items.map((item) => (
                            <div
                              key={item.id}
                              className={`p-2.5 rounded-lg border text-xs flex items-start justify-between gap-3 ${
                                item.status === 'COMPLIANT'
                                  ? 'bg-slate-950/70 border-slate-800'
                                  : item.status === 'EXEMPTED_BY_LAW'
                                  ? 'bg-emerald-950/20 border-emerald-800/60'
                                  : 'bg-red-950/30 border-red-800/80'
                              }`}
                            >
                              <div className="space-y-0.5">
                                <div className="flex items-center space-x-2">
                                  <span className="font-mono text-[10px] text-slate-500 font-bold">
                                    {item.id}
                                  </span>
                                  <span className="font-medium text-slate-100">{item.label}</span>
                                </div>
                                <div className="text-[11px] text-slate-400">{item.details}</div>
                                <div className="text-[10px] font-mono text-cyan-400/80">
                                  {item.legalReference}
                                </div>
                              </div>

                              <div className="flex-shrink-0">
                                {item.status === 'COMPLIANT' && (
                                  <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px] font-mono flex items-center space-x-1">
                                    <CheckCircle2 className="h-3 w-3" />
                                    <span>CONFORME</span>
                                  </span>
                                )}
                                {item.status === 'EXEMPTED_BY_LAW' && (
                                  <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 text-[10px] font-mono flex items-center space-x-1">
                                    <Sparkles className="h-3 w-3" />
                                    <span>DISPENSE ART. 87</span>
                                  </span>
                                )}
                                {item.status === 'NON_COMPLIANT' && (
                                  <span className="px-2 py-0.5 rounded bg-red-950 text-red-300 border border-red-800 text-[10px] font-mono flex items-center space-x-1">
                                    <XCircle className="h-3 w-3" />
                                    <span>NON CONFORME</span>
                                  </span>
                                )}
                                {item.status === 'WARNING' && (
                                  <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 text-[10px] font-mono flex items-center space-x-1">
                                    <AlertTriangle className="h-3 w-3" />
                                    <span>VIGILANCE</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </section>

              {/* PANEL 3: AUDIT ARITHMÉTIQUE BPU & DQE (DZD) */}
              <section className="lg:col-span-5 bg-slate-900/70 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center space-x-2">
                    <Calculator className="h-4 w-4 text-emerald-400" />
                    <h3 className="text-sm font-bold uppercase tracking-wider text-white">
                      Audit Arithmétique BPU & DQE
                    </h3>
                  </div>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                    Monnaie : DZD (DA)
                  </span>
                </div>

                {result.bpuAudit.hasErrors ? (
                  <div className="mt-3 p-2.5 rounded-lg bg-red-950/60 border border-red-800 text-xs text-red-200 flex items-start space-x-2">
                    <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Anomalie financière détectée : </span>
                      <span>Écart de {Math.abs(result.bpuAudit.grandDiscrepancyHT).toLocaleString('fr-DZ')} DA entre montant déclaré et calculé.</span>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800 text-xs text-emerald-200 flex items-center space-x-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                    <span>Intégrité arithmétique validée (zéro écart de calcul).</span>
                  </div>
                )}

                {/* BPU ITEMS TABLE */}
                <div className="mt-3 flex-1 overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 text-[10px] uppercase">
                        <th className="py-2 pr-2">Code</th>
                        <th className="py-2 pr-2">Qté x P.U HT</th>
                        <th className="py-2 pr-2">Déclaré HT</th>
                        <th className="py-2 pr-2">Calculé HT</th>
                        <th className="py-2 text-right">TVA</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {result.bpuAudit.lines.map((l) => (
                        <tr
                          key={l.code}
                          className={`hover:bg-slate-800/30 ${
                            l.hasDiscrepancy ? 'bg-red-950/30 font-semibold' : ''
                          }`}
                        >
                          <td className="py-2 pr-2">
                            <span className={l.hasDiscrepancy ? 'text-red-400 font-bold' : 'text-slate-300'}>
                              {l.code}
                            </span>
                            <div className="text-[10px] text-slate-400 truncate max-w-[120px]" title={l.designation}>
                              {l.designation}
                            </div>
                          </td>
                          <td className="py-2 pr-2 text-slate-300">
                            {l.qty} x {(l.unitPriceHT / 1000).toLocaleString('fr-DZ')}k
                          </td>
                          <td className="py-2 pr-2 text-slate-400">
                            {(l.claimedTotalHT / 1000).toLocaleString('fr-DZ')}k
                          </td>
                          <td className="py-2 pr-2">
                            <span
                              className={
                                l.hasDiscrepancy ? 'text-red-400 font-black' : 'text-emerald-400'
                              }
                            >
                              {(l.computedTotalHT / 1000).toLocaleString('fr-DZ')}k
                            </span>
                            {l.hasDiscrepancy && (
                              <span className="block text-[9px] text-red-400">
                                ÉCART {l.discrepancyHT < 0 ? '-' : '+'}{Math.abs(l.discrepancyHT).toLocaleString('fr-DZ')} DA
                              </span>
                            )}
                          </td>
                          <td className="py-2 text-right text-slate-300">
                            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px]">
                              {l.tvaRate}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* TOTALS SUMMARY */}
                <div className="mt-4 pt-3 border-t border-slate-800 space-y-1.5 text-xs font-mono">
                  <div className="flex justify-between text-slate-400">
                    <span>Total HT Déclaré :</span>
                    <span>{formatDZD(result.bpuAudit.claimedGrandTotalHT)}</span>
                  </div>
                  <div className="flex justify-between text-slate-200 font-bold">
                    <span>Total HT Calculé :</span>
                    <span className={result.bpuAudit.hasErrors ? 'text-red-400' : 'text-emerald-400'}>
                      {formatDZD(result.bpuAudit.computedGrandTotalHT)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-400 text-[11px]">
                    <span>TVA (9% Solaire & 19% Standard) :</span>
                    <span>{formatDZD(result.bpuAudit.totalTVA)}</span>
                  </div>
                  <div className="flex justify-between text-white font-black text-sm pt-1 border-t border-slate-800">
                    <span className="text-cyan-400">Total Général TTC :</span>
                    <span className="text-cyan-400">{formatDZD(result.bpuAudit.grandTotalTTC)}</span>
                  </div>
                </div>
              </section>
            </div>

            {/* PANEL 4: MÉMOIRE TECHNIQUE JUSTIFICATIF & TRACE DE RAISONNEMENT GEMMA 4 */}
            <section className="bg-slate-900/70 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-3">
                <div className="flex items-center space-x-2">
                  <FileCode className="h-5 w-5 text-cyan-400" />
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-white">
                      Mémoire Technique Justificatif
                    </h3>
                    <p className="text-xs text-slate-400">
                      Rédigé sur-mesure par Gemma 4 selon les barèmes de notation de la Loi n° 23-12
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2 no-print">
                  <button
                    onClick={copyMemoireToClipboard}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-colors flex items-center space-x-1.5"
                  >
                    <Copy className="h-3.5 w-3.5 text-cyan-400" />
                    <span>{isCopied ? 'Copié !' : 'Copier'}</span>
                  </button>

                  <button
                    onClick={handlePrint}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-colors flex items-center space-x-1.5"
                  >
                    <Printer className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Imprimer / PDF</span>
                  </button>
                </div>
              </div>

              {/* FORMATTED MÉMOIRE DISPLAY */}
              <div className="bg-slate-950 border border-slate-800 rounded-lg p-5 font-mono text-xs text-slate-300 leading-relaxed max-h-[380px] overflow-y-auto whitespace-pre-wrap select-text">
                {result.pass1Result.memoireTechnique.fullMarkdown}
              </div>

              {/* EXPANDABLE TERMINAL DRAWER: GEMMA 4 THOUGHT TRACE & ACTIVE SKILLS */}
              <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-950/90 no-print">
                <button
                  type="button"
                  onClick={() => setIsTerminalExpanded(!isTerminalExpanded)}
                  className="w-full px-4 py-3 bg-slate-900/90 hover:bg-slate-900 flex items-center justify-between text-xs font-mono text-slate-300 transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    <Terminal className="h-4 w-4 text-cyan-400" />
                    <span className="font-semibold text-cyan-300">
                      TERMINAL AGENT : Trace de Raisonnement Gemma 4 (thought: true) & Fichiers SKILL.md
                    </span>
                    <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800 text-[10px]">
                      {result.executionMode}
                    </span>
                  </div>
                  {isTerminalExpanded ? (
                    <ChevronUp className="h-4 w-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  )}
                </button>

                {isTerminalExpanded && (
                  <div className="p-4 space-y-4 border-t border-slate-800 font-mono text-xs">
                    {/* ACTIVE SKILLS LIST */}
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center space-x-1.5">
                        <BookOpen className="h-3.5 w-3.5 text-amber-400" />
                        <span>Fichiers de Compétences Actifs (Modular SKILL.md) :</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        {result.activeSkillsUsed.map((skill, i) => (
                          <div
                            key={i}
                            className="p-2.5 rounded bg-slate-900 border border-slate-800 text-[11px] space-y-1"
                          >
                            <div className="text-amber-400 font-semibold flex items-center justify-between">
                              <span>skills/{skill.name}/SKILL.md</span>
                              <span className="text-[9px] text-slate-500">v{skill.version}</span>
                            </div>
                            <div className="text-slate-400 text-[10px] line-clamp-2">
                              {skill.description}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* GEMMA 4 THOUGHT TRACE */}
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wider text-cyan-400 mb-2 flex items-center space-x-1.5">
                        <Cpu className="h-3.5 w-3.5 text-cyan-400" />
                        <span>Trace Interne Chain-of-Thought (parts.find(p =&gt; p.thought === true)) :</span>
                      </div>
                      <pre className="p-3.5 rounded bg-black border border-slate-800 text-cyan-200/90 text-[11px] leading-relaxed max-h-60 overflow-y-auto whitespace-pre-wrap">
                        {result.thoughtTrace}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer className="border-t border-slate-800 bg-slate-950/80 py-4 px-4 text-center text-xs text-slate-500 font-mono no-print">
        <p>
          SoumissionAI-DZ — Conforme à la Loi n° 23-12 du 5 août 2023 fixant les règles des marchés publics en Algérie.
          Sous licence Apache-2.0. Développé pour la communauté Open-Source Algérienne.
        </p>
      </footer>
    </div>
  );
}
