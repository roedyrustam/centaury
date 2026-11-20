/**
 * @file ai-gateway.ts
 * @description Frontier AI Gateway (Gemini, OpenAI-compatible & Mock) with Prompt Firewall, KV-Cache Prefix Pinning & Automatic Fallback Cascade
 */

import { CentauryPromptFirewall, type FirewallVerdict } from './firewall';

export type AIProviderKind = 'gemini' | 'openai-compatible' | 'mock';

export interface AIProviderConfig {
  kind: AIProviderKind;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  thinkingBudget?: number;
  embeddingModel?: string;
  mockResponder?: (prompt: string, systemPrompt: string) => string | Promise<string>;
}

export interface AIGatewayOptions {
  provider?: AIProviderConfig;
  fallbackProviders?: AIProviderConfig[];
  systemPrefix?: string;
  firewall?: CentauryPromptFirewall;
  fetchImpl?: typeof fetch;
}

export interface AIGenerateRequest {
  prompt: string;
  thinkingBudget?: number;
  temperature?: number;
  skipFirewall?: boolean;
  metadata?: Record<string, unknown>;
}

export interface AIGenerateResponse {
  blocked: boolean;
  text: string;
  provider: string;
  model: string;
  kvCachePrefixHash: string;
  fallbackUsed: boolean;
  firewallVerdict?: FirewallVerdict;
  error?: string;
}

const DEFAULT_SYSTEM_PREFIX =
  'You are a Centaury Dual-Citizen AI agent operating inside a Zero-Hydration Bun TypeScript architecture.';

function computePrefixHash(prefix: string): string {
  return new Bun.CryptoHasher('sha256').update(prefix).digest('hex');
}

function hashTokenVector(text: string, dimensions: number): Float32Array {
  const vec = new Float32Array(dimensions);
  const normalized = text.toLowerCase().trim();
  if (!normalized) return vec;

  const words = normalized.split(/[^a-z0-9_]+/).filter(Boolean);
  const features: Array<{ token: string; weight: number }> = [];

  for (const w of words) {
    features.push({ token: `w:${w}`, weight: 1.5 });
    for (let i = 0; i <= w.length - 3; i++) {
      features.push({ token: `tri:${w.slice(i, i + 3)}`, weight: 0.65 });
    }
  }

  for (let i = 0; i <= normalized.length - 3; i++) {
    features.push({ token: `g:${normalized.slice(i, i + 3)}`, weight: 0.35 });
  }

  for (const feat of features) {
    let h1 = 2166136261;
    for (let i = 0; i < feat.token.length; i++) {
      h1 ^= feat.token.charCodeAt(i);
      h1 = Math.imul(h1, 16777619);
    }
    const index = Math.abs(h1) % dimensions;
    const sign = (h1 & 1) === 0 ? 1 : -1;
    vec[index] += sign * feat.weight;
  }

  let normSq = 0;
  for (let i = 0; i < dimensions; i++) {
    normSq += vec[i] * vec[i];
  }
  const norm = Math.sqrt(normSq);
  if (norm > 0) {
    for (let i = 0; i < dimensions; i++) {
      vec[i] = vec[i] / norm;
    }
  }

  return vec;
}

/**
 * Multi-provider Frontier AI Gateway enforcing Prompt Firewall inspection, KV-Cache prefix pinning, and fallback routing.
 */
export class CentauryAIGateway {
  public readonly firewall: CentauryPromptFirewall;
  public readonly systemPrefix: string;
  public readonly kvCachePrefixHash: string;
  private readonly providers: AIProviderConfig[];
  private readonly fetchImpl: typeof fetch;

  constructor(options: AIGatewayOptions = {}) {
    this.firewall = options.firewall ?? new CentauryPromptFirewall();
    this.systemPrefix = options.systemPrefix ?? DEFAULT_SYSTEM_PREFIX;
    this.kvCachePrefixHash = computePrefixHash(this.systemPrefix);
    this.fetchImpl = options.fetchImpl ?? fetch;

    const primary: AIProviderConfig = options.provider ?? {
      kind: 'mock',
      model: 'centaury-local-mock',
    };
    this.providers = [primary, ...(options.fallbackProviders ?? [])];
  }

  /**
   * Generate text safely with firewall screening, pinned system prefix, and automatic provider cascade.
   */
  public async generate(req: AIGenerateRequest): Promise<AIGenerateResponse> {
    let sanitizedPrompt = req.prompt;
    let verdict: FirewallVerdict | undefined;

    if (!req.skipFirewall) {
      verdict = this.firewall.inspectPrompt(req.prompt);
      if (!verdict.allowed) {
        return {
          blocked: true,
          text: '',
          provider: 'firewall',
          model: 'firewall',
          kvCachePrefixHash: this.kvCachePrefixHash,
          fallbackUsed: false,
          firewallVerdict: verdict,
          error: `Prompt blocked by CentauryPromptFirewall (riskScore=${verdict.riskScore})`,
        };
      }
      sanitizedPrompt = verdict.sanitizedText;
    }

    const errors: string[] = [];
    for (let idx = 0; idx < this.providers.length; idx++) {
      const cfg = this.providers[idx];
      try {
        const text = await this.invokeProvider(cfg, sanitizedPrompt, req);
        return {
          blocked: false,
          text,
          provider: cfg.kind,
          model: cfg.model,
          kvCachePrefixHash: this.kvCachePrefixHash,
          fallbackUsed: idx > 0,
          firewallVerdict: verdict,
        };
      } catch (err) {
        errors.push(`[${cfg.kind}:${cfg.model}] ${(err as Error).message}`);
      }
    }

    throw new Error(`All AI providers failed: ${errors.join('; ')}`);
  }

  private async invokeProvider(
    cfg: AIProviderConfig,
    prompt: string,
    req: AIGenerateRequest
  ): Promise<string> {
    if (cfg.kind === 'mock') {
      if (cfg.mockResponder) {
        return await cfg.mockResponder(prompt, this.systemPrefix);
      }
      if (prompt.includes('EPHEMERAL_UI_MODE')) {
        return `<ui-card elevation="glass"><ui-header title="Synthesized Agent Panel" badge="live" /><ui-metric value="Optimal" change="99.9%" /><p>Synthesized safely for prompt context.</p><ui-button action="ack_panel" param='{"source":"gateway"}'>Acknowledge</ui-button></ui-card>`;
      }
      return `[${cfg.model}] Synthesized response (${this.kvCachePrefixHash.slice(0, 8)}): ${prompt}`;
    }

    if (cfg.kind === 'gemini') {
      const apiKey = cfg.apiKey || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('Missing Gemini API key');
      }
      const base = (cfg.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
      const url = `${base}/models/${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const budget = req.thinkingBudget ?? cfg.thinkingBudget;
      const generationConfig: Record<string, unknown> = {};
      if (typeof req.temperature === 'number') {
        generationConfig.temperature = req.temperature;
      }
      if (typeof budget === 'number' && budget > 0) {
        generationConfig.thinkingConfig = { thinkingBudget: budget };
      }

      const res = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: this.systemPrefix }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig,
        }),
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`HTTP ${res.status}: ${errBody.slice(0, 180)}`);
      }

      const json = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      if (!text) {
        throw new Error('Gemini returned empty response text');
      }
      return text;
    }

    // OpenAI-compatible chat completions
    const base = (cfg.baseUrl ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
    const url = `${base}/chat/completions`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (cfg.apiKey) {
      headers.Authorization = `Bearer ${cfg.apiKey}`;
    }

    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: cfg.model,
        temperature: req.temperature ?? 0.2,
        messages: [
          { role: 'system', content: this.systemPrefix },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`HTTP ${res.status}: ${errBody.slice(0, 180)}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = json.choices?.[0]?.message?.content ?? '';
    if (!text) {
      throw new Error('OpenAI-compatible endpoint returned empty completion');
    }
    return text;
  }

  /**
   * Generate Ephemeral UI DSL markup and stream tag chunks to an incremental callback.
   */
  public async synthesizeEphemeralUI(
    prompt: string,
    onChunk?: (chunk: string) => void
  ): Promise<AIGenerateResponse> {
    const verdict = this.firewall.inspectPrompt(prompt);
    if (!verdict.allowed) {
      return {
        blocked: true,
        text: '',
        provider: 'firewall',
        model: 'firewall',
        kvCachePrefixHash: this.kvCachePrefixHash,
        fallbackUsed: false,
        firewallVerdict: verdict,
        error: `Prompt blocked by CentauryPromptFirewall (riskScore=${verdict.riskScore})`,
      };
    }

    const uiInstruction =
      'EPHEMERAL_UI_MODE: Return safe declarative Centaury UI tags (<ui-card>, <ui-header>, <ui-metric>, <ui-button>, <ui-alert>, <p>) without <script> tags. Request: ' +
      verdict.sanitizedText;

    const response = await this.generate({
      prompt: uiInstruction,
      skipFirewall: true,
    });

    if (onChunk && response.text) {
      const parts = response.text.match(/<[^>]+>|[^<]+/g) ?? [response.text];
      for (const part of parts) {
        onChunk(part);
      }
    }

    return {
      ...response,
      firewallVerdict: verdict,
    };
  }

  /**
   * Compute an L2-normalized embedding vector locally (with optional remote provider embedding if configured).
   */
  public async embed(text: string, dimensions = 64): Promise<Float32Array> {
    const primary = this.providers[0];
    if (primary?.kind === 'openai-compatible' && primary.embeddingModel && primary.baseUrl) {
      try {
        const res = await this.fetchImpl(`${primary.baseUrl.replace(/\/+$/, '')}/embeddings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(primary.apiKey ? { Authorization: `Bearer ${primary.apiKey}` } : {}),
          },
          body: JSON.stringify({ model: primary.embeddingModel, input: text }),
        });
        if (res.ok) {
          const body = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
          const arr = body.data?.[0]?.embedding;
          if (Array.isArray(arr) && arr.length > 0) {
            return new Float32Array(arr);
          }
        }
      } catch {
        // Gracefully degrade to deterministic local hashing embedding
      }
    }

    return hashTokenVector(text, dimensions);
  }
}
