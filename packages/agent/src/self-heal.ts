/**
 * @file self-heal.ts
 * @description Autonomous Self-Healing Runtime & Stack/AST Crash Diagnostics for Centaury
 */

import type { CentauryPlugin } from '@rudyrustam/core';

export type ErrorCategory =
  | 'TypeError'
  | 'ReferenceError'
  | 'ValidationError'
  | 'DatabaseError'
  | 'RuntimeError';

export interface StackFrameInfo {
  functionName: string;
  file: string;
  line: number;
  column: number;
}

export interface HealingDiagnostic {
  id: string;
  timestamp: string;
  category: ErrorCategory;
  message: string;
  context?: string;
  astTarget: string;
  frames: StackFrameInfo[];
  suggestedFix: string;
}

export interface SelfHealerOptions {
  /** Maximum diagnostics retained in the circular buffer. Default: 100 */
  maxHistory?: number;
  /** Optional callback invoked whenever a crash diagnostic is captured */
  onDiagnostic?: (diag: HealingDiagnostic) => void;
}

export interface HealingExecutionResult<T> {
  recovered: boolean;
  result?: T;
  diagnostic?: HealingDiagnostic;
}

const FRAME_REGEX = /^(?:at\s+(?:(?<fn>.+?)\s+\()?)?(?<file>.+?):(?<line>\d+):(?<col>\d+)\)?$/;

function parseStackFrames(stack?: string): StackFrameInfo[] {
  if (!stack) return [];
  const frames: StackFrameInfo[] = [];

  for (const rawLine of stack.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('at ')) continue;
    const match = FRAME_REGEX.exec(line);
    if (!match?.groups) continue;

    frames.push({
      functionName: match.groups.fn?.trim() || '<anonymous>',
      file: match.groups.file.trim(),
      line: Number(match.groups.line),
      column: Number(match.groups.col),
    });
  }

  return frames;
}

function classifyError(err: Error): { category: ErrorCategory; suggestedFix: string } {
  const msg = err.message.toLowerCase();

  if (err.name === 'TypeError' || msg.includes('undefined') || msg.includes('null')) {
    return {
      category: 'TypeError',
      suggestedFix: 'Guard nullable/undefined dereference with optional chaining (?.) and validate input before property access.',
    };
  }
  if (err.name === 'ReferenceError') {
    return {
      category: 'ReferenceError',
      suggestedFix: 'Verify symbol import or variable declaration in scope before invocation.',
    };
  }
  if (msg.includes('zod') || msg.includes('validation') || msg.includes('invalid json') || msg.includes('schema')) {
    return {
      category: 'ValidationError',
      suggestedFix: 'Validate request payload against the registered Zod/OpenAPI schema and reject malformed fields with HTTP 400.',
    };
  }
  if (msg.includes('sqlite') || msg.includes('sql') || msg.includes('constraint') || msg.includes('database')) {
    return {
      category: 'DatabaseError',
      suggestedFix: 'Inspect SQLite WAL transaction boundaries, constraint keys, or pending schema migrations.',
    };
  }

  return {
    category: 'RuntimeError',
    suggestedFix: 'Wrap failing operation with deterministic retry/circuit-breaker handling and verify upstream dependencies.',
  };
}

/**
 * Captures runtime errors, maps stack frames to AST targets, and coordinates graceful fallbacks.
 */
export class CentaurySelfHealer {
  private diagnostics: HealingDiagnostic[] = [];
  private readonly maxHistory: number;
  private readonly onDiagnostic?: (diag: HealingDiagnostic) => void;

  constructor(options: SelfHealerOptions = {}) {
    this.maxHistory = options.maxHistory ?? 100;
    this.onDiagnostic = options.onDiagnostic;
  }

  /**
   * Analyze a thrown error and store a structured healing diagnostic.
   */
  public diagnose(error: unknown, contextInfo?: string): HealingDiagnostic {
    const err = error instanceof Error ? error : new Error(String(error));
    const frames = parseStackFrames(err.stack);
    const { category, suggestedFix } = classifyError(err);
    const primaryFrame = frames[0];
    const astTarget = primaryFrame
      ? `${primaryFrame.file}:${primaryFrame.line}:${primaryFrame.column} (${primaryFrame.functionName})`
      : 'unknown';

    const diagnostic: HealingDiagnostic = {
      id: `heal-${crypto.randomUUID().slice(0, 8)}`,
      timestamp: new Date().toISOString(),
      category,
      message: err.message,
      context: contextInfo,
      astTarget,
      frames,
      suggestedFix,
    };

    this.diagnostics.push(diagnostic);
    if (this.diagnostics.length > this.maxHistory) {
      this.diagnostics.shift();
    }
    this.onDiagnostic?.(diagnostic);

    return diagnostic;
  }

  /**
   * Execute an operation with automatic exception diagnosis and optional fallback recovery.
   */
  public async executeWithHealing<T>(
    operationName: string,
    fn: () => T | Promise<T>,
    fallback?: (diag: HealingDiagnostic) => T | Promise<T>
  ): Promise<HealingExecutionResult<T>> {
    try {
      const result = await fn();
      return { recovered: false, result };
    } catch (error) {
      const diagnostic = this.diagnose(error, operationName);
      if (fallback) {
        const result = await fallback(diagnostic);
        return { recovered: true, result, diagnostic };
      }
      return { recovered: false, diagnostic };
    }
  }

  /**
   * Retrieve captured diagnostics ordered oldest-to-newest (optionally limited).
   */
  public getDiagnostics(limit = 50): HealingDiagnostic[] {
    return this.diagnostics.slice(-limit);
  }

  /**
   * Clear stored diagnostics.
   */
  public clear(): void {
    this.diagnostics = [];
  }
}

/**
 * Centaury plugin that traps uncaught route exceptions, logs diagnostics, and exposes GET /_heal/diagnostics.
 */
export function selfHealingPlugin(healer: CentaurySelfHealer = new CentaurySelfHealer()): CentauryPlugin {
  return {
    name: 'centaury:self-healing',
    version: '1.1.0',
    install(server) {
      server.use(async (ctx, next) => {
        try {
          return await next();
        } catch (err) {
          const diag = healer.diagnose(err, `${ctx.method} ${ctx.url.pathname}`);
          return ctx.jsonResponse(
            {
              type: 'https://centaury.dev/errors/self-healing-trapped',
              title: 'Runtime Error Captured by Centaury Self-Healer',
              status: 500,
              detail: diag.message,
              healing: diag,
            },
            500,
            { 'Content-Type': 'application/problem+json' }
          );
        }
      });

      server.get('/_heal/diagnostics', (ctx) => {
        const limitParam = Number(ctx.url.searchParams.get('limit') || '50');
        const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 50;
        const diagnostics = healer.getDiagnostics(limit);
        return ctx.jsonResponse({
          count: diagnostics.length,
          diagnostics,
        });
      });
    },
  };
}
