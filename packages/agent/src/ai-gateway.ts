/**
 * @file ai-gateway.ts
 * @description Frontier AI Gateway (Gemini, Anthropic, xAI, OpenAI-compatible & Mock) with Prompt Firewall, Canonical KV-Cache Prefix Pinning, Availability Fallback, Structured Decoding & Streaming
 */

import { zodToJsonSchema } from '@rudyrustam/core';
import { CentauryPromptFirewall, type FirewallVerdict } from './firewall';
import {
  type CanonicalToolDefinition,
  type ComplexityRoutingDecision,
  type ComplexitySignals,
  type FrontierProvider,
  type KvPrefixAuditResult,
  type ModelTier,
  type QualityGateResult,
  type StructuredSchemaLike,
  type ThinkingBudgetDecision,
  type ThinkingProfile,
  type ThinkingTaskDescriptor,
  auditKvCachePrefix,
  buildStructuredContractPayload,
  compileCanonicalPrefix,
  evaluateQualityGate,
  formatProviderThinkingPayload,
  getNextCascadeTier,
  resolveAvailabilityFallback,
  resolveThinkingBudget,
  scoreComplexity,
  selectModelForTier,
} from './frontier';

export type AIProviderKind = FrontierProvider;

export interface AIProviderConfig {
  kind: AIProviderKind;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  thinkingBudget?: number;
  thinkingProfile?: ThinkingProfile;
  cachedContent?: string;
  anthropicVersion?: string;
  maxTokens?: number;
  enablePromptCaching?: boolean;
  autoAvailabilityFallback?: boolean;
  embeddingModel?: string;
  mockResponder?: (prompt: string, systemPrompt: string) => string | Promise<string>;
}

export interface AIGatewayOptions {
  provider?: AIProviderConfig;
  fallbackProviders?: AIProviderConfig[];
  systemPrefix?: string;
  tools?: readonly CanonicalToolDefinition[];
  contextMap?: Record<string, unknown>;
  tierProviders?: Partial<Record<ModelTier, AIProviderConfig>>;
  firewall?: CentauryPromptFirewall;
  fetchImpl?: typeof fetch;
}

export interface AIGenerateRequest {
  prompt: string;
  thinkingBudget?: number;
  thinkingProfile?: ThinkingProfile;
  taskDescriptor?: ThinkingTaskDescriptor;
  maxTokens?: number;
  temperature?: number;
  skipFirewall?: boolean;
  structuredContract?: {
    name: string;
    schema: Record<string, unknown>;
  };
  metadata?: Record<string, unknown>;
}

export interface AIUsageMetrics {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  cacheHitRatio: number;
}

export interface AIGenerateResponse {
  blocked: boolean;
  text: string;
  provider: string;
  model: string;
  kvCachePrefixHash: string;
  fallbackUsed: boolean;
  availabilityFallbackUsed?: boolean;
  thinkingProfile?: ThinkingProfile;
  thinkingBudget?: number;
  usage?: AIUsageMetrics;
  firewallVerdict?: FirewallVerdict;
  error?: string;
}

export interface AIStructuredResponse<T> extends AIGenerateResponse {
  data?: T;
  schemaValid: boolean;
  jsonSchema: Record<string, unknown>;
}

export interface AICascadeResponse extends AIGenerateResponse {
  routingDecision: ComplexityRoutingDecision;
  tierUsed: ModelTier;
  escalations: number;
  qualityGate: QualityGateResult;
}

interface ProviderInvocationResult {
  text: string;
  usage?: AIUsageMetrics;
  thinkingDecision?: ThinkingBudgetDecision;
}

const DEFAULT_SYSTEM_PREFIX =
  'You are a Centaury Dual-Citizen AI agent operating inside a Zero-Hydration Bun TypeScript architecture.';

function buildUsageMetrics(inputTokens: number, outputTokens: number, cachedTokens: number): AIUsageMetrics {
  const safeInput = Math.max(0, inputTokens);
  const safeCached = Math.max(0, Math.min(safeInput, cachedTokens));
  const ratio = safeInput > 0 ? Number((safeCached / safeInput).toFixed(4)) : 0;
  return {
    inputTokens: safeInput,
    outputTokens: Math.max(0, outputTokens),
    cachedTokens: safeCached,
    cacheHitRatio: ratio,
  };
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

function resolveExplicitBudgetDecision(
  budget: number,
  profileHint?: ThinkingProfile
): ThinkingBudgetDecision {
  const profile: ThinkingProfile =
    profileHint ??
    (budget >= 65536 ? 'exhaustive' : budget >= 24576 ? 'deep' : budget >= 4096 ? 'balanced' : 'speed');
  const reasoningEffort: 'low' | 'medium' | 'high' =
    budget >= 24576 ? 'high' : budget >= 4096 ? 'medium' : 'low';
  return {
    profile,
    budgetTokens: budget,
    reasoningEffort,
    missionCriticalFloorApplied: false,
  };
}

function shouldTriggerAvailabilityFallback(err: unknown, cfg: AIProviderConfig): string | undefined {
  if (cfg.autoAvailabilityFallback === false) {
    return undefined;
  }
  const message = (err as Error)?.message ?? String(err);
  const transientOrMissing =
    /\b(404|429|503)\b|model.*not.*found|overloaded|quota|rate.?limit|capacity|unavailable/i.test(
      message
    );
  if (!transientOrMissing) {
    return undefined;
  }
  return resolveAvailabilityFallback(cfg.model);
}

function stripJsonCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

/**
 * Strict JSON Schema requires optional fields to accept `null`. When a schema uses `.optional()` or `.default()`
 * without `.nullable()`, map JSON `null` on those keys back to omitted/undefined so `zod.parse()` matches TS types
 * while keeping required fields and `.nullable()` fields strictly enforced.
 */
function normalizeStrictOptionalNulls(value: unknown, schema: unknown): unknown {
  const def = (schema as { _def?: Record<string, any> } | undefined)?._def;
  if (!def?.typeName) return value;

  if (def.typeName === 'ZodOptional' || def.typeName === 'ZodDefault') {
    const innerType = def.innerType as { _def?: Record<string, any> } | undefined;
    if (value === null && innerType?._def?.typeName !== 'ZodNullable') {
      return undefined;
    }
    return normalizeStrictOptionalNulls(value, innerType);
  }

  if (def.typeName === 'ZodNullable') {
    return value === null ? null : normalizeStrictOptionalNulls(value, def.innerType);
  }

  if (def.typeName === 'ZodArray' && Array.isArray(value)) {
    return value.map((item) => normalizeStrictOptionalNulls(item, def.type));
  }

  if (def.typeName === 'ZodObject' && value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const shape: Record<string, any> =
      typeof def.shape === 'function' ? def.shape() : def.shape && typeof def.shape === 'object' ? def.shape : {};
    const out: Record<string, unknown> = {};
    for (const [key, propVal] of Object.entries(value as Record<string, unknown>)) {
      if (Object.prototype.hasOwnProperty.call(shape, key)) {
        const normalized = normalizeStrictOptionalNulls(propVal, shape[key]);
        if (normalized !== undefined) {
          out[key] = normalized;
        }
      } else {
        out[key] = propVal;
      }
    }
    return out;
  }

  return value;
}

function synthesizeMockValue(schema: Record<string, unknown>): unknown {
  if (Object.prototype.hasOwnProperty.call(schema, 'const')) {
    return schema.const;
  }
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum[0];
  }
  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    const nonNull = schema.anyOf.find(
      (item): item is Record<string, unknown> =>
        typeof item === 'object' && item !== null && (item as Record<string, unknown>).type !== 'null'
    );
    return nonNull ? synthesizeMockValue(nonNull) : null;
  }

  switch (schema.type) {
    case 'string':
      return 'centaury-ok';
    case 'integer':
      return 1;
    case 'number':
      return 1;
    case 'boolean':
      return true;
    case 'array':
      return schema.items && typeof schema.items === 'object'
        ? [synthesizeMockValue(schema.items as Record<string, unknown>)]
        : [];
    case 'object': {
      const obj: Record<string, unknown> = {};
      const props = schema.properties as Record<string, Record<string, unknown>> | undefined;
      if (props && typeof props === 'object') {
        for (const [key, propSchema] of Object.entries(props)) {
          obj[key] = synthesizeMockValue(propSchema);
        }
      }
      return obj;
    }
    default:
      return null;
  }
}

/**
 * Multi-provider Frontier AI Gateway enforcing Prompt Firewall inspection, canonical KV-Cache prefix pinning, availability fallback, structured outputs, and SSE streaming.
 */
export class CentauryAIGateway {
  public readonly firewall: CentauryPromptFirewall;
  public readonly systemPrefix: string;
  public readonly kvCachePrefixHash: string;
  public readonly kvPrefixAudit: KvPrefixAuditResult;
  private readonly providers: AIProviderConfig[];
  private readonly tierProviders: Partial<Record<ModelTier, AIProviderConfig>>;
  private readonly fetchImpl: typeof fetch;

  constructor(options: AIGatewayOptions = {}) {
    this.firewall = options.firewall ?? new CentauryPromptFirewall();
    const baseDirectives = options.systemPrefix ?? DEFAULT_SYSTEM_PREFIX;

    if ((options.tools && options.tools.length > 0) || options.contextMap) {
      const compiled = compileCanonicalPrefix({
        directives: baseDirectives,
        tools: options.tools,
        contextMap: options.contextMap,
      });
      this.systemPrefix = compiled.prefix;
      this.kvPrefixAudit = compiled.audit;
    } else {
      this.systemPrefix = baseDirectives;
      this.kvPrefixAudit = auditKvCachePrefix(baseDirectives);
    }
    this.kvCachePrefixHash = this.kvPrefixAudit.sha256;
    this.fetchImpl = options.fetchImpl ?? fetch;

    const primary: AIProviderConfig = options.provider ?? {
      kind: 'mock',
      model: 'centaury-local-mock',
    };
    this.providers = [primary, ...(options.fallbackProviders ?? [])];
    this.tierProviders = options.tierProviders ?? {};
  }

  /**
   * Generate text safely with firewall screening, pinned canonical prefix, availability fallback, and provider cascade.
   */
  public async generate(req: AIGenerateRequest): Promise<AIGenerateResponse> {
    return this.executeWithProviders(req, this.providers);
  }

  /**
   * Generate strictly typed, grammar-constrained JSON verified against a Zod schema contract (fail-fast).
   */
  public async generateStructured<T>(
    req: AIGenerateRequest,
    schema: StructuredSchemaLike<T>,
    options: { schemaName?: string } = {}
  ): Promise<AIStructuredResponse<T>> {
    const schemaName = options.schemaName ?? 'centaury_structured_output';
    const jsonSchema = zodToJsonSchema(schema, { strict: true, sortKeys: true });

    const res = await this.generate({
      ...req,
      structuredContract: {
        name: schemaName,
        schema: jsonSchema,
      },
    });

    if (res.blocked) {
      return {
        ...res,
        schemaValid: false,
        jsonSchema,
      };
    }

    const cleaned = stripJsonCodeFence(res.text);
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch (err) {
      throw new Error(
        `Structured contract '${schemaName}' returned invalid JSON from ${res.provider}:${res.model}: ${(err as Error).message}`
      );
    }

    try {
      const normalized = normalizeStrictOptionalNulls(parsed, schema);
      const data = schema.parse(normalized);
      return {
        ...res,
        data,
        schemaValid: true,
        jsonSchema,
      };
    } catch (err) {
      throw new Error(
        `Structured contract '${schemaName}' failed Zod validation from ${res.provider}:${res.model}: ${(err as Error).message}`
      );
    }
  }

  /**
   * Execute 4-tier Adaptive Model Cascade: complexity scoring -> execution -> <50ms quality gate -> automatic tier escalation.
   */
  public async generateCascade(
    req: AIGenerateRequest,
    signals: ComplexitySignals,
    options?: {
      tierProviders?: Partial<Record<ModelTier, AIProviderConfig>>;
      maxEscalations?: number;
    }
  ): Promise<AICascadeResponse> {
    const routingDecision = scoreComplexity(signals);
    const maxEscalations = options?.maxEscalations ?? 2;
    let activeTier: ModelTier = routingDecision.tier;
    let escalations = 0;

    while (true) {
      const configuredTierProvider =
        options?.tierProviders?.[activeTier] ?? this.tierProviders[activeTier];
      const baseCfg = configuredTierProvider ?? this.providers[0];
      const targetModel =
        configuredTierProvider?.model ??
        (baseCfg.kind === 'mock' ? selectModelForTier(activeTier, signals) : baseCfg.model);

      const candidateProvider: AIProviderConfig = {
        ...baseCfg,
        model: targetModel,
      };

      const thinkingDecision = resolveThinkingBudget({
        ...req.taskDescriptor,
        complexityTier: activeTier,
        promptChars: signals.promptChars,
        fileCount: signals.fileCount,
      }, req.thinkingProfile);

      const res = await this.executeWithProviders(
        {
          ...req,
          thinkingBudget: thinkingDecision.budgetTokens,
          thinkingProfile: thinkingDecision.profile,
        },
        [candidateProvider, ...this.providers.slice(1)]
      );

      if (res.blocked) {
        return {
          ...res,
          routingDecision,
          tierUsed: activeTier,
          escalations,
          qualityGate: {
            passed: false,
            reasons: ['Blocked by Prompt Firewall'],
            latencyMs: 0,
          },
        };
      }

      const qualityGate = evaluateQualityGate(req.prompt, res.text, activeTier);
      if (qualityGate.passed || !qualityGate.nextTier || escalations >= maxEscalations) {
        return {
          ...res,
          routingDecision,
          tierUsed: activeTier,
          escalations,
          qualityGate,
        };
      }

      activeTier = qualityGate.nextTier;
      escalations++;
    }
  }

  /**
   * Stream token deltas in real time from Gemini, Anthropic, xAI, OpenAI-compatible, or Mock providers.
   */
  public async generateStream(
    req: AIGenerateRequest,
    onDelta: (delta: string) => void
  ): Promise<AIGenerateResponse> {
    const screen = this.screenPrompt(req);
    if (screen.blockedResponse) {
      return screen.blockedResponse;
    }
    const sanitizedPrompt = screen.sanitizedPrompt;
    const verdict = screen.verdict;

    const errors: string[] = [];
    for (let idx = 0; idx < this.providers.length; idx++) {
      const cfg = this.providers[idx];
      try {
        const result = await this.invokeProviderStream(cfg, sanitizedPrompt, req, onDelta);
        return this.formatSuccessResponse(cfg, result, idx > 0, false, verdict);
      } catch (err) {
        const availModel = shouldTriggerAvailabilityFallback(err, cfg);
        if (availModel && availModel !== cfg.model) {
          const availCfg: AIProviderConfig = { ...cfg, model: availModel };
          try {
            const availResult = await this.invokeProviderStream(availCfg, sanitizedPrompt, req, onDelta);
            return this.formatSuccessResponse(availCfg, availResult, true, true, verdict);
          } catch (availErr) {
            errors.push(`[${availCfg.kind}:${availCfg.model}] ${(availErr as Error).message}`);
            continue;
          }
        }
        errors.push(`[${cfg.kind}:${cfg.model}] ${(err as Error).message}`);
      }
    }

    throw new Error(`All AI streaming providers failed: ${errors.join('; ')}`);
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
    if (
      (primary?.kind === 'openai-compatible' || primary?.kind === 'xai') &&
      primary.embeddingModel &&
      primary.baseUrl
    ) {
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

  private screenPrompt(req: AIGenerateRequest): {
    sanitizedPrompt: string;
    verdict?: FirewallVerdict;
    blockedResponse?: AIGenerateResponse;
  } {
    if (req.skipFirewall) {
      return { sanitizedPrompt: req.prompt };
    }
    const verdict = this.firewall.inspectPrompt(req.prompt);
    if (!verdict.allowed) {
      return {
        sanitizedPrompt: '',
        verdict,
        blockedResponse: {
          blocked: true,
          text: '',
          provider: 'firewall',
          model: 'firewall',
          kvCachePrefixHash: this.kvCachePrefixHash,
          fallbackUsed: false,
          firewallVerdict: verdict,
          error: `Prompt blocked by CentauryPromptFirewall (riskScore=${verdict.riskScore})`,
        },
      };
    }
    return { sanitizedPrompt: verdict.sanitizedText, verdict };
  }

  private formatSuccessResponse(
    cfg: AIProviderConfig,
    result: ProviderInvocationResult,
    fallbackUsed: boolean,
    availabilityFallbackUsed: boolean,
    verdict?: FirewallVerdict
  ): AIGenerateResponse {
    return {
      blocked: false,
      text: result.text,
      provider: cfg.kind,
      model: cfg.model,
      kvCachePrefixHash: this.kvCachePrefixHash,
      fallbackUsed,
      availabilityFallbackUsed,
      thinkingProfile: result.thinkingDecision?.profile,
      thinkingBudget: result.thinkingDecision?.budgetTokens,
      usage: result.usage,
      firewallVerdict: verdict,
    };
  }

  private async executeWithProviders(
    req: AIGenerateRequest,
    providerList: AIProviderConfig[]
  ): Promise<AIGenerateResponse> {
    const screen = this.screenPrompt(req);
    if (screen.blockedResponse) {
      return screen.blockedResponse;
    }

    const errors: string[] = [];
    for (let idx = 0; idx < providerList.length; idx++) {
      const cfg = providerList[idx];
      try {
        const result = await this.invokeProvider(cfg, screen.sanitizedPrompt, req);
        return this.formatSuccessResponse(cfg, result, idx > 0, false, screen.verdict);
      } catch (err) {
        const availModel = shouldTriggerAvailabilityFallback(err, cfg);
        if (availModel && availModel !== cfg.model) {
          const availCfg: AIProviderConfig = { ...cfg, model: availModel };
          try {
            const availResult = await this.invokeProvider(availCfg, screen.sanitizedPrompt, req);
            return this.formatSuccessResponse(availCfg, availResult, true, true, screen.verdict);
          } catch (availErr) {
            errors.push(`[${availCfg.kind}:${availCfg.model}] ${(availErr as Error).message}`);
            continue;
          }
        }
        errors.push(`[${cfg.kind}:${cfg.model}] ${(err as Error).message}`);
      }
    }

    throw new Error(`All AI providers failed: ${errors.join('; ')}`);
  }

  private resolveThinkingDecisionForCall(
    cfg: AIProviderConfig,
    req: AIGenerateRequest
  ): ThinkingBudgetDecision | undefined {
    if (typeof req.thinkingBudget === 'number' && req.thinkingBudget > 0) {
      return resolveExplicitBudgetDecision(req.thinkingBudget, req.thinkingProfile ?? cfg.thinkingProfile);
    }
    if (req.taskDescriptor || req.thinkingProfile || cfg.thinkingProfile) {
      return resolveThinkingBudget(
        req.taskDescriptor ?? {},
        req.thinkingProfile ?? cfg.thinkingProfile
      );
    }
    if (typeof cfg.thinkingBudget === 'number' && cfg.thinkingBudget > 0) {
      return resolveExplicitBudgetDecision(cfg.thinkingBudget);
    }
    return undefined;
  }

  private async invokeProvider(
    cfg: AIProviderConfig,
    prompt: string,
    req: AIGenerateRequest
  ): Promise<ProviderInvocationResult> {
    const thinkingDecision = this.resolveThinkingDecisionForCall(cfg, req);

    if (cfg.kind === 'mock') {
      if (cfg.mockResponder) {
        return {
          text: await cfg.mockResponder(prompt, this.systemPrefix),
          thinkingDecision,
          usage: buildUsageMetrics(
            Math.ceil((this.systemPrefix.length + prompt.length) / 4),
            32,
            this.kvPrefixAudit.estimatedTokens
          ),
        };
      }
      if (req.structuredContract) {
        const synthetic = synthesizeMockValue(req.structuredContract.schema);
        return {
          text: JSON.stringify(synthetic),
          thinkingDecision,
          usage: buildUsageMetrics(
            Math.ceil((this.systemPrefix.length + prompt.length) / 4),
            24,
            this.kvPrefixAudit.estimatedTokens
          ),
        };
      }
      if (prompt.includes('EPHEMERAL_UI_MODE')) {
        return {
          text: `<ui-card elevation="glass"><ui-header title="Synthesized Agent Panel" badge="live" /><ui-metric value="Optimal" change="99.9%" /><p>Synthesized safely for prompt context.</p><ui-button action="ack_panel" param='{"source":"gateway"}'>Acknowledge</ui-button></ui-card>`,
          thinkingDecision,
        };
      }
      return {
        text: `[${cfg.model}] Synthesized response (${this.kvCachePrefixHash.slice(0, 8)}): ${prompt}`,
        thinkingDecision,
        usage: buildUsageMetrics(
          Math.ceil((this.systemPrefix.length + prompt.length) / 4),
          28,
          this.kvPrefixAudit.estimatedTokens
        ),
      };
    }

    if (cfg.kind === 'gemini') {
      const apiKey = cfg.apiKey || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('Missing Gemini API key');
      }
      const base = (cfg.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
      const url = `${base}/models/${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const generationConfig: Record<string, unknown> = {};
      if (typeof req.temperature === 'number') {
        generationConfig.temperature = req.temperature;
      }
      if (typeof (req.maxTokens ?? cfg.maxTokens) === 'number') {
        generationConfig.maxOutputTokens = req.maxTokens ?? cfg.maxTokens;
      }
      if (thinkingDecision && thinkingDecision.budgetTokens > 0) {
        Object.assign(generationConfig, formatProviderThinkingPayload('gemini', thinkingDecision));
      }
      if (req.structuredContract) {
        Object.assign(
          generationConfig,
          buildStructuredContractPayload('gemini', req.structuredContract.name, req.structuredContract.schema)
        );
      }

      const payload: Record<string, unknown> = {
        systemInstruction: { parts: [{ text: this.systemPrefix }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig,
      };
      if (cfg.cachedContent) {
        payload.cachedContent = cfg.cachedContent;
      }

      const res = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`HTTP ${res.status}: ${errBody.slice(0, 180)}`);
      }

      const json = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        usageMetadata?: {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
          cachedContentTokenCount?: number;
        };
      };
      const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      if (!text) {
        throw new Error('Gemini returned empty response text');
      }

      const usage = json.usageMetadata
        ? buildUsageMetrics(
            json.usageMetadata.promptTokenCount ?? 0,
            json.usageMetadata.candidatesTokenCount ?? 0,
            json.usageMetadata.cachedContentTokenCount ?? 0
          )
        : undefined;

      return { text, usage, thinkingDecision };
    }

    if (cfg.kind === 'anthropic') {
      const apiKey = cfg.apiKey || process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error('Missing Anthropic API key');
      }
      const base = (cfg.baseUrl ?? 'https://api.anthropic.com/v1').replace(/\/+$/, '');
      const url = `${base}/messages`;

      const useStructuredTool = Boolean(req.structuredContract);
      const useThinking = !useStructuredTool && Boolean(thinkingDecision && thinkingDecision.budgetTokens > 0);
      const requestedMaxTokens = req.maxTokens ?? cfg.maxTokens ?? 4096;
      const maxTokens =
        useThinking && thinkingDecision
          ? Math.max(requestedMaxTokens, thinkingDecision.budgetTokens + 1024)
          : requestedMaxTokens;

      const systemBlock: Record<string, unknown> = {
        type: 'text',
        text: this.systemPrefix,
      };
      if (cfg.enablePromptCaching !== false) {
        systemBlock.cache_control = { type: 'ephemeral' };
      }

      const body: Record<string, unknown> = {
        model: cfg.model,
        max_tokens: maxTokens,
        system: [systemBlock],
        messages: [{ role: 'user', content: prompt }],
      };

      if (!useThinking && typeof req.temperature === 'number') {
        body.temperature = req.temperature;
      }
      if (useThinking && thinkingDecision) {
        Object.assign(body, formatProviderThinkingPayload('anthropic', thinkingDecision));
      }
      if (req.structuredContract) {
        Object.assign(
          body,
          buildStructuredContractPayload('anthropic', req.structuredContract.name, req.structuredContract.schema)
        );
      }

      const res = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': cfg.anthropicVersion ?? '2023-06-01',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`HTTP ${res.status}: ${errBody.slice(0, 180)}`);
      }

      const json = (await res.json()) as {
        content?: Array<{ type?: string; text?: string; name?: string; input?: unknown }>;
        usage?: {
          input_tokens?: number;
          output_tokens?: number;
          cache_read_input_tokens?: number;
        };
      };

      let text = '';
      if (req.structuredContract) {
        const toolBlock = json.content?.find((b) => b.type === 'tool_use');
        if (toolBlock && toolBlock.input !== undefined) {
          text = JSON.stringify(toolBlock.input);
        }
      }
      if (!text) {
        text =
          json.content
            ?.filter((b) => b.type === 'text')
            .map((b) => b.text ?? '')
            .join('') ?? '';
      }
      if (!text) {
        throw new Error('Anthropic returned empty response content');
      }

      const usage = json.usage
        ? buildUsageMetrics(
            json.usage.input_tokens ?? 0,
            json.usage.output_tokens ?? 0,
            json.usage.cache_read_input_tokens ?? 0
          )
        : undefined;

      return { text, usage, thinkingDecision };
    }

    // xAI Grok & OpenAI-compatible chat completions
    const defaultBase = cfg.kind === 'xai' ? 'https://api.x.ai/v1' : 'https://api.openai.com/v1';
    const base = (cfg.baseUrl ?? defaultBase).replace(/\/+$/, '');
    const url = `${base}/chat/completions`;
    const apiKey =
      cfg.apiKey || (cfg.kind === 'xai' ? process.env.XAI_API_KEY : process.env.OPENAI_API_KEY);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const body: Record<string, unknown> = {
      model: cfg.model,
      temperature: req.temperature ?? 0.2,
      messages: [
        { role: 'system', content: this.systemPrefix },
        { role: 'user', content: prompt },
      ],
    };

    if (typeof (req.maxTokens ?? cfg.maxTokens) === 'number') {
      body.max_tokens = req.maxTokens ?? cfg.maxTokens;
    }
    if (thinkingDecision) {
      Object.assign(body, formatProviderThinkingPayload(cfg.kind, thinkingDecision));
    }
    if (req.structuredContract) {
      Object.assign(
        body,
        buildStructuredContractPayload(cfg.kind, req.structuredContract.name, req.structuredContract.schema)
      );
    }

    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`HTTP ${res.status}: ${errBody.slice(0, 180)}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        prompt_tokens_details?: { cached_tokens?: number };
      };
    };
    const text = json.choices?.[0]?.message?.content ?? '';
    if (!text) {
      throw new Error(`${cfg.kind} endpoint returned empty completion`);
    }

    const usage = json.usage
      ? buildUsageMetrics(
          json.usage.prompt_tokens ?? 0,
          json.usage.completion_tokens ?? 0,
          json.usage.prompt_tokens_details?.cached_tokens ?? 0
        )
      : undefined;

    return { text, usage, thinkingDecision };
  }

  private async invokeProviderStream(
    cfg: AIProviderConfig,
    prompt: string,
    req: AIGenerateRequest,
    onDelta: (delta: string) => void
  ): Promise<ProviderInvocationResult> {
    const thinkingDecision = this.resolveThinkingDecisionForCall(cfg, req);

    if (cfg.kind === 'mock') {
      const full = await this.invokeProvider(cfg, prompt, req);
      const chunks = full.text.match(/<[^>]+>|[^<\s]+\s*/g) ?? [full.text];
      for (const chunk of chunks) {
        onDelta(chunk);
      }
      return full;
    }

    if (cfg.kind === 'gemini') {
      const apiKey = cfg.apiKey || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('Missing Gemini API key');
      }
      const base = (cfg.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
      const url = `${base}/models/${encodeURIComponent(cfg.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
      const generationConfig: Record<string, unknown> = {};
      if (typeof req.temperature === 'number') {
        generationConfig.temperature = req.temperature;
      }
      if (thinkingDecision && thinkingDecision.budgetTokens > 0) {
        Object.assign(generationConfig, formatProviderThinkingPayload('gemini', thinkingDecision));
      }

      const res = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: this.systemPrefix }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig,
          ...(cfg.cachedContent ? { cachedContent: cfg.cachedContent } : {}),
        }),
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`HTTP ${res.status}: ${errBody.slice(0, 180)}`);
      }

      return this.consumeSseResponse(res, 'gemini', onDelta, thinkingDecision);
    }

    if (cfg.kind === 'anthropic') {
      const apiKey = cfg.apiKey || process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error('Missing Anthropic API key');
      }
      const base = (cfg.baseUrl ?? 'https://api.anthropic.com/v1').replace(/\/+$/, '');
      const url = `${base}/messages`;
      const requestedMaxTokens = req.maxTokens ?? cfg.maxTokens ?? 4096;
      const useThinking = Boolean(thinkingDecision && thinkingDecision.budgetTokens > 0);
      const maxTokens =
        useThinking && thinkingDecision
          ? Math.max(requestedMaxTokens, thinkingDecision.budgetTokens + 1024)
          : requestedMaxTokens;

      const body: Record<string, unknown> = {
        model: cfg.model,
        stream: true,
        max_tokens: maxTokens,
        system: [
          {
            type: 'text',
            text: this.systemPrefix,
            ...(cfg.enablePromptCaching !== false ? { cache_control: { type: 'ephemeral' } } : {}),
          },
        ],
        messages: [{ role: 'user', content: prompt }],
      };
      if (useThinking && thinkingDecision) {
        Object.assign(body, formatProviderThinkingPayload('anthropic', thinkingDecision));
      }

      const res = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': cfg.anthropicVersion ?? '2023-06-01',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`HTTP ${res.status}: ${errBody.slice(0, 180)}`);
      }

      return this.consumeSseResponse(res, 'anthropic', onDelta, thinkingDecision);
    }

    // OpenAI-compatible / xAI SSE streaming
    const defaultBase = cfg.kind === 'xai' ? 'https://api.x.ai/v1' : 'https://api.openai.com/v1';
    const base = (cfg.baseUrl ?? defaultBase).replace(/\/+$/, '');
    const apiKey =
      cfg.apiKey || (cfg.kind === 'xai' ? process.env.XAI_API_KEY : process.env.OPENAI_API_KEY);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const res = await this.fetchImpl(`${base}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: cfg.model,
        stream: true,
        temperature: req.temperature ?? 0.2,
        ...(thinkingDecision ? formatProviderThinkingPayload(cfg.kind, thinkingDecision) : {}),
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

    return this.consumeSseResponse(res, cfg.kind, onDelta, thinkingDecision);
  }

  private async consumeSseResponse(
    res: Response,
    kind: AIProviderKind,
    onDelta: (delta: string) => void,
    thinkingDecision?: ThinkingBudgetDecision
  ): Promise<ProviderInvocationResult> {
    if (!res.body) {
      throw new Error(`Streaming response from ${kind} has no body`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let accumulated = '';
    let usage: AIUsageMetrics | undefined;

    const processLine = (rawLine: string): void => {
      const line = rawLine.trim();
      if (!line.startsWith('data:')) return;
      const dataStr = line.slice(5).trim();
      if (!dataStr || dataStr === '[DONE]') return;

      let parsed: Record<string, any>;
      try {
        parsed = JSON.parse(dataStr);
      } catch {
        return;
      }

      if (kind === 'gemini') {
        const delta =
          (parsed.candidates?.[0]?.content?.parts as Array<{ text?: string }> | undefined)
            ?.map((p) => p.text ?? '')
            .join('') ?? '';
        if (delta) {
          accumulated += delta;
          onDelta(delta);
        }
        if (parsed.usageMetadata) {
          usage = buildUsageMetrics(
            parsed.usageMetadata.promptTokenCount ?? 0,
            parsed.usageMetadata.candidatesTokenCount ?? 0,
            parsed.usageMetadata.cachedContentTokenCount ?? 0
          );
        }
        return;
      }

      if (kind === 'anthropic') {
        if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
          const delta = String(parsed.delta.text ?? '');
          if (delta) {
            accumulated += delta;
            onDelta(delta);
          }
        } else if (parsed.type === 'message_start' && parsed.message?.usage) {
          usage = buildUsageMetrics(
            parsed.message.usage.input_tokens ?? 0,
            parsed.message.usage.output_tokens ?? 0,
            parsed.message.usage.cache_read_input_tokens ?? 0
          );
        } else if (parsed.type === 'message_delta' && parsed.usage) {
          usage = buildUsageMetrics(
            usage?.inputTokens ?? parsed.usage.input_tokens ?? 0,
            parsed.usage.output_tokens ?? usage?.outputTokens ?? 0,
            usage?.cachedTokens ?? 0
          );
        }
        return;
      }

      // OpenAI / xAI SSE chunk
      const delta = String(parsed.choices?.[0]?.delta?.content ?? '');
      if (delta) {
        accumulated += delta;
        onDelta(delta);
      }
      if (parsed.usage) {
        usage = buildUsageMetrics(
          parsed.usage.prompt_tokens ?? 0,
          parsed.usage.completion_tokens ?? 0,
          parsed.usage.prompt_tokens_details?.cached_tokens ?? 0
        );
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        processLine(line);
      }
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
      for (const line of buffer.split(/\r?\n/)) {
        processLine(line);
      }
    }

    if (!accumulated) {
      throw new Error(`${kind} SSE stream yielded no text deltas`);
    }

    return { text: accumulated, usage, thinkingDecision };
  }
}
