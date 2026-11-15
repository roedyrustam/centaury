/**
 * @file firewall.ts
 * @description Runtime Prompt Injection Firewall, SSRF Guard, PII Redactor & Structured Output Contract Validator
 */

export type ViolationCategory = 'prompt_injection' | 'ssrf' | 'pii' | 'custom';

export interface FirewallViolation {
  category: ViolationCategory;
  ruleId: string;
  severity: number;
  match: string;
  description: string;
}

export interface FirewallRule {
  id: string;
  pattern: RegExp;
  category: ViolationCategory;
  severity: number;
  description: string;
  redact?: boolean;
}

export interface FirewallOptions {
  /** Minimum risk score (0-100) at which prompts are blocked. Default: 50 */
  blockThreshold?: number;
  /** Redact detected PII tokens in sanitizedText. Default: true */
  redactPii?: boolean;
  /** Treat PII detection alone as blocking. Default: false */
  blockOnPii?: boolean;
  /** Optional custom detection rules */
  customRules?: FirewallRule[];
}

export interface FirewallVerdict {
  allowed: boolean;
  riskScore: number;
  violations: FirewallViolation[];
  sanitizedText: string;
}

export interface StructuredOutputValidation<T extends Record<string, unknown>> {
  valid: boolean;
  missingKeys: string[];
  data?: T;
  error?: string;
}

const DEFAULT_INJECTION_RULES: FirewallRule[] = [
  {
    id: 'inj-ignore-instructions',
    pattern: /\b(ignore|disregard|forget|override)\s+(all\s+|any\s+|your\s+)?(previous|prior|above|system)\s+(instructions?|prompts?|rules?|directives?)\b/gi,
    category: 'prompt_injection',
    severity: 70,
    description: 'Attempt to override system instructions',
  },
  {
    id: 'inj-system-leak',
    pattern: /\b(reveal|print|dump|output|show|repeat)\s+(your\s+|the\s+)?(hidden\s+|initial\s+|full\s+)?system\s+prompt\b/gi,
    category: 'prompt_injection',
    severity: 65,
    description: 'Attempt to exfiltrate system prompt instructions',
  },
  {
    id: 'inj-jailbreak-persona',
    pattern: /\b(you\s+are\s+now\s+DAN|do\s+anything\s+now|developer\s+mode\s+enabled|jailbreak)\b/gi,
    category: 'prompt_injection',
    severity: 65,
    description: 'Known jailbreak persona switch pattern',
  },
  {
    id: 'inj-control-tokens',
    pattern: /(<\|im_start\|>|<\|im_end\|>|<\|system\|>|\[SYSTEM\s+OVERRIDE\]|<\/?system>)/gi,
    category: 'prompt_injection',
    severity: 75,
    description: 'Raw chat template delimiter injection attempt',
  },
];

const DEFAULT_SSRF_RULES: FirewallRule[] = [
  {
    id: 'ssrf-cloud-metadata',
    pattern: /\b(169\.254\.169\.254|metadata\.google\.internal|100\.100\.100\.200)\b/gi,
    category: 'ssrf',
    severity: 85,
    description: 'Cloud instance metadata SSRF target detected',
  },
  {
    id: 'ssrf-loopback-or-file',
    pattern: /\b((https?:\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?|file:\/\/\/?)/gi,
    category: 'ssrf',
    severity: 55,
    description: 'Internal loopback or local filesystem URI detected',
  },
];

const DEFAULT_PII_RULES: FirewallRule[] = [
  {
    id: 'pii-email',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    category: 'pii',
    severity: 20,
    description: 'Email address detected',
    redact: true,
  },
  {
    id: 'pii-secret-token',
    pattern: /\b(Bearer\s+[A-Za-z0-9._~+/=-]{12,}|sk-[A-Za-z0-9_-]{16,}|npm_[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{16,})\b/g,
    category: 'pii',
    severity: 45,
    description: 'API key or bearer token detected',
    redact: true,
  },
  {
    id: 'pii-payment-card',
    pattern: /\b(?:\d[ -]*?){13,19}\b/g,
    category: 'pii',
    severity: 35,
    description: 'Potential payment card sequence detected',
    redact: true,
  },
];

function cloneGlobalRegex(regex: RegExp): RegExp {
  const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
  return new RegExp(regex.source, flags);
}

/**
 * Runtime prompt inspection & sanitization firewall protecting Dual-Citizen AI agents.
 */
export class CentauryPromptFirewall {
  private readonly blockThreshold: number;
  private readonly redactPii: boolean;
  private readonly blockOnPii: boolean;
  private readonly rules: FirewallRule[];

  constructor(options: FirewallOptions = {}) {
    this.blockThreshold = options.blockThreshold ?? 50;
    this.redactPii = options.redactPii ?? true;
    this.blockOnPii = options.blockOnPii ?? false;
    this.rules = [
      ...DEFAULT_INJECTION_RULES,
      ...DEFAULT_SSRF_RULES,
      ...DEFAULT_PII_RULES,
      ...(options.customRules ?? []),
    ];
  }

  /**
   * Inspect an incoming prompt or tool argument string against injection, SSRF, and PII rules.
   */
  public inspectPrompt(input: string): FirewallVerdict {
    const violations: FirewallViolation[] = [];
    let riskScore = 0;

    for (const rule of this.rules) {
      const regex = cloneGlobalRegex(rule.pattern);
      const matches = input.match(regex);
      if (!matches || matches.length === 0) continue;

      riskScore += rule.severity;
      for (const m of matches.slice(0, 3)) {
        violations.push({
          category: rule.category,
          ruleId: rule.id,
          severity: rule.severity,
          match: rule.redact ? '[REDACTED]' : m.slice(0, 80),
          description: rule.description,
        });
      }
    }

    const boundedScore = Math.min(100, riskScore);
    const hasHighRiskNonPii = violations.some(
      (v) => v.category !== 'pii' && v.severity >= this.blockThreshold
    );
    const hasPii = violations.some((v) => v.category === 'pii');
    const blockedByScore = boundedScore >= this.blockThreshold && (this.blockOnPii || violations.some((v) => v.category !== 'pii'));
    const blockedByPii = this.blockOnPii && hasPii;

    return {
      allowed: !(hasHighRiskNonPii || blockedByScore || blockedByPii),
      riskScore: boundedScore,
      violations,
      sanitizedText: this.sanitizeInput(input),
    };
  }

  /**
   * Strip dangerous chat template control tokens and redact PII patterns.
   */
  public sanitizeInput(input: string): string {
    let output = input.replace(/(<\|im_start\|>|<\|im_end\|>|<\|system\|>|\[SYSTEM\s+OVERRIDE\]|<\/?system>)/gi, '');

    if (this.redactPii) {
      for (const rule of this.rules) {
        if (rule.category === 'pii' || rule.redact) {
          const regex = cloneGlobalRegex(rule.pattern);
          const tag = rule.id.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
          output = output.replace(regex, `[REDACTED:${tag}]`);
        }
      }
    }

    return output.trim();
  }

  /**
   * Verify structured JSON/object agent output contains required fields.
   */
  public validateStructuredOutput<T extends Record<string, unknown>>(
    payload: unknown,
    requiredKeys: string[]
  ): StructuredOutputValidation<T> {
    let parsed: unknown = payload;
    if (typeof payload === 'string') {
      try {
        parsed = JSON.parse(payload);
      } catch {
        return {
          valid: false,
          missingKeys: requiredKeys,
          error: 'Payload is not valid JSON',
        };
      }
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        valid: false,
        missingKeys: requiredKeys,
        error: 'Structured output must be a non-null JSON object',
      };
    }

    const record = parsed as Record<string, unknown>;
    const missingKeys = requiredKeys.filter((k) => !(k in record) || record[k] === undefined);
    if (missingKeys.length > 0) {
      return {
        valid: false,
        missingKeys,
        error: `Missing required keys: ${missingKeys.join(', ')}`,
      };
    }

    return {
      valid: true,
      missingKeys: [],
      data: record as T,
    };
  }
}
