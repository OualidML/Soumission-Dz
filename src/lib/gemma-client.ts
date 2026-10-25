/**
 * Resilient Google Gemma 4 Client with Dual-Pass Chain-of-Thought Extraction,
 * Markdown Fence Stripping, Retry on 500/429, OpenRouter Cloud Failover,
 * and Deterministic Local Fallback.
 */

export interface GemmaResponse {
  thoughtTrace: string;
  finalText: string;
  provider: 'GOOGLE_AI_STUDIO' | 'OPENROUTER_FALLBACK' | 'LOCAL_DETERMINISTIC_FALLBACK';
  modelUsed: string;
  error?: string;
}

export function stripMarkdownFences(text: string): string {
  if (!text) return '';
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json|markdown|text)?\s*\r?\n?/i, '');
  cleaned = cleaned.replace(/\r?\n?```\s*$/i, '');
  return cleaned.trim();
}

export function parseSafeJson<T = any>(rawText: string): T | null {
  if (!rawText || typeof rawText !== 'string') return null;

  let cleaned = rawText.trim();

  const startBracket = cleaned.indexOf('{');
  const endBracket = cleaned.lastIndexOf('}');

  if (startBracket !== -1 && endBracket !== -1 && endBracket > startBracket) {
    cleaned = cleaned.substring(startBracket, endBracket + 1);
  }

  try {
    return JSON.parse(cleaned) as T;
  } catch (e) {
    try {
      const fixedJson = cleaned
        .replace(/,\s*([\]}])/g, '$1') 
        .replace(/(\w+):\s*"/g, '"$1": "'); 
      return JSON.parse(fixedJson) as T;
    } catch (finalError) {
      console.error("[GemmaClient] JSON Parsing failed completely. Raw text was:", rawText);
      return null;
    }
  }
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Fetch timed out after ${timeoutMs}ms`)), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function callGoogleAiStudio(model: string, apiKey: string, prompt: string, systemInstruction?: string, timeoutMs = 8000, retryCount = 0): Promise<{ thoughtTrace: string; finalText: string } | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const payload: any = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
  };
  if (systemInstruction) payload.systemInstruction = { parts: [{ text: systemInstruction }] };

  const response = await fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }, timeoutMs);

  if ((response.status === 500 || response.status === 429) && retryCount === 0) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return callGoogleAiStudio(model, apiKey, prompt, systemInstruction, timeoutMs, retryCount + 1);
  }

  if (!response.ok) return null;

  const data = await response.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  const thoughtTrace = parts.find((p: any) => p.thought === true)?.text || '';
  const rawFinalText = parts.filter((p: any) => !p.thought).map((p: any) => p.text).join('\n');
  return { thoughtTrace, finalText: stripMarkdownFences(rawFinalText) };
}

async function callOpenRouter(apiKey: string, model: string, prompt: string, systemInstruction?: string, timeoutMs = 8000): Promise<{ thoughtTrace: string; finalText: string } | null> {
  const messages: any[] = [];
  if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });
  messages.push({ role: 'user', content: prompt });

  const response = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: 4096 }),
  }, timeoutMs);

  if (!response.ok) return null;
  const data = await response.json();
  const choice = data.choices?.[0]?.message;
  const rawContent = choice?.content || '';
  let thoughtTrace = choice?.reasoning_content || '';
  let finalText = rawContent;
  if (rawContent.includes('<thought>')) {
    const match = rawContent.match(/<thought>([\s\S]*?)<\/thought>/);
    if (match) {
      thoughtTrace = match[1].trim();
      finalText = rawContent.replace(/<thought>[\s\S]*?<\/thought>/, '').trim();
    }
  }
  return { thoughtTrace, finalText: stripMarkdownFences(finalText) };
}

export const gemmaClient = {
  async generate(
    prompt: string,
    options?: { systemInstruction?: string; model?: string; timeoutMs?: number; fallbackText?: string }
  ): Promise<GemmaResponse> {
    const googleApiKey = process.env.GEMMA_API_KEY || process.env.GOOGLE_API_KEY;
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    const openRouterModel = process.env.OPENROUTER_MODEL || 'google/gemma-3-27b-it:free';
    const timeoutMs = options?.timeoutMs || Number(process.env.GEMMA_TIMEOUT_MS) || 8000;

    const googleModelCascade = [
      options?.model || process.env.GEMMA_PRIMARY_MODEL || 'gemma-4-26b-a4b-it',
      'gemma-3-27b-it',
      'gemini-2.5-flash',
    ];

    if (googleApiKey) {
      for (const model of googleModelCascade) {
        try {
          const result = await callGoogleAiStudio(model, googleApiKey, prompt, options?.systemInstruction, timeoutMs);
          if (result) return { ...result, provider: 'GOOGLE_AI_STUDIO', modelUsed: model };
        } catch (err) { }
      }
    }

    if (openRouterKey) {
      try {
        const result = await callOpenRouter(openRouterKey, openRouterModel, prompt, options?.systemInstruction, timeoutMs);
        if (result) return { ...result, provider: 'OPENROUTER_FALLBACK', modelUsed: openRouterModel };
      } catch (err) { }
    }

    return {
      thoughtTrace: `[LOCAL RESILIENT FALLBACK ACTIVATED]\nCloud providers unreachable. Using deterministic baseline engine (<50ms).`,
      finalText:
        options?.fallbackText ??
        JSON.stringify({
          tenderTitle: 'Tender (Local Fallback)',
          tenderReference: 'N/A',
          issuingAuthority: 'Unknown',
          requiredTurnover: null,
          requiredCategory: null,
          requiredCertifications: [],
          maxDeadlineDays: null,
          envelopeBText: '',
        }),
      provider: 'LOCAL_DETERMINISTIC_FALLBACK',
      modelUsed: 'local-deterministic-engine',
    };
  },
  stripMarkdownFences,
  parseSafeJson
};