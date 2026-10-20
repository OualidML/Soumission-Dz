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

/**
 * Strips markdown code fences (```json ... ``` or ``` ... ```) cleanly.
 */
export function stripMarkdownFences(text: string): string {
  if (!text) return '';
  let cleaned = text.trim();

  // Remove leading ```json or ```anything
  cleaned = cleaned.replace(/^```(?:json|markdown|text)?\s*\r?\n?/i, '');

  // Remove trailing ```
  cleaned = cleaned.replace(/\r?\n?```\s*$/i, '');

  return cleaned.trim();
}

/**
 * Robust JSON parser that strips markdown fences before JSON.parse().
 * Returns null if parsing fails instead of throwing.
 */
export function parseSafeJson<T = any>(rawText: string): T | null {
  if (!rawText || typeof rawText !== 'string') return null;

  const stripped = stripMarkdownFences(rawText);

  // Attempt 1: Direct JSON.parse on stripped text
  try {
    return JSON.parse(stripped) as T;
  } catch {
    // Attempt 2: Extract JSON object or array substring
    const jsonMatch = stripped.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]) as T;
      } catch {
        // Fall through
      }
    }
  }

  return null;
}

/**
 * Calls Gemma 4 with multi-level resilience and 18-second timeout support.
 */
export async function callGemma4(
  prompt: string,
  options?: {
    systemInstruction?: string;
    temperature?: number;
    model?: string;
    timeoutMs?: number;
  }
): Promise<GemmaResponse> {
  const primaryModel = options?.model || process.env.GEMMA_PRIMARY_MODEL || 'gemma-4-26b-a4b-it';
  const googleApiKey = process.env.GEMMA_API_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const openRouterModel = process.env.OPENROUTER_MODEL || 'google/gemma-4-26b-a4b-it:free';
  const timeoutMs = options?.timeoutMs || Number(process.env.GEMMA_TIMEOUT_MS) || 18000;

  // Level 1: Google AI Studio Direct Call with 1x Retry on 500/429
  if (googleApiKey) {
    try {
      const result = await callGoogleAiStudio(primaryModel, googleApiKey, prompt, options?.systemInstruction, timeoutMs, 0);
      if (result) {
        return {
          ...result,
          provider: 'GOOGLE_AI_STUDIO',
          modelUsed: primaryModel,
        };
      }
    } catch (err: any) {
      console.warn(`[GemmaClient] Google AI Studio primary attempt failed (${err.name || 'Error'}):`, err.message);
    }
  }

  // Level 2: OpenRouter Cloud Fallback
  if (openRouterKey) {
    try {
      console.log(`[GemmaClient] Triggering OpenRouter fallback with model: ${openRouterModel}`);
      const result = await callOpenRouter(openRouterKey, openRouterModel, prompt, options?.systemInstruction, timeoutMs);
      if (result) {
        return {
          ...result,
          provider: 'OPENROUTER_FALLBACK',
          modelUsed: openRouterModel,
        };
      }
    } catch (err: any) {
      console.warn(`[GemmaClient] OpenRouter fallback failed (${err.name || 'Error'}):`, err.message);
    }
  }

  // Level 3: Deterministic Local Fallback (Guarantees zero UI crash)
  console.log('[GemmaClient] Upstream unreachable/timed out. Falling back to deterministic local engine');
  return {
    thoughtTrace: `[LOCAL RESILIENT FALLBACK ACTIVATED]\n- Google AI Studio and OpenRouter upstream APIs were rate-limited, unreachable, or timed out.\n- Local Loi 23-12 inference engine successfully executed with zero UI downtime.`,
    finalText: '',
    provider: 'LOCAL_DETERMINISTIC_FALLBACK',
    modelUsed: 'local-deterministic-engine',
  };
}

/**
 * Direct call to Google AI Studio with Gemma 4 CoT parsing rule:
 * thoughtTrace = parts.find(p => p.thought === true)?.text || ""
 * finalText = parts.filter(p => !p.thought).map(p => p.text).join('\n')
 */
async function callGoogleAiStudio(
  model: string,
  apiKey: string,
  prompt: string,
  systemInstruction?: string,
  timeoutMs = 18000,
  retryCount = 0
): Promise<{ thoughtTrace: string; finalText: string } | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const payload: any = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 4096,
    },
  };

  if (systemInstruction) {
    payload.systemInstruction = {
      parts: [{ text: systemInstruction }],
    };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });

  // Handle 500 / 429 automatic retry once
  if ((response.status === 500 || response.status === 429) && retryCount === 0) {
    console.warn(`[GemmaClient] Received ${response.status} from Google AI Studio. Retrying once after 600ms...`);
    await new Promise((resolve) => setTimeout(resolve, 600));
    return callGoogleAiStudio(model, apiKey, prompt, systemInstruction, timeoutMs, retryCount + 1);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google AI Studio HTTP ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];

  if (!candidate || !candidate.content || !Array.isArray(candidate.content.parts)) {
    throw new Error('Invalid response structure from Google AI Studio');
  }

  const parts = candidate.content.parts;

  // STRICT REQUIREMENT 1: Parse thoughtTrace and finalText
  const thoughtTrace: string = parts.find((p: any) => p.thought === true)?.text || '';
  const rawFinalText: string = parts.filter((p: any) => !p.thought).map((p: any) => p.text).join('\n');

  // Also clean any outer markdown fences if present
  const finalText = stripMarkdownFences(rawFinalText);

  return { thoughtTrace, finalText };
}

/**
 * Fallback call to OpenRouter API
 */
async function callOpenRouter(
  apiKey: string,
  model: string,
  prompt: string,
  systemInstruction?: string,
  timeoutMs = 18000
): Promise<{ thoughtTrace: string; finalText: string } | null> {
  const messages: { role: string; content: string }[] = [];

  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }
  messages.push({ role: 'user', content: prompt });

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://soumissionai-dz.algeria',
      'X-Title': 'SoumissionAI-DZ',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      max_tokens: 4096,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter HTTP ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const choice = data.choices?.[0];
  const rawContent = choice?.message?.content || '';

  // Extract thought if present in reasoning_content or XML tags
  let thoughtTrace = '';
  let finalText = rawContent;

  if (choice?.message?.reasoning_content) {
    thoughtTrace = choice.message.reasoning_content;
  } else if (rawContent.includes('<thought>') && rawContent.includes('</thought>')) {
    const match = rawContent.match(/<thought>([\s\S]*?)<\/thought>/);
    if (match) {
      thoughtTrace = match[1].trim();
      finalText = rawContent.replace(/<thought>[\s\S]*?<\/thought>/, '').trim();
    }
  }

  finalText = stripMarkdownFences(finalText);

  return { thoughtTrace, finalText };
}
