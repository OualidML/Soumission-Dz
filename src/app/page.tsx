'use client';

import React, { useState, useEffect } from 'react';
import {
  ThemeProvider,
  CssBaseline,
  Box,
  Stack,
  Typography,
  Button,
  Card,
  CardContent,
  Chip,
  Tabs,
  Tab,
  TextField,
  MenuItem,
  Divider,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Alert,
  LinearProgress,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import MemoryIcon from '@mui/icons-material/Memory';
import GppMaybeIcon from '@mui/icons-material/GppMaybe';
import VerifiedIcon from '@mui/icons-material/Verified';
import DescriptionIcon from '@mui/icons-material/Description';
import CalculateIcon from '@mui/icons-material/Calculate';
import TerminalIcon from '@mui/icons-material/Terminal';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CancelIcon from '@mui/icons-material/Cancel';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import PrintIcon from '@mui/icons-material/Print';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import LayersIcon from '@mui/icons-material/Layers';
import BusinessIcon from '@mui/icons-material/Business';
import CodeIcon from '@mui/icons-material/Code';
import WhatshotIcon from '@mui/icons-material/Whatshot';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import GridViewIcon from '@mui/icons-material/GridView';

import theme, { NERO } from '@/theme';
import demoData from '../../demo-data/algerian-tenders.json';
import { TenderData, CompanyProfile, AnalysisResponse, EnvelopeKey, EnvelopeCheckItem } from '@/lib/types';
import { formatDZD } from '@/lib/bpu-math';
import { DocumentUploader } from '@/components/DocumentUploader';

const MONO = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

function Serif({ children }: { children: React.ReactNode }) {
  return <span className="serif-accent">{children}</span>;
}

const ENVELOPE_STATUS: Record<
  EnvelopeCheckItem['status'],
  { label: string; bg: string; color: string; border: string; icon: React.ReactNode }
> = {
  COMPLIANT: {
    label: 'CONFORME',
    bg: NERO.successSoft,
    color: NERO.success,
    border: 'rgba(31,122,85,0.28)',
    icon: <CheckCircleOutlineIcon sx={{ fontSize: 14 }} />,
  },
  EXEMPTED_BY_LAW: {
    label: 'DISPENSE ART. 87',
    bg: '#EAF3F8',
    color: NERO.tealDeep,
    border: 'rgba(53,111,143,0.28)',
    icon: <AutoAwesomeIcon sx={{ fontSize: 14 }} />,
  },
  NON_COMPLIANT: {
    label: 'NON CONFORME',
    bg: NERO.dangerSoft,
    color: NERO.danger,
    border: 'rgba(179,38,30,0.28)',
    icon: <CancelIcon sx={{ fontSize: 14 }} />,
  },
  WARNING: {
    label: 'VIGILANCE',
    bg: NERO.warningSoft,
    color: NERO.warning,
    border: 'rgba(183,121,31,0.32)',
    icon: <WarningAmberIcon sx={{ fontSize: 14 }} />,
  },
};

function StatusChip({ status }: { status: EnvelopeCheckItem['status'] }) {
  const meta = ENVELOPE_STATUS[status];
  return (
    <Chip
      size="small"
      icon={<Box sx={{ display: 'flex', color: meta.color }}>{meta.icon}</Box>}
      label={meta.label}
      sx={{
        bgcolor: meta.bg,
        color: meta.color,
        border: `1px solid ${meta.border}`,
        fontFamily: MONO,
        fontSize: 10,
        letterSpacing: '.04em',
        '& .MuiChip-icon': { ml: 1 },
      }}
    />
  );
}

function RiskGauge({ value }: { value: number }) {
  const critical = value >= 15;
  const color = critical ? NERO.danger : NERO.success;
  return (
    <Box sx={{ position: 'relative', display: 'inline-flex', width: 136, height: 136 }}>
      <CircularProgress
        variant="determinate"
        value={100}
        size={136}
        thickness={4}
        sx={{ position: 'absolute', color: 'rgba(20,18,15,0.07)' }}
      />
      <CircularProgress
        variant="determinate"
        value={Math.min(100, Math.max(0, value))}
        size={136}
        thickness={4}
        sx={{
          position: 'absolute',
          color,
          transform: 'rotate(-90deg)',
          '& .MuiCircularProgress-circle': { strokeLinecap: 'round' },
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 0.25,
        }}
      >
        <Typography sx={{ fontFamily: MONO, fontWeight: 900, fontSize: 28, lineHeight: 1, color }}>
          {value}%
        </Typography>
        <Typography sx={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: NERO.muted }}>
          Risque rejet
        </Typography>
        <Typography sx={{ fontSize: 9.5, fontFamily: MONO, color: critical ? NERO.danger : NERO.success }}>
          {critical ? '≥ 15% alerte' : '< 15% sécurisé'}
        </Typography>
      </Box>
    </Box>
  );
}

export default function HomePage() {
  const tenders: TenderData[] = demoData.sampleTenders as any;
  const profiles: CompanyProfile[] = demoData.companyProfiles as any;

  const [selectedTenderId, setSelectedTenderId] = useState<string>(tenders[0].id);
  const [selectedProfileId, setSelectedProfileId] = useState<string>(profiles[0].id);
  const [customText, setCustomText] = useState<string>('');
  const [isCustomMode, setIsCustomMode] = useState<boolean>(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [inputTab, setInputTab] = useState<'sample' | 'pdf'>('sample');

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [stepMessage, setStepMessage] = useState<string>('');
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [activeEnvelope, setActiveEnvelope] = useState<EnvelopeKey>('ENVELOPE_A');
  const [isTerminalExpanded, setIsTerminalExpanded] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState<boolean>(false);

  const currentTender = isCustomMode
    ? {
        id: 'custom-tender',
        reference: 'CUSTOM/2026/DZ',
        title: 'Cahier des charges personnalisé (Texte libre)',
        authority: "Maître d'Ouvrage Non Spécifié",
        sector: 'Marché Public Personnalisé',
        RawText: customText || 'Cahier des charges...',
        bpuItems: [],
      }
    : tenders.find((t) => t.id === selectedTenderId) || tenders[0];

  const currentProfile = profiles.find((p) => p.id === selectedProfileId) || profiles[0];

  useEffect(() => {
    runAudit(selectedTenderId, selectedProfileId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runAudit = async (
    tenderIdToUse = selectedTenderId,
    profileIdToUse = selectedProfileId,
    overrideText?: string,
    overrideFileName?: string
  ) => {
    setIsLoading(true);
    setErrorMsg(null);
    setStepMessage('1/4 Chargement des 3 Agents Skills modulaires (SKILL.md)...');

    try {
      const activeText = overrideText !== undefined ? overrideText : customText;
      const activeFileName = overrideFileName !== undefined ? overrideFileName : uploadedFileName;

      const isCustom =
        inputTab === 'pdf' ||
        isCustomMode ||
        tenderIdToUse === 'custom' ||
        tenderIdToUse === 'custom-tender' ||
        (!!activeText && activeText.trim().length > 0);
      const isCustomUpload =
        isCustom ||
        tenderIdToUse === 'custom' ||
        tenderIdToUse === 'custom-tender' ||
        Boolean(activeText && activeText.trim().length > 0);

      const activeT = isCustom
        ? {
            id: 'custom-tender',
            reference: activeFileName
              ? `DOC-${activeFileName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)}/2026`
              : 'CUSTOM/2026/DZ',
            title: activeFileName ? `Cahier des Charges — ${activeFileName}` : 'Cahier des charges personnalisé',
            authority: 'Commission des Marchés Publics',
            sector: 'Marché Public Personnalisé',
            RawText: activeText || "Cahier des charges soumis à l'audit...",
            bpuItems: [],
          }
        : tenders.find((t) => t.id === tenderIdToUse) || tenders[0];

      const activeP = profiles.find((p) => p.id === profileIdToUse) || profiles[0];

      setTimeout(() => setStepMessage('2/4 Audit arithmétique déterministe BPU & DQE (DZD)...'), 400);
      setTimeout(() => setStepMessage('3/4 Pass 1 : Extraction Enveloppes Loi 23-12 & Mémoire...'), 800);
      setTimeout(() => setStepMessage('4/4 Pass 2 : Critique Adversarial COPEO & Règle des 15%...'), 1200);

      const payloadText = isCustom ? (activeText || activeT.RawText) : activeT.RawText;

      const res = await fetch('/api/analyze-tender', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenderData: {
            ...activeT,
            RawText: payloadText,
          },
          companyProfile: activeP,
          rawTenderText: payloadText,
          isCustomUpload: isCustomUpload,
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
      setErrorMsg(err.message || "Une erreur est survenue lors de l'analyse");
    } finally {
      setIsLoading(false);
      setStepMessage('');
    }
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

  const isCritical = result?.pass2Critic.status === 'CRITICAL_DISQUALIFICATION_WARNING';

  const fatalTraps: any[] =
    (result?.pass2Critic as any)?.criticalTrapsFound || result?.pass2Critic?.fatalTrapsIdentified || [];

  const exemptions = (result?.pass2Critic as any)?.regulatoryExemptionsApplied || [];

  const currentEnv = result
    ? activeEnvelope === 'ENVELOPE_A'
      ? result.pass1Result.envelopes.envelopeA
      : activeEnvelope === 'ENVELOPE_B'
      ? result.pass1Result.envelopes.envelopeB
      : result.pass1Result.envelopes.envelopeC
    : null;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: NERO.paper }}>
        {/* ===== STICKY DARK PILL NAV (NERO style) ===== */}
        <Box
          className="no-print"
          sx={{
            position: 'sticky',
            top: 0,
            zIndex: 60,
            p: { xs: 1.5, sm: '18px 24px' },
            bgcolor: 'rgba(245,242,236,0.82)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <Box
            sx={{
              maxWidth: 1160,
              mx: 'auto',
              bgcolor: NERO.dark,
              borderRadius: 999,
              pl: { xs: 2, sm: 2.75 },
              pr: { xs: 1, sm: 1.25 },
              py: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 2,
              boxShadow: '0 14px 34px rgba(20,18,15,0.24)',
            }}
          >
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
              <Box
                sx={{
                  width: 38,
                  height: 38,
                  borderRadius: 2.5,
                  display: 'grid',
                  placeItems: 'center',
                  background: `linear-gradient(135deg, ${NERO.teal}, ${NERO.tealDeep})`,
                  flexShrink: 0,
                }}
              >
                <MemoryIcon sx={{ color: '#fff', fontSize: 22 }} />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography sx={{ color: '#fff', fontWeight: 900, fontSize: { xs: 16, sm: 18 }, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
                    Soumission
                    <Box component="span" sx={{ color: NERO.teal }}>
                      AI
                    </Box>
                    <Box component="span" sx={{ color: '#9fd0e3' }}>
                      -DZ
                    </Box>
                  </Typography>
                  <Chip
                    label="v1.0.0"
                    size="small"
                    sx={{ bgcolor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.75)', fontFamily: MONO, fontSize: 10 }}
                  />
                </Stack>
                <Typography sx={{ color: 'rgba(255,255,255,0.55)', fontSize: { xs: 10.5, sm: 11.5 }, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  Audit des cahiers des charges — Loi n° 23-12
                </Typography>
              </Box>
            </Stack>

            <Stack direction="row" spacing={1} alignItems="center" sx={{ display: { xs: 'none', md: 'flex' } }}>
              <Stack
                direction="row"
                spacing={0.75}
                alignItems="center"
                sx={{ px: 1.5, py: 0.75, borderRadius: 999, bgcolor: 'rgba(108,168,201,0.16)', border: '1px solid rgba(108,168,201,0.3)' }}
              >
                <Box className="neon-pulse" sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: NERO.teal }} />
                <Typography sx={{ color: '#BFE0EE', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
                  Gemma 4 26B
                </Typography>
              </Stack>
              <Stack
                direction="row"
                spacing={0.75}
                alignItems="center"
                sx={{ px: 1.5, py: 0.75, borderRadius: 999, bgcolor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
              >
                <EmojiEventsIcon sx={{ color: '#9fd0e3', fontSize: 14 }} />
                <Typography sx={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: 600 }}>
                  Apache-2.0
                </Typography>
              </Stack>
              <Stack
                direction="row"
                spacing={0.75}
                alignItems="center"
                sx={{ px: 1.5, py: 0.75, borderRadius: 999, bgcolor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
              >
                <LayersIcon sx={{ color: NERO.warning, fontSize: 14 }} />
                <Typography sx={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: 600 }}>
                  3 SKILL.md
                </Typography>
              </Stack>
            </Stack>
          </Box>
        </Box>

        {/* ===== DEMO PRESETS ===== */}
        <Box className="no-print" sx={{ borderTop: `1px solid ${NERO.line}`, borderBottom: `1px solid ${NERO.line}`, bgcolor: 'rgba(237,232,223,0.55)', px: { xs: 2, sm: 3 }, py: 1.25 }}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1.5}
            alignItems={{ xs: 'flex-start', sm: 'center' }}
            justifyContent="space-between"
            sx={{ maxWidth: 1160, mx: 'auto' }}
          >
            <Stack direction="row" spacing={1} alignItems="center">
              <AutoAwesomeIcon sx={{ color: NERO.tealDeep, fontSize: 17 }} />
              <Typography sx={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: NERO.muted }}>
                Scénarios démo 1-click
              </Typography>
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ width: { xs: '100%', sm: 'auto' } }}>
              <Button
                onClick={setPresetSonelgazAderfp}
                size="small"
                startIcon={<GppMaybeIcon sx={{ fontSize: 16 }} />}
                sx={{
                  bgcolor: NERO.dangerSoft,
                  color: NERO.danger,
                  border: '1px solid rgba(179,38,30,0.28)',
                  fontSize: 12,
                  justifyContent: { xs: 'flex-start', sm: 'center' },
                  '&:hover': { bgcolor: '#FBE3DF' },
                }}
              >
                Rejet COPEO · Sonelgaz + ADERFP
              </Button>
              <Button
                onClick={setPresetChuSolvetech}
                size="small"
                startIcon={<VerifiedIcon sx={{ fontSize: 16 }} />}
                sx={{
                  bgcolor: NERO.successSoft,
                  color: NERO.success,
                  border: '1px solid rgba(31,122,85,0.28)',
                  fontSize: 12,
                  justifyContent: { xs: 'flex-start', sm: 'center' },
                  '&:hover': { bgcolor: '#E2F2E9' },
                }}
              >
                Succès Start-up · CHU Constantine + SolveTech
              </Button>
            </Stack>
          </Stack>
        </Box>

        {/* ===== MAIN ===== */}
        <Box component="main" sx={{ width: '100%', maxWidth: 1160, mx: 'auto', px: { xs: 2, sm: 3 }, py: { xs: 4, md: 6 }, flex: 1 }}>
          {/* HERO */}
          <Stack spacing={2} sx={{ mb: { xs: 4, md: 5 }, maxWidth: 860 }}>
            <Box className="eyebrow">Audit multi-agents · Loi n° 23-12</Box>
            <Typography
              component="h1"
              sx={{
                fontSize: { xs: 36, sm: 46, md: 60 },
                fontWeight: 900,
                lineHeight: 1.02,
                letterSpacing: '-0.035em',
                color: NERO.ink,
              }}
            >
              Auditez votre dossier avant <Serif>la séance d&apos;ouverture.</Serif>
            </Typography>
            <Typography sx={{ color: NERO.muted, fontSize: { xs: 15.5, md: 18 }, maxWidth: 640 }}>
              Trois agents spécialisés confrontent votre offre aux exigences du droit algérien des marchés publics :
              ventilation des 3 enveloppes, audit arithmétique du BPU et simulation impitoyable de la commission COPEO.
            </Typography>

            <Stack direction="row" spacing={{ xs: 3, sm: 5 }} sx={{ pt: 1, flexWrap: 'wrap', rowGap: 1.5 }}>
              {[
                { n: '40%', l: 'des offres rejetées' },
                { n: '3', l: 'agents SKILL.md' },
                { n: '15%', l: 'seuil de sécurité' },
              ].map((s) => (
                <Box key={s.l}>
                  <Typography sx={{ fontWeight: 900, fontSize: 22, color: NERO.ink, lineHeight: 1.1 }}>{s.n}</Typography>
                  <Typography sx={{ fontSize: 12.5, color: NERO.muted, fontWeight: 600 }}>{s.l}</Typography>
                </Box>
              ))}
            </Stack>
          </Stack>

          {/* CONTROL CARD */}
          <Card sx={{ mb: 4 }}>
            <CardContent sx={{ p: { xs: 2.25, sm: 3 } }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '5fr 4fr 3fr' }, gap: 2, alignItems: 'end' }}>
                <Box sx={{ minWidth: 0 }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.75, flexWrap: 'wrap', rowGap: 0.75 }}>
                    <Stack direction="row" spacing={0.75} alignItems="center">
                      <DescriptionIcon sx={{ fontSize: 15, color: NERO.tealDeep }} />
                      <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: NERO.muted }}>
                        1. Cahier des charges
                      </Typography>
                    </Stack>

                    <ToggleButtonGroup
                      exclusive
                      size="small"
                      value={inputTab}
                      onChange={(_, v) => {
                        if (!v) return;
                        setInputTab(v);
                        setIsCustomMode(v === 'pdf');
                        if (v === 'sample') {
                          setUploadedFileName(null);
                          setCustomText('');
                        }
                      }}
                      sx={{
                        '& .MuiToggleButton-root': {
                          py: 0.25,
                          px: 1,
                          fontSize: 10.5,
                          fontWeight: 700,
                          textTransform: 'none',
                          color: NERO.muted,
                          border: `1px solid ${NERO.line}`,
                          '&.Mui-selected': { bgcolor: '#EAF3F8', color: NERO.tealDeep, borderColor: 'rgba(53,111,143,0.35)' },
                        },
                      }}
                    >
                      <ToggleButton value="sample">
                        <GridViewIcon sx={{ fontSize: 13, mr: 0.5 }} /> Modèles
                      </ToggleButton>
                      <ToggleButton value="pdf">
                        <UploadFileIcon sx={{ fontSize: 13, mr: 0.5 }} /> PDF / TXT
                      </ToggleButton>
                    </ToggleButtonGroup>
                  </Stack>

                  {inputTab === 'pdf' || isCustomMode ? (
                    <DocumentUploader
                      extractedText={customText}
                      onTextExtracted={(text, fileName) => {
                        setCustomText(text);
                        if (fileName) setUploadedFileName(fileName);
                        setIsCustomMode(true);
                        setInputTab('pdf');
                        runAudit('custom', selectedProfileId, text, fileName);
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
                    <TextField
                      select
                      fullWidth
                      value={selectedTenderId}
                      onChange={(e) => setSelectedTenderId(e.target.value)}
                      SelectProps={{ MenuProps: { PaperProps: { sx: { maxWidth: 460 } } } }}
                      sx={{ '& .MuiSelect-select': { fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }}
                    >
                      {tenders.map((t) => (
                        <MenuItem key={t.id} value={t.id} sx={{ fontSize: 12.5 }}>
                          [{t.reference}] {t.title} — {t.authority}
                        </MenuItem>
                      ))}
                    </TextField>
                  )}
                </Box>

                <Box sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.75 }}>
                    <BusinessIcon sx={{ fontSize: 15, color: NERO.success }} />
                    <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: NERO.muted }}>
                      2. Entreprise soumissionnaire
                    </Typography>
                  </Stack>
                  <TextField
                    select
                    fullWidth
                    value={selectedProfileId}
                    onChange={(e) => setSelectedProfileId(e.target.value)}
                    sx={{ '& .MuiSelect-select': { fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }}
                  >
                    {profiles.map((p) => (
                      <MenuItem key={p.id} value={p.id} sx={{ fontSize: 12.5 }}>
                        {p.name} ({p.type} — {p.wilaya})
                      </MenuItem>
                    ))}
                  </TextField>
                </Box>

                <Button
                  onClick={() => runAudit(isCustomMode ? 'custom' : selectedTenderId, selectedProfileId)}
                  disabled={isLoading}
                  fullWidth
                  endIcon={!isLoading ? <ArrowForwardIcon sx={{ fontSize: 18 }} /> : undefined}
                  sx={{
                    minHeight: 44,
                    background: isLoading ? '#E4E0D7' : `linear-gradient(135deg, ${NERO.teal}, ${NERO.tealDeep})`,
                    color: isLoading ? NERO.muted : '#fff',
                    fontSize: 13,
                    fontWeight: 800,
                    boxShadow: isLoading ? 'none' : '0 12px 26px -12px rgba(53,111,143,0.6)',
                    '&:hover': { background: isLoading ? '#E4E0D7' : `linear-gradient(135deg, ${NERO.teal}, #2c5f7b)`, transform: 'translateY(-1px)' },
                    '&.Mui-disabled': { background: '#E4E0D7', color: NERO.muted },
                  }}
                >
                  {isLoading ? (
                    <Stack direction="row" spacing={1} alignItems="center">
                      <CircularProgress size={15} sx={{ color: NERO.muted }} />
                      <span>Audit en cours...</span>
                    </Stack>
                  ) : (
                    "Lancer l'audit"
                  )}
                </Button>
              </Box>

              <Divider sx={{ my: 2.25 }} />

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" sx={{ flexWrap: 'wrap', rowGap: 1 }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 1 }}>
                  <Typography sx={{ fontSize: 12, fontWeight: 700, color: NERO.muted }}>Soumissionnaire actif :</Typography>
                  <Chip size="small" label={`RC: ${currentProfile.rc}`} sx={{ bgcolor: NERO.paperDeep, fontFamily: MONO, fontSize: 10.5 }} />
                  <Chip size="small" label={`NIF: ${currentProfile.nif}`} sx={{ bgcolor: NERO.paperDeep, fontFamily: MONO, fontSize: 10.5 }} />
                  <Chip size="small" label={`${currentProfile.engineersCount} ingénieurs`} sx={{ bgcolor: NERO.paperDeep, fontSize: 10.5 }} />
                  {currentProfile.startupLabel && (
                    <Chip
                      size="small"
                      icon={<AutoAwesomeIcon sx={{ fontSize: 13 }} />}
                      label="Start-up labellisée"
                      sx={{ bgcolor: '#EAF3F8', color: NERO.tealDeep, border: `1px solid rgba(53,111,143,0.3)`, fontWeight: 800, fontSize: 10.5 }}
                    />
                  )}
                  {!isCustomMode && inputTab === 'sample' && (
                    <Chip size="small" label={currentTender.reference} sx={{ bgcolor: 'transparent', border: `1px dashed ${NERO.line}`, fontFamily: MONO, fontSize: 10.5, color: NERO.muted }} />
                  )}
                  {uploadedFileName && (
                    <Chip size="small" label={uploadedFileName} sx={{ bgcolor: NERO.successSoft, color: NERO.success, border: '1px solid rgba(31,122,85,0.25)', fontFamily: MONO, fontSize: 10.5 }} />
                  )}
                </Stack>

                {isLoading && (
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ color: NERO.tealDeep }}>
                    <CircularProgress size={12} sx={{ color: NERO.tealDeep }} />
                    <Typography sx={{ fontFamily: MONO, fontSize: 11 }}>{stepMessage}</Typography>
                  </Stack>
                )}
              </Stack>

              {isLoading && <LinearProgress sx={{ mt: 2, borderRadius: 999, height: 3, bgcolor: NERO.paperDeep }} />}
            </CardContent>
          </Card>

          {errorMsg && (
            <Alert
              severity="error"
              icon={<WarningAmberIcon />}
              sx={{ mb: 3, borderRadius: 3, bgcolor: NERO.dangerSoft, color: NERO.danger, border: '1px solid rgba(179,38,30,0.25)', '& .MuiAlert-icon': { color: NERO.danger } }}
            >
              <Typography sx={{ fontWeight: 800, fontSize: 13 }}>Erreur lors de l&apos;exécution</Typography>
              <Typography sx={{ fontFamily: MONO, fontSize: 12 }}>{errorMsg}</Typography>
            </Alert>
          )}

          {result && (
            <Stack spacing={3.5}>
              {/* VERDICT CARD */}
              <Card
                sx={{
                  bgcolor: isCritical ? '#FCF1EF' : NERO.successSoft,
                  border: `1px solid ${isCritical ? 'rgba(179,38,30,0.25)' : 'rgba(31,122,85,0.22)'}`,
                  boxShadow: isCritical ? '0 24px 50px -34px rgba(179,38,30,0.55)' : '0 24px 50px -34px rgba(31,122,85,0.45)',
                }}
              >
                <CardContent sx={{ p: { xs: 2.5, sm: 3.25 } }}>
                  <Stack direction={{ xs: 'column', lg: 'row' }} spacing={{ xs: 2.5, lg: 4 }} alignItems={{ xs: 'flex-start', lg: 'center' }} justifyContent="space-between">
                    <Stack direction="row" spacing={2} alignItems="flex-start" sx={{ minWidth: 0 }}>
                      <Box
                        sx={{
                          width: 56,
                          height: 56,
                          borderRadius: 3,
                          flexShrink: 0,
                          display: 'grid',
                          placeItems: 'center',
                          bgcolor: isCritical ? 'rgba(179,38,30,0.1)' : 'rgba(31,122,85,0.1)',
                          border: `1px solid ${isCritical ? 'rgba(179,38,30,0.3)' : 'rgba(31,122,85,0.28)'}`,
                        }}
                      >
                        {isCritical ? <GppMaybeIcon sx={{ color: NERO.danger, fontSize: 30 }} /> : <VerifiedIcon sx={{ color: NERO.success, fontSize: 30 }} />}
                      </Box>

                      <Box sx={{ minWidth: 0 }}>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.75, mb: 0.75 }}>
                          <Chip
                            size="small"
                            label={isCritical ? 'CRITICAL_DISQUALIFICATION_WARNING' : 'CONFORME & QUALIFIÉ (COPEO SAFE)'}
                            sx={{
                              bgcolor: isCritical ? 'rgba(179,38,30,0.12)' : 'rgba(31,122,85,0.12)',
                              color: isCritical ? NERO.danger : NERO.success,
                              border: `1px solid ${isCritical ? 'rgba(179,38,30,0.3)' : 'rgba(31,122,85,0.3)'}`,
                              fontFamily: MONO,
                              fontSize: 10.5,
                              fontWeight: 800,
                              letterSpacing: '.03em',
                            }}
                          />
                          <Typography sx={{ fontFamily: MONO, fontSize: 11, color: NERO.muted }}>
                            Seuil COPEO : <Box component="span" sx={{ color: NERO.warning, fontWeight: 800 }}>15.0% max</Box>
                          </Typography>
                        </Stack>

                        <Typography sx={{ fontSize: { xs: 17, sm: 20 }, fontWeight: 800, color: NERO.ink, letterSpacing: '-0.01em', mb: 0.5 }}>
                          {isCritical ? 'Défaut éliminatoire majeur détecté — rejet imminent' : 'Dossier conforme aux prescriptions de la Loi n° 23-12'}
                        </Typography>
                        <Typography sx={{ fontSize: 13, color: NERO.muted, lineHeight: 1.65, maxWidth: 620 }}>
                          {result.pass2Critic.copeoPresidentVerdict}
                        </Typography>
                      </Box>
                    </Stack>

                    <Stack direction="row" spacing={3} alignItems="center" sx={{ flexShrink: 0, width: { xs: '100%', lg: 'auto' }, justifyContent: { xs: 'space-around', lg: 'flex-start' } }}>
                      <RiskGauge value={result.pass2Critic.eliminationRiskPercent} />
                      <Box sx={{ textAlign: 'center' }}>
                        <Typography sx={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: NERO.muted }}>
                          Note technique
                        </Typography>
                        <Typography sx={{ fontFamily: MONO, fontWeight: 800, fontSize: 17, color: NERO.tealDeep, mt: 0.5 }}>
                          {result.pass1Result.technicalRubric.minEliminatoryScore}
                        </Typography>
                        <Typography sx={{ fontSize: 9.5, color: NERO.muted }}>Seuil éliminatoire</Typography>
                      </Box>
                    </Stack>
                  </Stack>

                  {/* FATAL TRAPS */}
                  {fatalTraps.length > 0 && (
                    <Box sx={{ mt: 2.5, pt: 2.5, borderTop: `1px dashed rgba(179,38,30,0.3)` }}>
                      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 1.5 }}>
                        <WhatshotIcon sx={{ fontSize: 16, color: NERO.danger }} />
                        <Typography sx={{ fontSize: 11, fontWeight: 900, letterSpacing: '.08em', textTransform: 'uppercase', color: NERO.danger }}>
                          Pièges fatals relevés par le président de la COPEO
                        </Typography>
                      </Stack>
                      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5 }}>
                        {fatalTraps.map((trap: any, idx: number) => {
                          const trapId = typeof trap === 'string' ? `TRAP-0${idx + 1}` : trap?.trapId || `TRAP-0${idx + 1}`;
                          const severity = typeof trap === 'string' ? 'FATAL' : trap?.severity || 'FATAL';
                          const cause = typeof trap === 'string' ? trap : trap?.cause || String(trap);
                          const legalBasis =
                            typeof trap !== 'string' && trap?.legalBasis ? trap.legalBasis : 'Loi n° 23-12 Art. 47 & 72';
                          const correctionRequired =
                            typeof trap !== 'string' && trap?.correctionRequired
                              ? trap.correctionRequired
                              : "Régulariser impérativement la pièce ou rectifier l'addition avant l'ouverture des plis.";

                          return (
                            <Box
                              key={`${trapId}-${idx}`}
                              sx={{
                                bgcolor: 'rgba(255,255,255,0.7)',
                                border: '1px solid rgba(179,38,30,0.22)',
                                borderRadius: 3,
                                p: 2,
                              }}
                            >
                              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.75 }}>
                                <Typography sx={{ fontSize: 11.5, fontWeight: 800, color: NERO.danger, fontFamily: MONO }}>{trapId}</Typography>
                                <Chip size="small" label={severity} sx={{ bgcolor: 'rgba(179,38,30,0.12)', color: NERO.danger, fontFamily: MONO, fontSize: 9.5, height: 20 }} />
                              </Stack>
                              <Typography sx={{ fontSize: 12.5, color: NERO.ink, fontWeight: 600, mb: 0.75 }}>{cause}</Typography>
                              <Typography sx={{ fontSize: 11, color: NERO.muted, fontStyle: 'italic', mb: 0.75 }}>Loi : {legalBasis}</Typography>
                              <Typography sx={{ fontSize: 11.5, color: NERO.warning, fontWeight: 700 }}>
                                → Action corrective : {correctionRequired}
                              </Typography>
                            </Box>
                          );
                        })}
                      </Box>
                    </Box>
                  )}

                  {/* EXEMPTIONS */}
                  {exemptions.length > 0 && (
                    <Box sx={{ mt: 2.5, pt: 2.5, borderTop: `1px dashed rgba(31,122,85,0.3)` }}>
                      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 1.5 }}>
                        <AutoAwesomeIcon sx={{ fontSize: 16, color: NERO.success }} />
                        <Typography sx={{ fontSize: 11, fontWeight: 900, letterSpacing: '.08em', textTransform: 'uppercase', color: NERO.success }}>
                          Dispenses légales activées (Loi n° 23-12 Art. 87)
                        </Typography>
                      </Stack>
                      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5 }}>
                        {exemptions.map((ex: any, idx: number) => (
                          <Box key={idx} sx={{ bgcolor: 'rgba(255,255,255,0.7)', border: '1px solid rgba(31,122,85,0.2)', borderRadius: 3, p: 2 }}>
                            <Typography sx={{ fontSize: 12.5, fontWeight: 800, color: NERO.success, mb: 0.5 }}>★ {ex.exemptionTitle}</Typography>
                            <Typography sx={{ fontSize: 10.5, color: NERO.muted, fontFamily: MONO, mb: 0.5 }}>{ex.legalBasis}</Typography>
                            <Typography sx={{ fontSize: 11.5, color: NERO.ink }}>{ex.impact}</Typography>
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  )}
                </CardContent>
              </Card>

              {/* ENVELOPES + BPU */}
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '7fr 5fr' }, gap: 3 }}>
                {/* ENVELOPES */}
                <Card sx={{ display: 'flex', flexDirection: 'column' }}>
                  <CardContent sx={{ p: { xs: 2.25, sm: 3 }, display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <LayersIcon sx={{ fontSize: 18, color: NERO.tealDeep }} />
                        <Typography sx={{ fontSize: 12.5, fontWeight: 900, letterSpacing: '.06em', textTransform: 'uppercase', color: NERO.ink }}>
                          Les 3 enveloppes réglementaires
                        </Typography>
                      </Stack>
                      <Typography sx={{ fontFamily: MONO, fontSize: 10.5, color: NERO.muted }}>Loi 23-12 · Art. 47</Typography>
                    </Stack>

                    <Tabs
                      value={activeEnvelope}
                      onChange={(_, v) => setActiveEnvelope(v)}
                      variant="scrollable"
                      scrollButtons={false}
                      sx={{ borderBottom: `1px solid ${NERO.line}`, minHeight: 40, '& .MuiTab-root': { minHeight: 40, fontSize: 12.5 } }}
                    >
                      <Tab
                        value="ENVELOPE_A"
                        label={
                          <Stack direction="row" spacing={0.75} alignItems="center">
                            <span>1. Candidature</span>
                            <Chip size="small" label={result.pass1Result.envelopes.envelopeA.items.length} sx={{ height: 18, fontSize: 10, bgcolor: NERO.paperDeep }} />
                          </Stack>
                        }
                      />
                      <Tab
                        value="ENVELOPE_B"
                        label={
                          <Stack direction="row" spacing={0.75} alignItems="center">
                            <span>2. Offre technique</span>
                            <Chip size="small" label={result.pass1Result.envelopes.envelopeB.items.length} sx={{ height: 18, fontSize: 10, bgcolor: NERO.paperDeep }} />
                          </Stack>
                        }
                      />
                      <Tab
                        value="ENVELOPE_C"
                        label={
                          <Stack direction="row" spacing={0.75} alignItems="center">
                            <span>3. Offre financière</span>
                            <Chip size="small" label={result.pass1Result.envelopes.envelopeC.items.length} sx={{ height: 18, fontSize: 10, bgcolor: NERO.paperDeep }} />
                          </Stack>
                        }
                      />
                    </Tabs>

                    {currentEnv && (
                      <Box sx={{ mt: 2, flex: 1 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.25 }}>
                          <Typography sx={{ fontSize: 13.5, fontWeight: 800, color: NERO.ink }}>{currentEnv.title}</Typography>
                          <Typography sx={{ fontSize: 12, fontWeight: 800, fontFamily: MONO, color: NERO.success }}>
                            {Math.round(currentEnv.complianceScore)}% conforme
                          </Typography>
                        </Stack>
                        <Typography sx={{ fontSize: 11.5, fontStyle: 'italic', color: NERO.muted, mb: 1.75 }}>{currentEnv.subtitle}</Typography>

                        <Stack spacing={1.25} sx={{ maxHeight: 360, overflowY: 'auto', pr: 0.75 }}>
                          {currentEnv.items.map((item) => (
                            <Box
                              key={item.id}
                              sx={{
                                p: 1.75,
                                borderRadius: 2.5,
                                border: `1px solid ${item.status === 'NON_COMPLIANT' ? 'rgba(179,38,30,0.22)' : item.status === 'EXEMPTED_BY_LAW' ? 'rgba(53,111,143,0.2)' : NERO.line}`,
                                bgcolor: item.status === 'NON_COMPLIANT' ? 'rgba(253,238,235,0.65)' : item.status === 'EXEMPTED_BY_LAW' ? 'rgba(234,243,248,0.5)' : '#fff',
                                display: 'flex',
                                alignItems: 'flex-start',
                                justifyContent: 'space-between',
                                gap: 1.5,
                              }}
                            >
                              <Box sx={{ minWidth: 0 }}>
                                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.25 }}>
                                  <Typography sx={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: NERO.muted }}>{item.id}</Typography>
                                  <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: NERO.ink }}>{item.label}</Typography>
                                </Stack>
                                <Typography sx={{ fontSize: 11.5, color: NERO.muted, mb: 0.25 }}>{item.details}</Typography>
                                <Typography sx={{ fontSize: 10, fontFamily: MONO, color: NERO.tealDeep }}>{item.legalReference}</Typography>
                              </Box>
                              <Box sx={{ flexShrink: 0 }}>
                                <StatusChip status={item.status} />
                              </Box>
                            </Box>
                          ))}
                        </Stack>
                      </Box>
                    )}
                  </CardContent>
                </Card>

                {/* BPU AUDIT */}
                <Card sx={{ display: 'flex', flexDirection: 'column' }}>
                  <CardContent sx={{ p: { xs: 2.25, sm: 3 }, display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <CalculateIcon sx={{ fontSize: 18, color: NERO.success }} />
                        <Typography sx={{ fontSize: 12.5, fontWeight: 900, letterSpacing: '.06em', textTransform: 'uppercase', color: NERO.ink }}>
                          Audit BPU & DQE
                        </Typography>
                      </Stack>
                      <Chip size="small" label="DZD" sx={{ bgcolor: NERO.paperDeep, fontFamily: MONO, fontSize: 10 }} />
                    </Stack>

                    {result.bpuAudit.status === 'BPU_DATA_NOT_FOUND' || result.bpuAudit.lines.length === 0 ? (
                      <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ p: 1.5, bgcolor: '#FFF4E5', border: '1px solid rgba(230,129,0,0.35)', borderRadius: 2.5 }}>
                        <WarningAmberIcon sx={{ color: '#E65100', fontSize: 18, mt: 0.1, flexShrink: 0 }} />
                        <Typography sx={{ fontSize: 11.5, color: '#B24700' }}>
                          <Box component="span" sx={{ fontWeight: 800 }}>BPU / DQE non extrait : </Box>
                          {result.bpuAudit.notFoundMessage || "Aucun tableau de bordereau des prix unitaires structuré n'a été extrait du document pour vérification arithmétique."}
                        </Typography>
                      </Stack>
                    ) : result.bpuAudit.status === 'ARITHMETIC_ERROR' || result.bpuAudit.hasErrors ? (
                      <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ p: 1.5, bgcolor: NERO.dangerSoft, border: '1px solid rgba(179,38,30,0.22)', borderRadius: 2.5 }}>
                        <WarningAmberIcon sx={{ color: NERO.danger, fontSize: 18, mt: 0.1 }} />
                        <Typography sx={{ fontSize: 11.5, color: NERO.danger }}>
                          <Box component="span" sx={{ fontWeight: 800 }}>Anomalie financière : </Box>
                          {result.bpuAudit.errorDescriptions[0] || `écart de ${Math.abs(result.bpuAudit.grandDiscrepancyHT).toLocaleString('fr-DZ')} DA entre montant déclaré et calculé.`}
                        </Typography>
                      </Stack>
                    ) : result.bpuAudit.status === 'UNVERIFIED' ? (
                      <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ p: 1.5, bgcolor: '#FFF8E1', border: '1px solid rgba(255,179,0,0.4)', borderRadius: 2.5 }}>
                        <WarningAmberIcon sx={{ color: '#F57F17', fontSize: 18, mt: 0.1, flexShrink: 0 }} />
                        <Typography sx={{ fontSize: 11.5, color: '#B7791F' }}>
                          <Box component="span" sx={{ fontWeight: 800 }}>BPU Non Corroboré (UNVERIFIED) : </Box>
                          {result.bpuAudit.unverifiedMessage || "Aucun Total HT global déclaré n'a été trouvé au bas du document pour certifier la somme des lignes."}
                        </Typography>
                      </Stack>
                    ) : (
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ p: 1.5, bgcolor: NERO.successSoft, border: '1px solid rgba(31,122,85,0.2)', borderRadius: 2.5 }}>
                        <CheckCircleOutlineIcon sx={{ color: NERO.success, fontSize: 18 }} />
                        <Typography sx={{ fontSize: 11.5, color: NERO.success, fontWeight: 600 }}>
                          Intégrité arithmétique validée & Total HT corroboré (zéro écart).
                        </Typography>
                      </Stack>
                    )}

                    <TableContainer sx={{ mt: 2, flex: 1 }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            {['Code', 'Qté × P.U HT', 'Déclaré', 'Calculé', 'TVA'].map((h) => (
                              <TableCell key={h} sx={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', color: NERO.muted, px: 0.75 }}>
                                {h}
                              </TableCell>
                            ))}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {result.bpuAudit.lines.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={5} align="center" sx={{ py: 3, fontStyle: 'italic', color: NERO.muted, fontSize: 11 }}>
                                BPU Data Not Found — Aucun bordereau de prix n&apos;a été détecté dans les pages analysées.
                              </TableCell>
                            </TableRow>
                          ) : (
                            result.bpuAudit.lines.map((l) => (
                              <TableRow key={l.code} sx={{ bgcolor: l.hasDiscrepancy ? 'rgba(253,238,235,0.7)' : 'transparent' }}>
                                <TableCell sx={{ px: 0.75, fontFamily: MONO }}>
                                  <Typography sx={{ fontSize: 11, fontWeight: 800, fontFamily: MONO, color: l.hasDiscrepancy ? NERO.danger : NERO.ink }}>{l.code}</Typography>
                                  <Typography sx={{ fontSize: 9.5, color: NERO.muted, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.designation}>
                                    {l.designation}
                                  </Typography>
                                </TableCell>
                                <TableCell sx={{ px: 0.75, fontFamily: MONO, fontSize: 10.5, color: NERO.muted, whiteSpace: 'nowrap' }}>
                                  {l.qty} × {(l.unitPriceHT / 1000).toLocaleString('fr-DZ')}k
                                </TableCell>
                                <TableCell sx={{ px: 0.75, fontFamily: MONO, fontSize: 10.5, color: NERO.muted, whiteSpace: 'nowrap' }}>
                                  {(l.claimedTotalHT / 1000).toLocaleString('fr-DZ')}k
                                </TableCell>
                                <TableCell sx={{ px: 0.75, fontFamily: MONO, fontSize: 10.5, whiteSpace: 'nowrap' }}>
                                  <Box component="span" sx={{ color: l.hasDiscrepancy ? NERO.danger : NERO.success, fontWeight: 800 }}>
                                    {(l.computedTotalHT / 1000).toLocaleString('fr-DZ')}k
                                  </Box>
                                  {l.hasDiscrepancy && (
                                    <Typography sx={{ fontSize: 8.5, color: NERO.danger, fontFamily: MONO }}>
                                      ÉCART {l.discrepancyHT < 0 ? '-' : '+'}
                                      {Math.abs(l.discrepancyHT).toLocaleString('fr-DZ')} DA
                                    </Typography>
                                  )}
                                </TableCell>
                                <TableCell sx={{ px: 0.75, textAlign: 'right' }}>
                                  <Chip size="small" label={`${l.tvaRate}%`} sx={{ height: 18, fontSize: 9.5, fontFamily: MONO, bgcolor: NERO.paperDeep }} />
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </TableContainer>

                    <Divider sx={{ my: 1.5 }} />
                    {result.bpuAudit.lines.length === 0 ? (
                      <Typography sx={{ py: 1.5, textAlign: 'center', color: NERO.muted, fontSize: 11.5, fontStyle: 'italic' }}>
                        Totaux non calculables (BPU absent ou non extrait)
                      </Typography>
                    ) : (
                      <Stack spacing={0.75} sx={{ fontFamily: MONO }}>
                        <Stack direction="row" justifyContent="space-between">
                          <Typography sx={{ fontSize: 11, color: NERO.muted }}>Total HT déclaré</Typography>
                          <Typography sx={{ fontSize: 11, fontFamily: MONO, color: NERO.muted }}>{formatDZD(result.bpuAudit.claimedGrandTotalHT)}</Typography>
                        </Stack>
                        <Stack direction="row" justifyContent="space-between">
                          <Typography sx={{ fontSize: 11.5, fontWeight: 800, color: NERO.ink }}>Total HT calculé</Typography>
                          <Typography sx={{ fontSize: 11.5, fontFamily: MONO, fontWeight: 800, color: result.bpuAudit.hasErrors ? NERO.danger : NERO.success }}>
                            {formatDZD(result.bpuAudit.computedGrandTotalHT)}
                          </Typography>
                        </Stack>
                        <Stack direction="row" justifyContent="space-between">
                          <Typography sx={{ fontSize: 10.5, color: NERO.muted }}>TVA (9% solaire & 19% standard)</Typography>
                          <Typography sx={{ fontSize: 10.5, fontFamily: MONO, color: NERO.muted }}>{formatDZD(result.bpuAudit.totalTVA)}</Typography>
                        </Stack>
                        <Divider />
                        <Stack direction="row" justifyContent="space-between" sx={{ pt: 0.25 }}>
                          <Typography sx={{ fontSize: 13, fontWeight: 900, color: NERO.tealDeep }}>Total général TTC</Typography>
                          <Typography sx={{ fontSize: 13, fontFamily: MONO, fontWeight: 900, color: NERO.tealDeep }}>{formatDZD(result.bpuAudit.grandTotalTTC)}</Typography>
                        </Stack>
                      </Stack>
                    )}
                  </CardContent>
                </Card>
              </Box>

              {/* MÉMOIRE + TERMINAL */}
              <Card>
                <CardContent sx={{ p: { xs: 2.25, sm: 3 } }}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={1.5} sx={{ mb: 2 }}>
                    <Stack direction="row" spacing={1.25} alignItems="center">
                      <CodeIcon sx={{ fontSize: 20, color: NERO.tealDeep }} />
                      <Box>
                        <Typography sx={{ fontSize: 13.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.05em', color: NERO.ink }}>
                          Mémoire technique justificatif
                        </Typography>
                        <Typography sx={{ fontSize: 11.5, color: NERO.muted }}>
                          Rédigé sur-mesure selon les barèmes de notation de la Loi n° 23-12
                        </Typography>
                      </Box>
                    </Stack>

                    <Stack direction="row" spacing={1} className="no-print">
                      <Button
                        size="small"
                        onClick={copyMemoireToClipboard}
                        startIcon={<ContentCopyIcon sx={{ fontSize: 15 }} />}
                        sx={{ bgcolor: '#fff', color: NERO.ink, border: `1px solid ${NERO.line}`, fontSize: 11.5, '&:hover': { bgcolor: NERO.paperDeep } }}
                      >
                        {isCopied ? 'Copié !' : 'Copier'}
                      </Button>
                      <Button
                        size="small"
                        onClick={handlePrint}
                        startIcon={<PrintIcon sx={{ fontSize: 15 }} />}
                        sx={{ bgcolor: '#fff', color: NERO.ink, border: `1px solid ${NERO.line}`, fontSize: 11.5, '&:hover': { bgcolor: NERO.paperDeep } }}
                      >
                        Imprimer / PDF
                      </Button>
                    </Stack>
                  </Stack>

                  <Box
                    sx={{
                      bgcolor: NERO.paper,
                      border: `1px solid ${NERO.line}`,
                      borderRadius: 3,
                      p: { xs: 2, sm: 3 },
                      maxHeight: 380,
                      overflowY: 'auto',
                      whiteSpace: 'pre-wrap',
                      fontFamily: MONO,
                      fontSize: 11.5,
                      lineHeight: 1.75,
                      color: '#2B2820',
                    }}
                  >
                    {result.pass1Result.memoireTechnique.fullMarkdown}
                  </Box>

                  <Accordion
                    className="no-print"
                    expanded={isTerminalExpanded}
                    onChange={(_, exp) => setIsTerminalExpanded(exp)}
                    sx={{ mt: 2, bgcolor: NERO.dark, color: 'rgba(255,255,255,0.8)', border: 'none' }}
                  >
                    <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: NERO.teal }} />}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <TerminalIcon sx={{ fontSize: 17, color: NERO.teal }} />
                        <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#BFE0EE', fontFamily: MONO }}>
                          Terminal agent — trace Gemma 4 & fichiers SKILL.md
                        </Typography>
                        <Chip
                          size="small"
                          label={result.executionMode}
                          sx={{ bgcolor: 'rgba(108,168,201,0.15)', color: '#9fd0e3', border: '1px solid rgba(108,168,201,0.3)', fontFamily: MONO, fontSize: 9.5, height: 20 }}
                        />
                      </Stack>
                    </AccordionSummary>
                    <AccordionDetails sx={{ pt: 0 }}>
                      <Typography sx={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', mb: 1 }}>
                        Compétences actives
                      </Typography>
                      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 1 }}>
                        {result.activeSkillsUsed.map((skill, i) => (
                          <Box key={i} sx={{ p: 1.5, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                              <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: NERO.teal, fontFamily: MONO }}>
                                skills/{skill.name}
                              </Typography>
                              <Typography sx={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', fontFamily: MONO }}>v{skill.version}</Typography>
                            </Stack>
                            <Typography sx={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', mt: 0.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                              {skill.description}
                            </Typography>
                          </Box>
                        ))}
                      </Box>

                      <Typography sx={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: NERO.teal, mt: 2, mb: 1 }}>
                        Trace interne Chain-of-Thought
                      </Typography>
                      <Box
                        component="pre"
                        sx={{
                          m: 0,
                          p: 2,
                          borderRadius: 2,
                          bgcolor: '#0B0A08',
                          border: '1px solid rgba(108,168,201,0.2)',
                          color: '#BFE0EE',
                          fontFamily: MONO,
                          fontSize: 10.5,
                          lineHeight: 1.7,
                          maxHeight: 260,
                          overflow: 'auto',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {result.thoughtTrace}
                      </Box>
                    </AccordionDetails>
                  </Accordion>
                </CardContent>
              </Card>
            </Stack>
          )}
        </Box>

        {/* ===== FOOTER (NERO glow) ===== */}
        <Box
          component="footer"
          className="no-print"
          sx={{ position: 'relative', mt: 6, bgcolor: NERO.dark, color: 'rgba(255,255,255,0.7)', py: 5, px: 3, overflow: 'hidden' }}
        >
          <Box
            sx={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: '-40%',
              height: '80%',
              filter: 'blur(70px)',
              opacity: 0.5,
              background:
                'radial-gradient(closest-side, rgba(108,168,201,0.9), transparent 70%) 15% 50%/40% 100% no-repeat, radial-gradient(closest-side, rgba(255,170,120,0.8), transparent 70%) 50% 60%/40% 100% no-repeat, radial-gradient(closest-side, rgba(150,120,230,0.8), transparent 70%) 85% 50%/40% 100% no-repeat',
            }}
          />
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            justifyContent="space-between"
            alignItems={{ xs: 'center', md: 'center' }}
            sx={{ position: 'relative', zIndex: 2, maxWidth: 1160, mx: 'auto', textAlign: { xs: 'center', md: 'left' } }}
          >
            <Stack direction="row" spacing={1.25} alignItems="center">
              <Box sx={{ width: 30, height: 30, borderRadius: 2, display: 'grid', placeItems: 'center', background: `linear-gradient(135deg, ${NERO.teal}, ${NERO.tealDeep})` }}>
                <MemoryIcon sx={{ color: '#fff', fontSize: 18 }} />
              </Box>
              <Typography sx={{ color: '#fff', fontWeight: 900 }}>
                Soumission
                <Box component="span" sx={{ color: NERO.teal }}>
                  AI
                </Box>
                -DZ
              </Typography>
            </Stack>
            <Typography sx={{ fontSize: 12.5 }}>
              Conforme à la Loi n° 23-12 du 5 août 2023 · Licence Apache-2.0
            </Typography>
            <Stack direction="row" spacing={0.75} alignItems="center">
              <InfoOutlinedIcon sx={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }} />
              <Typography sx={{ fontSize: 12.5 }}>Développé pour la communauté open-source algérienne 🇩🇿</Typography>
            </Stack>
          </Stack>
        </Box>
      </Box>
    </ThemeProvider>
  );
}
