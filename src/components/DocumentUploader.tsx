'use client';

import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, CheckCircle2, AlertCircle, Eye, EyeOff, X, FileUp } from 'lucide-react';

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

    // Try loading pdf.js from CDN dynamically if not already on window
    try {
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
      if (pdfjsLib) {
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
        const pdf = await loadingTask.promise;
        const pageTexts: string[] = [];

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageStr = (textContent.items || [])
            .map((item: any) => {
              if (!item || typeof item.str !== 'string') return '';
              return item.str.replace(/\u0000/g, '');
            })
            .filter(Boolean)
            .join(' ');
          pageTexts.push(`--- Page ${i} ---\n${pageStr}`);
        }

        const fullText = pageTexts.join('\n\n').replace(/\u0000/g, '');
        if (fullText.trim().length > 30) {
          return fullText;
        }
      }
    } catch (cdnError) {
      console.warn('[DocumentUploader] PDF.js CDN failed, using stream fallback parser:', cdnError);
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
    <div className="space-y-2.5">
      {/* DRAG AND DROP ZONE */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-3.5 transition-all cursor-pointer flex flex-col items-center justify-center text-center ${
          isDragging
            ? 'border-cyan-400 bg-cyan-950/40 shadow-cyber-neon'
            : activeFileName
            ? 'border-emerald-600/80 bg-emerald-950/20'
            : 'border-slate-700/80 hover:border-cyan-500/60 bg-slate-950/60 hover:bg-slate-900/60'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt,.json,.md"
          className="hidden"
          onChange={handleFileChange}
        />

        <div className="flex items-center space-x-2 text-xs">
          {isProcessing ? (
            <div className="flex items-center space-x-2 text-cyan-400 font-mono">
              <span className="h-4 w-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
              <span>Extraction du texte PDF en cours (Client-Side Zero-Crash)...</span>
            </div>
          ) : activeFileName ? (
            <div className="flex items-center space-x-2 text-emerald-300">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span className="font-semibold font-mono text-emerald-400">{activeFileName}</span>
              <span className="text-[11px] text-slate-400">({extractedText.length.toLocaleString()} caractères extraits)</span>
            </div>
          ) : (
            <div className="flex items-center space-x-2 text-slate-300">
              <UploadCloud className="h-4 w-4 text-cyan-400" />
              <span className="font-semibold text-white">Glisser-déposer un Cahier des Charges PDF / TXT</span>
              <span className="text-slate-400">ou cliquez pour parcourir</span>
            </div>
          )}
        </div>

        <p className="text-[10px] text-slate-500 mt-1">
          Supporte PDF, TXT & JSON • Extraction 100% locale sécurisée (aucun fichier brut envoyé sur le réseau)
        </p>
      </div>

      {/* ERROR ALERT */}
      {errorMessage && (
        <div className="p-2 rounded-lg bg-red-950/60 border border-red-800 text-red-200 text-xs flex items-center space-x-2">
          <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* GREEN STATUS BADGE WHEN LOADED */}
      {activeFileName && (
        <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-emerald-950/60 border border-emerald-700/80 text-xs font-mono">
          <div className="flex items-center space-x-2 text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
            <span className="font-bold">
              ✅ Document PDF Chargé : {activeFileName} — Prêt pour l&apos;Audit Gemma 4
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowTextarea(!showTextarea);
              }}
              className="text-[11px] text-emerald-400 hover:text-emerald-300 underline flex items-center space-x-1"
            >
              {showTextarea ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              <span>{showTextarea ? 'Masquer texte' : 'Voir texte'}</span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClearFile();
              }}
              className="p-1 text-slate-400 hover:text-red-400 transition-colors"
              title="Réinitialiser le fichier"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* COLLAPSIBLE / EDITABLE EXTRACTED TEXT TEXTAREA */}
      {showTextarea && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span className="font-mono flex items-center space-x-1">
              <FileText className="h-3 w-3 text-cyan-400" />
              <span>📄 Texte Extrait du Cahier des Charges (Vérifiable / Modifiable) :</span>
            </span>
            <span className="text-[10px] font-mono text-slate-500">
              {extractedText.length} caractères • Modifiable en direct
            </span>
          </div>

          <textarea
            rows={4}
            value={extractedText}
            onChange={(e) => onTextExtracted(e.target.value, activeFileName || undefined)}
            placeholder="Le texte extrait de votre document PDF ou saisi manuellement s'affiche ici. Vous pouvez l'ajuster ou ajouter des clauses éliminatoires et des lignes de prix avant de lancer l'analyse..."
            className="w-full bg-slate-950 border border-slate-700/80 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono leading-relaxed"
          />
        </div>
      )}
    </div>
  );
}
