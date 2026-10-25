'use client';

import React, { useState, useEffect, useRef } from 'react';
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
import { TenderData, CompanyProfile, AnalysisResponse, EnvelopeKey, AuditFinding } from '@/lib/types';
import { formatDZD } from '@/lib/bpu-math';
import { DocumentUploader } from '@/components/DocumentUploader';

const MONO = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

function Serif({ children }: { children: React.ReactNode }) {
  return <span className="serif-accent">{children}</span>;
}

const ENVELOPE_STATUS: Record<
  string,
  { label: string; bg: string; color: string; border: string; icon: React.ReactNode }
> = {
  COMPLIANT: {
    label: 'CONFORME',
    bg: NERO.successSoft,
    color: NERO.success,
    border: 'rgba(31,122,85,0.28)',
    icon: <CheckCircleOutlineIcon sx={{ fontSize: 14 }} />,
  },
  EXEMPTED: {
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

function StatusChip({ status }: { status: string }) {
  const meta = ENVELOPE_STATUS[status] || ENVELOPE_STATUS.WARNING;
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

  const abortControllerRef = useRef<AbortController | null>(null);
  const stepTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearStepTimers = () => {
    stepTimersRef.current.forEach((id) => clearTimeout(id));
    stepTimersRef.current = [];
  };

  const currentTender = isCustomMode
    ? {
        id: 'custom-tender',
        reference: 'CUSTOM/2026/DZ',
        title: 'Cahier des charges personnalisé',
        authority: "Maître d'Ouvrage",
        RawText: customText,
      }
    : tenders.find((t) => t.id === selectedTenderId) || tenders[0];

  const currentProfile = profiles.find((p) => p.id === selectedProfileId) || profiles[0];

  useEffect(() => {
    runAudit(selectedTenderId, selectedProfileId);
    return () => {
      abortControllerRef.current?.abort();
      clearStepTimers();
    };
  }, []);

  const runAudit = async (
    tenderIdToUse = selectedTenderId,
    profileIdToUse = selectedProfileId,
    overrideText?: string,
    overrideFileName?: string
  ) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    clearStepTimers();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setErrorMsg(null);
    setStepMessage('1/4 Extraction des données et segmentation Loi 23-12...');

    try {
      const activeText = overrideText !== undefined ? overrideText : customText;
      const activeFileName = overrideFileName !== undefined ? overrideFileName : uploadedFileName;

      const isCustom = inputTab === 'pdf' || isCustomMode || tenderIdToUse === 'custom-tender' || (!!activeText && activeText.trim().length > 0);

      const activeT = isCustom
        ? {
            id: 'custom-tender',
            reference: activeFileName ? `DOC-${activeFileName.slice(0, 8)}/2026` : 'CUSTOM/2026/DZ',
            title: activeFileName ? `Cahier des Charges — ${activeFileName}` : 'Cahier des charges personnalisé',
            authority: 'Commission des Marchés Publics',
            RawText: activeText || "Cahier des charges...",
          }
        : tenders.find((t) => t.id === tenderIdToUse) || tenders[0];

      const activeP = profiles.find((p) => p.id === profileIdToUse) || profiles[0];

      stepTimersRef.current = [
        setTimeout(() => setStepMessage('2/4 Audit arithmétique BPU/DQE (Determinisme)...'), 400),
        setTimeout(() => setStepMessage('3/4 Analyse légale & Capacités (Loi 23-12)...'), 800),
        setTimeout(() => setStepMessage('4/4 Génération du Mémoire Technique...'), 1200),
      ];

      const payloadText = isCustom ? (activeText || activeT.RawText) : activeT.RawText;

      const res = await fetch('/api/analyze-tender', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenderData: { ...activeT, RawText: payloadText },
          companyProfile: activeP,
          rawTenderText: payloadText,
          rawText: payloadText,
          declaredTotalHT: 0,
        }),
        signal: controller.signal,
      });

      const rawJson = await res.json().catch(() => ({}));
      if (!res.ok || rawJson?.success === false) {
        throw new Error(rawJson?.error || `Erreur serveur HTTP ${res.status}`);
      }

      const data: AnalysisResponse = rawJson?.data || rawJson;
      if (abortControllerRef.current === controller) {
        setResult(data);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      if (abortControllerRef.current === controller) {
        setErrorMsg(err.message || "Une erreur est survenue");
      }
    } finally {
      if (abortControllerRef.current === controller) {
        clearStepTimers();
        setIsLoading(false);
        setStepMessage('');
      }
    }
  };

  const copyMemoireToClipboard = () => {
    if (!result?.finalReport) return;
    navigator.clipboard.writeText(result.finalReport);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  };

  const handlePrint = () => window.print();

  const getEnvelopeItems = (envelope: EnvelopeKey) => {
    if (!result?.legalAudit?.findings) return [];
    
    return result.legalAudit.findings.map((f: AuditFinding) => {
      let targetEnvelope: EnvelopeKey = 'ENVELOPE_C'; 
      
      if (f.category === 'LEGAL') {
        const msg = f.message.toLowerCase();
        if (msg.includes('candidature') || msg.includes('certificat') || msg.includes('catégorie')) {
          targetEnvelope = 'ENVELOPE_A';
        } else if (msg.includes('mémoire') || msg.includes('planning') || msg.includes('technique')) {
          targetEnvelope = 'ENVELOPE_B';
        } else {
          targetEnvelope = 'ENVELOPE_C';
        }
      } else if (f.category === 'FINANCIAL') {
        targetEnvelope = 'ENVELOPE_C';
      } else if (f.category === 'TECHNICAL') {
        targetEnvelope = 'ENVELOPE_B';
      } else {
        targetEnvelope = 'ENVELOPE_A';
      }

      return {
        id: f.id,
        label: f.message,
        details: f.legalBasis,
        legalReference: f.legalBasis,
        status: f.level === 'FATAL' ? 'NON_COMPLIANT' : 'WARNING',
        category: targetEnvelope
      };
    });
  };

  const currentFindings = getEnvelopeItems(activeEnvelope).filter(item => item.category === activeEnvelope);
  const isCritical = result?.legalAudit?.verdict === 'CRITICAL_DISQUALIFICATION_WARNING' || result?.legalAudit?.verdict === 'REJECTED';
  const fatalTraps = result?.legalAudit?.findings || [];

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: NERO.paper }}>
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

        <Box component="main" sx={{ width: '100%', maxWidth: 1160, mx: 'auto', px: { xs: 2, sm: 3 }, py: { xs: 4, md: 6 }, flex: 1 }}>
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
          </Stack>

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
                      sx={{ '& .MuiSelect-select': { fontSize: 12.5 } }}
                    >
                      {tenders.map((t) => (
                        <MenuItem key={t.id} value={t.id} sx={{ fontSize: 12.5 }}>
                          [{t.reference}] {t.title}
                        </MenuItem>
                      ))}
                    </TextField>
                  )}
                </Box>

                <Box sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.75 }}>
                    <BusinessIcon sx={{ fontSize: 15, color: NERO.success }} />
                    <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: NERO.muted }}>
                      2. Entreprise
                    </Typography>
                  </Stack>
                  <TextField
                    select
                    fullWidth
                    value={selectedProfileId}
                    onChange={(e) => setSelectedProfileId(e.target.value)}
                    sx={{ '& .MuiSelect-select': { fontSize: 12.5 } }}
                  >
                    {profiles.map((p) => (
                      <MenuItem key={p.id} value={p.id} sx={{ fontSize: 12.5 }}>
                        {p.name}
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
                    '&:hover': { background: isLoading ? '#E4E0D7' : `linear-gradient(135deg, ${NERO.teal}, #2c5f7b)` },
                  }}
                >
                  {isLoading ? <CircularProgress size={15} sx={{ color: NERO.muted, mr: 1 }} /> : "Lancer l'audit"}
                </Button>
              </Box>
            </CardContent>
          </Card>

          {errorMsg && (
            <Alert severity="error" sx={{ mb: 3, borderRadius: 3, bgcolor: NERO.dangerSoft, color: NERO.danger }}>
              <Typography sx={{ fontWeight: 800, fontSize: 13 }}>Erreur lors de l'exécution</Typography>
              <Typography sx={{ fontFamily: MONO, fontSize: 12 }}>{errorMsg}</Typography>
            </Alert>
          )}

          {result && (
            <Stack spacing={3.5}>
              <Card sx={{ bgcolor: isCritical ? '#FCF1EF' : NERO.successSoft, border: `1px solid ${isCritical ? 'rgba(179,38,30,0.25)' : 'rgba(31,122,85,0.22)'}` }}>
                <CardContent sx={{ p: 3 }}>
                  <Stack direction={{ xs: 'column', lg: 'row' }} spacing={4} alignItems="center" justifyContent="space-between">
                    <Stack direction="row" spacing={2} alignItems="flex-start">
                      <Box sx={{ width: 56, height: 56, borderRadius: 3, display: 'grid', placeItems: 'center', bgcolor: isCritical ? 'rgba(179,38,30,0.1)' : 'rgba(31,122,85,0.1)', border: `1px solid ${isCritical ? 'rgba(179,38,30,0.3)' : 'rgba(31,122,85,0.28)'}` }}>
                        {isCritical ? <GppMaybeIcon sx={{ color: NERO.danger, fontSize: 30 }} /> : <VerifiedIcon sx={{ color: NERO.success, fontSize: 30 }} />}
                      </Box>
                      <Box>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
                          <Chip size="small" label={result.legalAudit?.verdict} sx={{ bgcolor: isCritical ? 'rgba(179,38,30,0.12)' : 'rgba(31,122,85,0.12)', color: isCritical ? NERO.danger : NERO.success, fontFamily: MONO, fontSize: 10.5, fontWeight: 800 }} />
                          <Typography sx={{ fontFamily: MONO, fontSize: 11, color: NERO.muted }}>Seuil COPEO : 15% max</Typography>
                        </Stack>
                        <Typography sx={{ fontSize: 20, fontWeight: 800, color: NERO.ink }}>
                          {isCritical ? 'Défaut éliminatoire majeur détecté' : 'Dossier conforme aux prescriptions'}
                        </Typography>
                        <Typography sx={{ fontSize: 13, color: NERO.muted }}>{result.finalReport?.slice(0, 200)}...</Typography>
                      </Box>
                    </Stack>
                    <RiskGauge value={result.legalAudit?.eliminationRisk || 0} />
                  </Stack>

                  {fatalTraps.length > 0 && (
                    <Box sx={{ mt: 2.5, pt: 2.5, borderTop: `1px dashed rgba(179,38,30,0.3)` }}>
                      <Typography sx={{ fontSize: 11, fontWeight: 900, color: NERO.danger, mb: 1.5, textTransform: 'uppercase' }}>Pièges fatals relevés</Typography>
                      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5 }}>
                        {fatalTraps.map((trap: AuditFinding, idx: number) => (
                          <Box key={idx} sx={{ bgcolor: 'rgba(255,255,255,0.7)', border: '1px solid rgba(179,38,30,0.22)', borderRadius: 3, p: 2 }}>
                            <Typography sx={{ fontSize: 11.5, fontWeight: 800, color: NERO.danger, fontFamily: MONO }}>{trap.id}</Typography>
                            <Typography sx={{ fontSize: 12.5, color: NERO.ink, fontWeight: 600, mb: 0.5 }}>{trap.message}</Typography>
                            <Typography sx={{ fontSize: 11, color: NERO.muted, fontStyle: 'italic' }}>{trap.legalBasis}</Typography>
                            <Typography sx={{ fontSize: 11.5, color: NERO.warning, fontWeight: 700, mt: 0.5 }}>→ {trap.correctiveAction}</Typography>
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  )}
                </CardContent>
              </Card>

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '7fr 5fr' }, gap: 3 }}>
                <Card sx={{ display: 'flex', flexDirection: 'column' }}>
                  <CardContent sx={{ p: 3 }}>
                    <Tabs value={activeEnvelope} onChange={(_, v) => setActiveEnvelope(v as any)} sx={{ borderBottom: `1px solid ${NERO.line}` }}>
                      <Tab value="ENVELOPE_A" label="1. Candidature" />
                      <Tab value="ENVELOPE_B" label="2. Offre technique" />
                      <Tab value="ENVELOPE_C" label="3. Offre financière" />
                    </Tabs>
                    <Box sx={{ mt: 2 }}>
                      {currentFindings.map((item, idx) => (
                        <Box key={idx} sx={{ p: 1.5, mb: 1, borderRadius: 2, border: `1px solid ${NERO.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Box>
                            <Typography sx={{ fontSize: 12, fontWeight: 700 }}>{item.label}</Typography>
                            <Typography sx={{ fontSize: 10, color: NERO.muted }}>{item.details}</Typography>
                          </Box>
                          <StatusChip status={item.status} />
                        </Box>
                      ))}
                      {currentFindings.length === 0 && <Typography sx={{ textAlign: 'center', py: 3, color: NERO.muted, fontSize: 12 }}>Aucune anomalie détectée pour cette enveloppe.</Typography>}
                    </Box>
                  </CardContent>
                </Card>

                <Card sx={{ display: 'flex', flexDirection: 'column' }}>
                  <CardContent sx={{ p: 3 }}>
                    <Typography sx={{ fontSize: 12.5, fontWeight: 900, mb: 2, textTransform: 'uppercase' }}>Audit BPU & DQE</Typography>
                    {result.bpuAudit.status === 'BPU_DATA_NOT_FOUND' ? (
                      <Alert severity="warning" sx={{ borderRadius: 2, fontSize: 11 }}>BPU non extrait du document.</Alert>
                    ) : (
                      <TableContainer>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell sx={{ fontSize: 10, fontFamily: MONO }}>Code</TableCell>
                              <TableCell sx={{ fontSize: 10, fontFamily: MONO }}>Calculé</TableCell>
                              <TableCell sx={{ fontSize: 10, fontFamily: MONO }}>Diff</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {result.bpuAudit.rows.map((row: any, idx: number) => (
                              <TableRow key={idx}>
                                <TableCell sx={{ px: 0.75, fontFamily: MONO }}>{row.code}</TableCell>
                                <TableCell sx={{ px: 0.75, fontFamily: MONO }}>{formatDZD(row.computedTotalHT)}</TableCell>
                                <TableCell sx={{ px: 0.75, fontFamily: MONO, color: row.isError ? NERO.danger : NERO.success }}>
                                  {formatDZD(row.diff)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}
                    <Divider sx={{ my: 2 }} />
                    <Stack spacing={1} sx={{ fontFamily: MONO }}>
                      <Stack direction="row" justifyContent="space-between">
                        <Typography sx={{ fontSize: 11, color: NERO.muted }}>Total HT Calculé</Typography>
                        <Typography sx={{ fontSize: 11, fontWeight: 800 }}>{formatDZD(result.bpuAudit.totalHTComputed)}</Typography>
                      </Stack>
                      <Stack direction="row" justifyContent="space-between">
                        <Typography sx={{ fontSize: 11, color: NERO.muted }}>Total TTC</Typography>
                        <Typography sx={{ fontSize: 11, fontWeight: 800, color: NERO.tealDeep }}>{formatDZD(result.bpuAudit.totalTTC)}</Typography>
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              </Box>

              <Card>
                <CardContent sx={{ p: 3 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                    <Typography sx={{ fontSize: 13.5, fontWeight: 900, textTransform: 'uppercase' }}>Mémoire technique justificatif</Typography>
                    <Stack direction="row" spacing={1}>
                      <Button size="small" onClick={copyMemoireToClipboard} startIcon={<ContentCopyIcon sx={{ fontSize: 15 }} />} sx={{ fontSize: 11 }}>{isCopied ? 'Copié !' : 'Copier'}</Button>
                      <Button size="small" onClick={handlePrint} startIcon={<PrintIcon sx={{ fontSize: 15 }} />} sx={{ fontSize: 11 }}>Imprimer</Button>
                    </Stack>
                  </Stack>
                  <Box sx={{ bgcolor: NERO.paper, border: `1px solid ${NERO.line}`, borderRadius: 3, p: 3, maxHeight: 380, overflowY: 'auto', whiteSpace: 'pre-wrap', fontFamily: MONO, fontSize: 11.5, lineHeight: 1.75, color: '#2B2820' }}>
                    {result.finalReport}
                  </Box>
                  <Accordion expanded={isTerminalExpanded} onChange={(_, exp) => setIsTerminalExpanded(exp)} sx={{ mt: 2, bgcolor: NERO.dark, color: '#BFE0EE' }}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: NERO.teal }} />}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <TerminalIcon sx={{ fontSize: 17, color: NERO.teal }} />
                        <Typography sx={{ fontSize: 12, fontWeight: 700, fontFamily: MONO }}>Terminal Agent — Trace Gemma 4</Typography>
                      </Stack>
                    </AccordionSummary>
                    <AccordionDetails sx={{ pt: 0 }}>
                      <Box component="pre" sx={{ p: 2, borderRadius: 2, bgcolor: '#0B0A08', color: '#BFE0EE', fontFamily: MONO, fontSize: 10.5, whiteSpace: 'pre-wrap' }}>
                        {result.thoughtTrace}
                      </Box>
                    </AccordionDetails>
                  </Accordion>
                </CardContent>
              </Card>
            </Stack>
          )}
        </Box>
      </Box>
    </ThemeProvider>
  );
}