import type { ObservabilityIssue } from '../self/analyze';

type AIProvider = 'openai' | 'gemini';

export interface ObservabilityAIInsightResult {
  enabled: boolean;
  used: boolean;
  provider: AIProvider;
  summary: string | null;
  error: string | null;
}

const BLOCKED_KEYS = new Set([
  'ip',
  'ipAddress',
  'serverIp',
  'password',
  'secret',
  'token',
  'apiKey',
  'api_key',
  'authKey',
  'auth_key',
  'privKey',
  'priv_key',
  'username',
  'email',
  'deviceId',
  'device_id',
  'serial',
  'serialNumber',
  'serial_number',
  'id',
]);

const REDACT_PATTERNS: RegExp[] = [
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  /\b[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\b/gi,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /\b(?:password|secret|token|apikey|api[_-]?key|auth[_-]?key|priv[_-]?key|username|email|serial|device[_-]?id|id)\s*[:=]\s*[^\s,;]+/gi,
  /\b(?:asset|agent|device|server|user)[-_:\s]*[A-Za-z0-9-]{4,}\b/gi,
];

function redactString(value: string) {
  let text = String(value || '');
  for (const pattern of REDACT_PATTERNS) {
    text = text.replace(pattern, '[redacted]');
  }
  return text;
}

function sanitizeForAI<T>(input: T): T {
  if (input == null) return input;
  if (typeof input === 'string') return redactString(input) as unknown as T;
  if (Array.isArray(input)) return input.map((item) => sanitizeForAI(item)) as unknown as T;
  if (typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (BLOCKED_KEYS.has(key)) {
        out[key] = '[redacted]';
      } else {
        out[key] = sanitizeForAI(value);
      }
    }
    return out as T;
  }
  return input;
}

function compactIssue(issue: ObservabilityIssue) {
  return sanitizeForAI({
    severity: issue.severity,
    source: issue.source,
    title: issue.title,
    detail: issue.detail,
    metric: issue.metric,
    value: issue.value,
    threshold: issue.threshold,
  });
}

type InsightParams = {
  generatedAt: string;
  context: Record<string, unknown>;
  observations: string[];
  issues: ObservabilityIssue[];
};

function buildPrompt(params: InsightParams) {
  const safeContext = sanitizeForAI(params.context);
  const safeObservations = sanitizeForAI(params.observations);
  const safeIssues = params.issues.map(compactIssue);

  return {
    role: 'system',
    instruction: 'You are an SRE observability assistant. Provide concise operational insights with priorities and actions. Never infer or request private identifiers.',
    outputFormat: 'Return plain text with: 1) Top risks (max 3), 2) probable causes, 3) next actions (max 5).',
    context: {
      generatedAt: params.generatedAt,
      operationalContext: safeContext,
      observations: safeObservations,
      issues: safeIssues,
    },
  };
}

async function callGemini(params: InsightParams): Promise<ObservabilityAIInsightResult> {
  const enabled = (process.env.OBSERVABILITY_AI_ENABLED || '').toLowerCase() === 'true';
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  const model = String(process.env.GEMINI_MODEL || 'gemini-2.5-pro').trim();

  if (!enabled || !apiKey) {
    return {
      enabled: false,
      used: false,
      provider: 'gemini',
      summary: null,
      error: enabled ? 'GEMINI_API_KEY missing.' : 'OBSERVABILITY_AI_ENABLED is false.',
    };
  }

  try {
    const prompt = buildPrompt(params);

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: JSON.stringify(prompt) }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          topP: 0.9,
          maxOutputTokens: 800,
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Gemini API ${response.status}: ${body.slice(0, 240)}`);
    }

    const payload: any = await response.json();
    const summary = payload?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || '').join('\n').trim() || null;

    return {
      enabled: true,
      used: !!summary,
      provider: 'gemini',
      summary,
      error: summary ? null : 'Gemini returned no summary.',
    };
  } catch (err: any) {
    return {
      enabled: true,
      used: false,
      provider: 'gemini',
      summary: null,
      error: err?.message || 'Gemini request failed.',
    };
  }
}

async function callOpenAI(params: InsightParams): Promise<ObservabilityAIInsightResult> {
  const enabled = (process.env.OBSERVABILITY_AI_ENABLED || '').toLowerCase() === 'true';
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  const model = String(process.env.OPENAI_MODEL || 'gpt-4o-mini').trim();

  if (!enabled || !apiKey) {
    return {
      enabled: false,
      used: false,
      provider: 'openai',
      summary: null,
      error: enabled ? 'OPENAI_API_KEY missing.' : 'OBSERVABILITY_AI_ENABLED is false.',
    };
  }

  try {
    const prompt = buildPrompt(params);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: 'You are an SRE observability assistant. Respond with concise operations insights.',
          },
          {
            role: 'user',
            content: JSON.stringify(prompt),
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI API ${response.status}: ${body.slice(0, 240)}`);
    }

    const payload: any = await response.json();
    const summary = String(payload?.choices?.[0]?.message?.content || '').trim() || null;

    return {
      enabled: true,
      used: !!summary,
      provider: 'openai',
      summary,
      error: summary ? null : 'OpenAI returned no summary.',
    };
  } catch (err: any) {
    return {
      enabled: true,
      used: false,
      provider: 'openai',
      summary: null,
      error: err?.message || 'OpenAI request failed.',
    };
  }
}

export async function generateObservabilityAIInsight(params: InsightParams): Promise<ObservabilityAIInsightResult> {
  const preferred = String(process.env.OBSERVABILITY_AI_PROVIDER || 'openai').trim().toLowerCase();

  if (preferred === 'gemini') {
    const gemini = await callGemini(params);
    if (gemini.used) return gemini;
    const openai = await callOpenAI(params);
    return openai.used ? openai : gemini;
  }

  const openai = await callOpenAI(params);
  if (openai.used) return openai;
  const gemini = await callGemini(params);
  return gemini.used ? gemini : openai;
}

export async function generateGeminiObservabilityInsight(params: InsightParams): Promise<ObservabilityAIInsightResult> {
  return callGemini(params);
}
