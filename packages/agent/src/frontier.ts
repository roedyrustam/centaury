/**
 * @file frontier.ts
 * @description Late-2026 Frontier LLM Orchestration: 4-Tier Adaptive Cascade, Thinking Budget Orchestrator, Canonical KV-Cache Compiler & Strict Output Contracts
 */

export type ModelTier = 'FAST' | 'HIGH_FAST' | 'MEDIUM' | 'HIGH';
export type FrontierProvider = 'gemini' | 'anthropic' | 'openai-compatible' | 'xai' | 'mock';
export type ThinkingProfile = 'speed' | 'balanced' | 'deep' | 'exhaustive';

export interface FrontierModelSpec {
  id: string;
  displayName: string;
  provider: FrontierProvider;
  tier: ModelTier;
  contextWindow: number;
  maxThinkingBudget: number;
  supportsNativeCache: boolean;
  supportsStrictJsonSchema: boolean;
  supportsThinking: boolean;
  fallbackModel?: string;
  costProfile: {
    inputPer1M: number;
    outputPer1M: number;
    cachedInputDiscount: number;
  };
}

export const FRONTIER_MODEL_REGISTRY: Record<string, FrontierModelSpec> = {
  'gemini-3.8-flash': {
    id: 'gemini-3.8-flash',
    displayName: 'Gemini 3.8 Flash',
    provider: 'gemini',
    tier: 'FAST',
    contextWindow: 1_048_576,
    maxThinkingBudget: 24_576,
    supportsNativeCache: true,
    supportsStrictJsonSchema: true,
    supportsThinking: true,
    costProfile: { inputPer1M: 0.1, outputPer1M: 0.4, cachedInputDiscount: 0.75 },
  },
  'grok-4.6-high-fast': {
    id: 'grok-4.6-high-fast',
    displayName: 'Grok 4.6 High Fast',
    provider: 'xai',
    tier: 'FAST',
    contextWindow: 256_000,
    maxThinkingBudget: 32_768,
    supportsNativeCache: true,
    supportsStrictJsonSchema: true,
    supportsThinking: true,
    costProfile: { inputPer1M: 0.25, outputPer1M: 0.9, cachedInputDiscount: 0.75 },
  },
  'gemini-4-carbon': {
    id: 'gemini-4-carbon',
    displayName: 'Gemini 4 Carbon',
    provider: 'gemini',
    tier: 'HIGH_FAST',
    contextWindow: 1_048_576,
    maxThinkingBudget: 32_768,
    supportsNativeCache: true,
    supportsStrictJsonSchema: true,
    supportsThinking: true,
    fallbackModel: 'gemini-3.8-flash',
    costProfile: { inputPer1M: 0.18, outputPer1M: 0.7, cachedInputDiscount: 0.8 },
  },
  'grok-4.7-high-fast': {
    id: 'grok-4.7-high-fast',
    displayName: 'Grok 4.7 High Fast',
    provider: 'xai',
    tier: 'HIGH_FAST',
    contextWindow: 256_000,
    maxThinkingBudget: 32_768,
    supportsNativeCache: true,
    supportsStrictJsonSchema: true,
    supportsThinking: true,
    fallbackModel: 'grok-4.6-high-fast',
    costProfile: { inputPer1M: 0.35, outputPer1M: 1.2, cachedInputDiscount: 0.75 },
  },
  'composer-2.5-fast': {
    id: 'composer-2.5-fast',
    displayName: 'Cursor Composer 2.5 Fast',
    provider: 'openai-compatible',
    tier: 'HIGH_FAST',
    contextWindow: 256_000,
    maxThinkingBudget: 16_384,
    supportsNativeCache: false,
    supportsStrictJsonSchema: true,
    supportsThinking: false,
    fallbackModel: 'grok-4.6-high-fast',
    costProfile: { inputPer1M: 0.3, outputPer1M: 1.0, cachedInputDiscount: 0.5 },
  },
  'gemini-4-neon-medium': {
    id: 'gemini-4-neon-medium',
    displayName: 'Gemini 4 Neon Medium',
    provider: 'gemini',
    tier: 'MEDIUM',
    contextWindow: 1_048_576,
    maxThinkingBudget: 65_536,
    supportsNativeCache: true,
    supportsStrictJsonSchema: true,
    supportsThinking: true,
    fallbackModel: 'gemini-3.8-flash',
    costProfile: { inputPer1M: 0.85, outputPer1M: 3.2, cachedInputDiscount: 0.85 },
  },
  'gemini-4-hydrogen-medium': {
    id: 'gemini-4-hydrogen-medium',
    displayName: 'Gemini 4 Hydrogen Medium',
    provider: 'gemini',
    tier: 'MEDIUM',
    contextWindow: 1_048_576,
    maxThinkingBudget: 32_768,
    supportsNativeCache: true,
    supportsStrictJsonSchema: true,
    supportsThinking: true,
    fallbackModel: 'gemini-3.8-flash',
    costProfile: { inputPer1M: 0.6, outputPer1M: 2.2, cachedInputDiscount: 0.85 },
  },
  'gemini-4-argon-medium': {
    id: 'gemini-4-argon-medium',
    displayName: 'Gemini 4 Argon Medium',
    provider: 'gemini',
    tier: 'MEDIUM',
    contextWindow: 2_097_152,
    maxThinkingBudget: 65_536,
    supportsNativeCache: true,
    supportsStrictJsonSchema: true,
    supportsThinking: true,
    fallbackModel: 'gemini-3.8-flash',
    costProfile: { inputPer1M: 1.1, outputPer1M: 4.0, cachedInputDiscount: 0.9 },
  },
  'gpt-5.6-sol-medium': {
    id: 'gpt-5.6-sol-medium',
    displayName: 'GPT-5.6 Sol Medium',
    provider: 'openai-compatible',
    tier: 'MEDIUM',
    contextWindow: 1_000_000,
    maxThinkingBudget: 65_536,
    supportsNativeCache: true,
    supportsStrictJsonSchema: true,
    supportsThinking: true,
    fallbackModel: 'gemini-3.8-flash',
    costProfile: { inputPer1M: 1.5, outputPer1M: 6.0, cachedInputDiscount: 0.75 },
  },
  'claude-opus-5.5-medium': {
    id: 'claude-opus-5.5-medium',
    displayName: 'Claude Opus 5.5 Medium',
    provider: 'anthropic',
    tier: 'MEDIUM',
    contextWindow: 1_000_000,
    maxThinkingBudget: 65_536,
    supportsNativeCache: true,
    supportsStrictJsonSchema: true,
    supportsThinking: true,
    fallbackModel: 'claude-opus-4.6',
    costProfile: { inputPer1M: 3.0, outputPer1M: 15.0, cachedInputDiscount: 0.9 },
  },
  'claude-opus-4.6': {
    id: 'claude-opus-4.6',
    displayName: 'Claude Opus 4.6',
    provider: 'anthropic',
    tier: 'MEDIUM',
    contextWindow: 200_000,
    maxThinkingBudget: 32_768,
    supportsNativeCache: true,
    supportsStrictJsonSchema: true,
    supportsThinking: true,
    costProfile: { inputPer1M: 2.5, outputPer1M: 12.0, cachedInputDiscount: 0.9 },
  },
  'claude-sonnet-5.5-high': {
    id: 'claude-sonnet-5.5-high',
    displayName: 'Claude Sonnet 5.5 High',
    provider: 'anthropic',
    tier: 'HIGH',
    contextWindow: 1_000_000,
    maxThinkingBudget: 65_536,
    supportsNativeCache: true,
    supportsStrictJsonSchema: true,
    supportsThinking: true,
    fallbackModel: 'claude-opus-4.6',
    costProfile: { inputPer1M: 3.5, outputPer1M: 17.5, cachedInputDiscount: 0.9 },
  },
  'claude-fable-5.1-high': {
    id: 'claude-fable-5.1-high',
    displayName: 'Claude Fable 5.1 High',
    provider: 'anthropic',
    tier: 'HIGH',
    contextWindow: 1_000_000,
    maxThinkingBudget: 65_536,
    supportsNativeCache: true,
    supportsStrictJsonSchema: true,
    supportsThinking: true,
    fallbackModel: 'claude-opus-4.6',
    costProfile: { inputPer1M: 4.0, outputPer1M: 20.0, cachedInputDiscount: 0.9 },
  },
  'gemini-4-pro': {
    id: 'gemini-4-pro',
    displayName: 'Gemini 4 Pro',
    provider: 'gemini',
    tier: 'HIGH',
    contextWindow: 2_097_152,
    maxThinkingBudget: 65_536,
    supportsNativeCache: true,
    supportsStrictJsonSchema: true,
    supportsThinking: true,
    fallbackModel: 'gemini-3.8-flash',
    costProfile: { inputPer1M: 2.0, outputPer1M: 8.0, cachedInputDiscount: 0.9 },
  },
  'muse-wonder-high': {
    id: 'muse-wonder-high',
    displayName: 'Muse Wonder High',
    provider: 'openai-compatible',
    tier: 'HIGH',
    contextWindow: 512_000,
    maxThinkingBudget: 65_536,
    supportsNativeCache: false,
    supportsStrictJsonSchema: true,
    supportsThinking: true,
    fallbackModel: 'gemini-3.8-flash',
    costProfile: { inputPer1M: 3.0, outputPer1M: 12.0, cachedInputDiscount: 0.5 },
  },
};

export const AVAILABILITY_FALLBACK_MATRIX: Record<string, string> = {
  'gemini-4-carbon': 'gemini-3.8-flash',
  'gemini-4-neon-medium': 'gemini-3.8-flash',
  'gemini-4-hydrogen-medium': 'gemini-3.8-flash',
  'gemini-4-argon-medium': 'gemini-3.8-flash',
  'gemini-4-pro': 'gemini-3.8-flash',
  'claude-opus-5.5-medium': 'claude-opus-4.6',
  'claude-sonnet-5.5-high': 'claude-opus-4.6',
  'claude-fable-5.1-high': 'claude-opus-4.6',
  'grok-4.7-high-fast': 'grok-4.6-high-fast',
  'composer-2.5-fast': 'grok-4.6-high-fast',
  'gpt-5.6-sol-medium': 'gemini-3.8-flash',
  'muse-wonder-high': 'gemini-3.8-flash',
};

/**
 * Resolve availability fallback model enforcing the Gemini 4 -> Gemini 3.8 Flash and Claude 5.x -> Claude Opus 4.6 invariants.
 */
export function resolveAvailabilityFallback(model: string): string | undefined {
  const normalized = model.trim().toLowerCase();
  if (!normalized) return undefined;

  const exact = FRONTIER_MODEL_REGISTRY[normalized]?.fallbackModel ?? AVAILABILITY_FALLBACK_MATRIX[normalized];
  if (exact && exact !== normalized) {
    return exact;
  }

  if (normalized.startsWith('gemini-4')) {
    return 'gemini-3.8-flash';
  }
  if (
    normalized.startsWith('claude-opus-5.5') ||
    normalized.startsWith('claude-sonnet-5.5') ||
    normalized.startsWith('claude-fable-5.1')
  ) {
    return 'claude-opus-4.6';
  }
  if (normalized.startsWith('grok-4.7')) {
    return 'grok-4.6-high-fast';
  }
  return undefined;
}

export interface ComplexitySignals {
  promptChars: number;
  fileCount?: number;
  hasSecurityDomain?: boolean;
  hasMultiDomain?: boolean;
  requiresArchitecture?: boolean;
  requiresRealtimeWeb?: boolean;
  hasCodeBlock?: boolean;
  requiresMonolithicContext?: boolean;
}

export interface ComplexityRoutingDecision {
  score: number;
  tier: ModelTier;
  recommendedModel: string;
  fallbackModel?: string;
  reasons: string[];
}

const TIER_ORDER: readonly ModelTier[] = ['FAST', 'HIGH_FAST', 'MEDIUM', 'HIGH'];

export function getNextCascadeTier(tier: ModelTier): ModelTier | undefined {
  const idx = TIER_ORDER.indexOf(tier);
  if (idx < 0 || idx + 1 >= TIER_ORDER.length) {
    return undefined;
  }
  return TIER_ORDER[idx + 1];
}

/**
 * Score prompt & task complexity locally in <1ms to select the optimal cost/intelligence frontier tier.
 */
export function scoreComplexity(signals: ComplexitySignals): ComplexityRoutingDecision {
  let score = 0;
  const reasons: string[] = [];

  if (signals.promptChars > 50_000) {
    score += 35;
    reasons.push('promptChars>50k(+35)');
  } else if (signals.promptChars > 12_000) {
    score += 20;
    reasons.push('promptChars>12k(+20)');
  } else if (signals.promptChars > 2_000) {
    score += 10;
    reasons.push('promptChars>2k(+10)');
  }

  const fileCount = signals.fileCount ?? 0;
  if (fileCount > 5) {
    score += 30;
    reasons.push('fileCount>5(+30)');
  } else if (fileCount > 2) {
    score += 15;
    reasons.push('fileCount>2(+15)');
  }

  if (signals.hasSecurityDomain) {
    score += 35;
    reasons.push('securityDomain(+35)');
  }
  if (signals.hasMultiDomain) {
    score += 25;
    reasons.push('multiDomain(+25)');
  }
  if (signals.requiresArchitecture) {
    score += 30;
    reasons.push('architecture(+30)');
  }
  if (signals.hasCodeBlock) {
    score += 10;
    reasons.push('codeBlock(+10)');
  }
  if (signals.requiresMonolithicContext) {
    score += 25;
    reasons.push('monolithicContext(+25)');
  }

  let tier: ModelTier;
  if (score >= 75) {
    tier = 'HIGH';
  } else if (score >= 45) {
    tier = 'MEDIUM';
  } else if (score >= 20) {
    tier = 'HIGH_FAST';
  } else {
    tier = 'FAST';
  }

  const recommendedModel = selectModelForTier(tier, signals);
  return {
    score,
    tier,
    recommendedModel,
    fallbackModel: resolveAvailabilityFallback(recommendedModel),
    reasons,
  };
}

export function selectModelForTier(
  tier: ModelTier,
  signals?: Pick<ComplexitySignals, 'requiresRealtimeWeb' | 'requiresMonolithicContext'>
): string {
  switch (tier) {
    case 'FAST':
      return signals?.requiresRealtimeWeb ? 'grok-4.6-high-fast' : 'gemini-3.8-flash';
    case 'HIGH_FAST':
      return signals?.requiresRealtimeWeb ? 'grok-4.7-high-fast' : 'gemini-4-carbon';
    case 'MEDIUM':
      return signals?.requiresMonolithicContext ? 'gemini-4-argon-medium' : 'gemini-4-neon-medium';
    case 'HIGH':
      return signals?.requiresMonolithicContext ? 'gemini-4-pro' : 'claude-sonnet-5.5-high';
  }
}

export interface QualityGateResult {
  passed: boolean;
  reasons: string[];
  nextTier?: ModelTier;
  latencyMs: number;
}

const SLOP_STUB_PATTERNS: readonly { regex: RegExp; label: string }[] = [
  { regex: /\/\/\s*TODO\b/i, label: 'Incomplete // TODO placeholder detected' },
  { regex: /\/\/\s*\.\.\.\s*rest of code/i, label: 'Truncated code placeholder detected' },
  { regex: /\.\.\.\s*existing code\s*\.\.\./i, label: 'Elided existing code marker detected' },
  { regex: /\/\*\s*\.\.\.\s*\*\//, label: 'Block ellipsis placeholder detected' },
];

/**
 * Deterministic <50ms zero-LLM heuristic quality gate deciding whether a tier output is production-ready or needs escalation.
 */
export function evaluateQualityGate(
  prompt: string,
  response: string,
  currentTier: ModelTier
): QualityGateResult {
  const start = performance.now();
  const trimmed = response.trim();
  const reasons: string[] = [];

  if (trimmed.length < 10) {
    reasons.push('Response too short or empty (<10 chars)');
  }

  const fenceMatches = trimmed.match(/```/g);
  if (fenceMatches && fenceMatches.length % 2 !== 0) {
    reasons.push('Unbalanced markdown code fence detected');
  }

  for (const check of SLOP_STUB_PATTERNS) {
    if (check.regex.test(trimmed)) {
      reasons.push(check.label);
    }
  }

  if ((currentTier === 'MEDIUM' || currentTier === 'HIGH') && prompt.length > 200 && trimmed.length < 40) {
    let isValidJson = false;
    try {
      JSON.parse(trimmed);
      isValidJson = true;
    } catch {
      isValidJson = false;
    }
    if (!isValidJson) {
      reasons.push('Insufficient response substance for complex prompt');
    }
  }

  const passed = reasons.length === 0;
  return {
    passed,
    reasons,
    nextTier: passed ? undefined : getNextCascadeTier(currentTier),
    latencyMs: Number((performance.now() - start).toFixed(3)),
  };
}

export interface ThinkingTaskDescriptor {
  isMissionCritical?: boolean;
  fileCount?: number;
  complexityTier?: ModelTier;
  requiresFormalProof?: boolean;
  promptChars?: number;
}

export interface ThinkingBudgetDecision {
  profile: ThinkingProfile;
  budgetTokens: number;
  reasoningEffort: 'low' | 'medium' | 'high';
  missionCriticalFloorApplied: boolean;
}

const THINKING_BUDGET_MAP: Record<
  ThinkingProfile,
  { budgetTokens: number; reasoningEffort: 'low' | 'medium' | 'high' }
> = {
  speed: { budgetTokens: 1024, reasoningEffort: 'low' },
  balanced: { budgetTokens: 8192, reasoningEffort: 'medium' },
  deep: { budgetTokens: 32768, reasoningEffort: 'high' },
  exhaustive: { budgetTokens: 65536, reasoningEffort: 'high' },
};

/**
 * Resolve dynamic System-2 thinking budget across speed/balanced/deep/exhaustive profiles, enforcing >= 32,768 floor on mission-critical work.
 */
export function resolveThinkingBudget(
  task: ThinkingTaskDescriptor,
  override?: ThinkingProfile
): ThinkingBudgetDecision {
  let profile: ThinkingProfile;
  if (override) {
    profile = override;
  } else if (task.requiresFormalProof) {
    profile = 'exhaustive';
  } else if (
    task.isMissionCritical ||
    task.complexityTier === 'HIGH' ||
    (task.fileCount ?? 0) > 5
  ) {
    profile = 'deep';
  } else if (
    task.complexityTier === 'MEDIUM' ||
    (task.fileCount ?? 0) >= 2 ||
    (task.promptChars ?? 0) > 12_000
  ) {
    profile = 'balanced';
  } else {
    profile = 'speed';
  }

  let missionCriticalFloorApplied = false;
  if (
    (task.isMissionCritical || task.requiresFormalProof) &&
    (profile === 'speed' || profile === 'balanced')
  ) {
    profile = task.requiresFormalProof ? 'exhaustive' : 'deep';
    missionCriticalFloorApplied = true;
  }

  const resolved = THINKING_BUDGET_MAP[profile];
  return {
    profile,
    budgetTokens: resolved.budgetTokens,
    reasoningEffort: resolved.reasoningEffort,
    missionCriticalFloorApplied,
  };
}

/**
 * Translate Centaury thinking decision into native provider request fields.
 */
export function formatProviderThinkingPayload(
  provider: FrontierProvider,
  decision: ThinkingBudgetDecision
): Record<string, unknown> {
  switch (provider) {
    case 'gemini':
      return { thinkingConfig: { thinkingBudget: decision.budgetTokens } };
    case 'anthropic':
      return { thinking: { type: 'enabled', budget_tokens: decision.budgetTokens } };
    case 'xai':
    case 'openai-compatible':
      return { reasoning_effort: decision.reasoningEffort };
    case 'mock':
      return { thinkingProfile: decision.profile, thinkingBudget: decision.budgetTokens };
  }
}

export interface CanonicalToolDefinition {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface KvPrefixAuditResult {
  stable: boolean;
  warnings: string[];
  sha256: string;
  estimatedTokens: number;
}

function canonicalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeValue(item));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    const keys = Object.keys(value as Record<string, unknown>).sort((a, b) => a.localeCompare(b));
    for (const key of keys) {
      const prop = (value as Record<string, unknown>)[key];
      if (prop !== undefined) {
        out[key] = canonicalizeValue(prop);
      }
    }
    return out;
  }
  return value;
}

/**
 * Serialize JSON deterministically by recursively sorting object keys alphabetically for KV-cache prefix hits.
 */
export function serializeCanonicalJson(value: unknown): string {
  return JSON.stringify(canonicalizeValue(value));
}

/**
 * Sort tool declarations alphabetically by name and canonicalize nested schema keys to prevent cache invalidation.
 */
export function sortToolsCanonically<T extends { name: string; inputSchema?: Record<string, unknown> }>(
  tools: readonly T[]
): T[] {
  return [...tools]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((tool) =>
      tool.inputSchema
        ? { ...tool, inputSchema: canonicalizeValue(tool.inputSchema) as Record<string, unknown> }
        : { ...tool }
    );
}

const VOLATILE_PREFIX_CHECKS: readonly { regex: RegExp; warning: string }[] = [
  {
    regex: /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    warning: 'Volatile ISO-8601 timestamp detected in static prefix; move to tail turn payload.',
  },
  {
    regex: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
    warning: 'Volatile UUID detected in static prefix; move to tail turn payload.',
  },
  {
    regex: /\b1[6-9]\d{11}\b/,
    warning: 'Volatile epoch-ms timestamp detected in static prefix; move to tail turn payload.',
  },
];

/**
 * Audit a static system prefix for cache-busting volatile tokens and compute its deterministic SHA-256 fingerprint.
 */
export function auditKvCachePrefix(prefix: string): KvPrefixAuditResult {
  const warnings: string[] = [];
  for (const check of VOLATILE_PREFIX_CHECKS) {
    if (check.regex.test(prefix)) {
      warnings.push(check.warning);
    }
  }
  const sha256 = new Bun.CryptoHasher('sha256').update(prefix).digest('hex');
  return {
    stable: warnings.length === 0,
    warnings,
    sha256,
    estimatedTokens: Math.ceil(prefix.length / 4),
  };
}

/**
 * Assemble a byte-deterministic KV-cache system prefix (directives -> canonical sorted tools -> canonical context map).
 */
export function compileCanonicalPrefix(parts: {
  directives: string;
  tools?: readonly CanonicalToolDefinition[];
  contextMap?: Record<string, unknown>;
}): { prefix: string; audit: KvPrefixAuditResult } {
  const segments: string[] = [parts.directives.trim()];

  if (parts.tools && parts.tools.length > 0) {
    const sorted = sortToolsCanonically(parts.tools);
    segments.push(`[TOOLS_CANONICAL]\n${serializeCanonicalJson(sorted)}`);
  }

  if (parts.contextMap && Object.keys(parts.contextMap).length > 0) {
    segments.push(`[CONTEXT_MAP_CANONICAL]\n${serializeCanonicalJson(parts.contextMap)}`);
  }

  const prefix = segments.filter(Boolean).join('\n\n');
  return {
    prefix,
    audit: auditKvCachePrefix(prefix),
  };
}

export interface StructuredSchemaLike<T = unknown> {
  parse(data: unknown): T;
  safeParse?(
    data: unknown
  ): { success: true; data: T } | { success: false; error: { message?: string } };
  _def?: object;
  description?: string;
}

/**
 * Convert a strict JSON Schema into Google Gemini's OpenAPI-subset `responseSchema` format.
 */
export function toGeminiResponseSchema(jsonSchema: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  if (Array.isArray(jsonSchema.anyOf)) {
    const nonNull = jsonSchema.anyOf.filter(
      (item): item is Record<string, unknown> =>
        typeof item === 'object' && item !== null && (item as Record<string, unknown>).type !== 'null'
    );
    const hasNull = nonNull.length !== jsonSchema.anyOf.length;
    if (nonNull.length === 1) {
      const converted = toGeminiResponseSchema(nonNull[0]);
      if (hasNull) converted.nullable = true;
      if (typeof jsonSchema.description === 'string' && !converted.description) {
        converted.description = jsonSchema.description;
      }
      return converted;
    }
  }

  for (const [key, val] of Object.entries(jsonSchema)) {
    if (key === 'additionalProperties') continue;
    if (key === 'const') {
      out.enum = [val];
      continue;
    }
    if (key === 'properties' && val && typeof val === 'object') {
      const propsOut: Record<string, unknown> = {};
      for (const [propName, propSchema] of Object.entries(val as Record<string, unknown>)) {
        propsOut[propName] =
          propSchema && typeof propSchema === 'object'
            ? toGeminiResponseSchema(propSchema as Record<string, unknown>)
            : propSchema;
      }
      out.properties = propsOut;
      continue;
    }
    if (key === 'items' && val && typeof val === 'object') {
      out.items = toGeminiResponseSchema(val as Record<string, unknown>);
      continue;
    }
    out[key] = val;
  }

  return out;
}

/**
 * Build native grammar-constrained decoding payload per frontier provider.
 */
export function buildStructuredContractPayload(
  provider: FrontierProvider,
  schemaName: string,
  strictJsonSchema: Record<string, unknown>
): Record<string, unknown> {
  switch (provider) {
    case 'gemini':
      return {
        responseMimeType: 'application/json',
        responseSchema: toGeminiResponseSchema(strictJsonSchema),
      };
    case 'anthropic':
      return {
        tools: [
          {
            name: schemaName,
            description: 'Return structured JSON strictly conforming to this contract schema.',
            input_schema: strictJsonSchema,
          },
        ],
        tool_choice: { type: 'tool', name: schemaName },
      };
    case 'openai-compatible':
    case 'xai':
      return {
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: schemaName,
            strict: true,
            schema: strictJsonSchema,
          },
        },
      };
    case 'mock':
      return {
        schemaName,
        strictJsonSchema,
      };
  }
}
