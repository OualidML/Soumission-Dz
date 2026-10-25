'use client';

import React, { useState, useRef } from 'react';
import {
  Box,
  Stack,
  Typography,
  TextField,
  Button,
  Chip,
  Alert,
  CircularProgress,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DescriptionIcon from '@mui/icons-material/Description';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import CloseIcon from '@mui/icons-material/Close';

import { NERO } from '@/theme';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

interface DocumentUploaderProps {
  extractedText: string;
  onTextExtracted: (text: string, fileName?: string) => void;
  activeFileName: string | null;
  onClearFile: () => void;
}

export function DocumentUploader({
  extractedText,
  onTextExtracted,
  activeFileName,
  onClearFile,
}: DocumentUploaderProps) {
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [showTextarea, setShowTextarea] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Client-side PDF text extraction using PDF.js via CDN with local buffer fallback.
   * Completely runs in browser - zero server-side canvas or pdf-parse issues!
   */
  const extractTextFromPdf = async (file: File): Promise<string> => {
    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    // Try client-side PDF.js with 8-second Promise.race timeout
    try {
      const pdfJsExtractionPromise = (async (): Promise<string> => {
        if (!(window as any).pdfjsLib) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
            script.onload = () => {
              const pdfjs = (window as any).pdfjsLib;
              if (pdfjs) {
                pdfjs.GlobalWorkerOptions.workerSrc =
                  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
              }
              resolve();
            };
            script.onerror = () => reject(new Error('Failed to load pdf.js from CDN'));
            document.head.appendChild(script);
          });
        }

        const pdfjsLib = (window as any).pdfjsLib;
        if (!pdfjsLib) {
          throw new Error('pdfjsLib is undefined after script load');
        }

        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
        const pdf = await loadingTask.promise;
        const pageTexts: string[] = [];

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageStr = (textContent.items || [])
            .map((item: any) => {
              if (!item || typeof item.str !== 'string') return '';
              const clean = item.str.replace(/\u0000/g, '');
              return item.hasEOL ? `${clean}\n` : `${clean} `;
            })
            .join('')
            .replace(/[ \t]+\n/g, '\n')
            .trim();
          pageTexts.push(`--- Page ${i} ---\n${pageStr}`);
        }

        const fullText = pageTexts.join('\n\n').replace(/\u0000/g, '');
        if (fullText.trim().length > 30) {
          return fullText;
        }
        throw new Error('Extracted PDF text is too short or empty');
      })();

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('PDF extraction timed out after 8s limit')), 8000)
      );

      const resultText = await Promise.race([pdfJsExtractionPromise, timeoutPromise]);
      if (resultText) {
        return resultText;
      }
    } catch (cdnOrTimeoutError) {
      console.warn(
        '[DocumentUploader] PDF.js CDN failed or timed out (8s limit), falling back to client-side stream parser:',
        cdnOrTimeoutError
      );
    }

    // Fallback: Client-side binary stream decoder for text blocks in PDF streams
    try {
      const decoder = new TextDecoder('latin1');
      const rawString = decoder.decode(arrayBuffer);

      // Extract text in BT ... ET blocks or string literals ( ... )
      const extractedChunks: string[] = [];
      const streamRegex = /BT[\s\S]*?ET/g;
      const matches = rawString.match(streamRegex);

      if (matches && matches.length > 0) {
        for (const block of matches) {
          const textMatches = block.match(/\(([^()]+)\)/g);
          if (textMatches) {
            const blockText = textMatches
              .map((m) => (m ? m.slice(1, -1) : ''))
              .join(' ')
              .replace(/\\r|\\n/g, ' ')
              .replace(/\\/g, '')
              .replace(/\u0000/g, '');
            if (blockText.trim().length > 2) {
              extractedChunks.push(blockText);
            }
          }
        }
      }

      if (extractedChunks.length > 0) {
        return `[Extrait PDF (Mode Dégradé Sécurisé)]\n${extractedChunks.join('\n')}`.replace(/\u0000/g, '');
      }
    } catch (fallbackErr) {
      console.error('[DocumentUploader] Fallback parser failed:', fallbackErr);
    }

    // Ultimate fallback if PDF contains only scanned imagery
    return `[CAHIER DES CHARGES REÇU : ${file.name}]\nDocument PDF reçu (${(file.size / 1024).toFixed(1)} KB). Veuillez vérifier ou ajuster le texte ci-dessous pour l'audit Loi n° 23-12.`;
  };

  const handleFile = async (file: File) => {
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      let text = '';
      if (file.name.toLowerCase().endsWith('.pdf')) {
        text = await extractTextFromPdf(file);
      } else {
        // Plain text, JSON, or markdown
        text = await file.text();
      }

      const sanitizedText = (text || '').replace(/\u0000/g, '');
      onTextExtracted(sanitizedText, file.name);
      setShowTextarea(true);
    } catch (err: any) {
      console.error('File extraction error:', err);
      setErrorMessage(`Impossible d'extraire le document : ${err.message || 'Erreur de lecture'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await handleFile(files[0]);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await handleFile(files[0]);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      {/* DRAG AND DROP ZONE */}
      <Box
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        sx={{
          border: '2px dashed',
          borderColor: isDragging
            ? NERO.tealDeep
            : activeFileName
            ? 'rgba(31,122,85,0.5)'
            : NERO.line,
          bgcolor: isDragging
            ? 'rgba(108,168,201,0.12)'
            : activeFileName
            ? 'rgba(238,247,242,0.7)'
            : NERO.paper,
          borderRadius: 3,
          p: 1.75,
          cursor: 'pointer',
          textAlign: 'center',
          transition: 'all .2s',
          '&:hover': { borderColor: NERO.teal, bgcolor: 'rgba(108,168,201,0.06)' },
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt,.json,.md"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        {isProcessing ? (
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="center">
            <CircularProgress size={16} sx={{ color: NERO.tealDeep }} />
            <Typography sx={{ fontSize: 12, fontFamily: MONO, color: NERO.tealDeep }}>
              Extraction du texte PDF en cours (client-side)...
            </Typography>
          </Stack>
        ) : activeFileName ? (
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
            <CheckCircleIcon sx={{ fontSize: 18, color: NERO.success }} />
            <Typography sx={{ fontSize: 12.5, fontWeight: 800, fontFamily: MONO, color: NERO.success }}>
              {activeFileName}
            </Typography>
            <Typography sx={{ fontSize: 11, color: NERO.muted }}>
              ({extractedText.length.toLocaleString('fr-DZ')} caractères extraits)
            </Typography>
          </Stack>
        ) : (
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
            <CloudUploadIcon sx={{ fontSize: 20, color: NERO.tealDeep }} />
            <Typography sx={{ fontSize: 12.5, fontWeight: 800, color: NERO.ink }}>
              Glisser-déposer un cahier des charges PDF / TXT
            </Typography>
            <Typography sx={{ fontSize: 11.5, color: NERO.muted }}>ou cliquez pour parcourir</Typography>
          </Stack>
        )}

        <Typography sx={{ fontSize: 10, color: NERO.muted, mt: 0.5 }}>
          PDF, TXT & JSON · extraction 100% locale sécurisée (aucun fichier brut envoyé)
        </Typography>
      </Box>

      {/* ERROR ALERT */}
      {errorMessage && (
        <Alert
          severity="error"
          icon={<ErrorOutlineIcon sx={{ fontSize: 18 }} />}
          sx={{
            py: 0.25,
            borderRadius: 2,
            bgcolor: NERO.dangerSoft,
            color: NERO.danger,
            fontSize: 11.5,
            '& .MuiAlert-icon': { color: NERO.danger },
          }}
        >
          {errorMessage}
        </Alert>
      )}

      {/* STATUS BADGE WHEN LOADED */}
      {activeFileName && (
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{
            px: 1.5,
            py: 0.75,
            borderRadius: 2.5,
            bgcolor: NERO.successSoft,
            border: '1px solid rgba(31,122,85,0.25)',
            flexWrap: 'wrap',
            rowGap: 0.5,
          }}
        >
          <Stack direction="row" spacing={0.75} alignItems="center">
            <CheckCircleIcon sx={{ fontSize: 15, color: NERO.success }} />
            <Typography sx={{ fontSize: 11, fontWeight: 700, color: NERO.success }}>
              Document chargé — prêt pour l&apos;audit
            </Typography>
            <Chip
              size="small"
              label={activeFileName}
              sx={{ height: 20, fontFamily: MONO, fontSize: 9.5, bgcolor: 'rgba(31,122,85,0.1)', color: NERO.success }}
            />
          </Stack>

          <Stack direction="row" spacing={0.5} alignItems="center">
            <Button
              type="button"
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                setShowTextarea(!showTextarea);
              }}
              startIcon={showTextarea ? <VisibilityOffIcon sx={{ fontSize: 13 }} /> : <VisibilityIcon sx={{ fontSize: 13 }} />}
              sx={{ minHeight: 24, py: 0, px: 1, fontSize: 10.5, color: NERO.success, fontWeight: 600 }}
            >
              {showTextarea ? 'Masquer texte' : 'Voir texte'}
            </Button>

            <Button
              type="button"
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onClearFile();
              }}
              title="Réinitialiser le fichier"
              sx={{ minWidth: 26, minHeight: 26, p: 0, color: NERO.muted, '&:hover': { color: NERO.danger } }}
            >
              <CloseIcon sx={{ fontSize: 15 }} />
            </Button>
          </Stack>
        </Stack>
      )}

      {/* COLLAPSIBLE / EDITABLE EXTRACTED TEXT */}
      {showTextarea && (
        <Box>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5, flexWrap: 'wrap', rowGap: 0.25 }}>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <DescriptionIcon sx={{ fontSize: 13, color: NERO.tealDeep }} />
              <Typography sx={{ fontSize: 10.5, fontFamily: MONO, color: NERO.muted }}>
                Texte extrait (vérifiable / modifiable)
              </Typography>
            </Stack>
            <Typography sx={{ fontSize: 10, fontFamily: MONO, color: NERO.muted }}>
              {extractedText.length} caractères
            </Typography>
          </Stack>

          <TextField
            fullWidth
            multiline
            rows={4}
            value={extractedText}
            onChange={(e) => onTextExtracted(e.target.value, activeFileName || undefined)}
            placeholder="Le texte extrait de votre document PDF ou saisi manuellement s'affiche ici. Vous pouvez l'ajuster ou ajouter des clauses éliminatoires et des lignes de prix avant de lancer l'analyse..."
            sx={{
              '& .MuiOutlinedInput-root': { bgcolor: '#fff', borderRadius: 2.5 },
              '& textarea': { fontFamily: MONO, fontSize: 11.5, lineHeight: 1.6 },
            }}
          />
        </Box>
      )}
    </Box>
  );
}
