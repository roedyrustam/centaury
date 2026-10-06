/**
 * @file rpc.ts
 * @description Zero-codegen Type-Safe RPC dispatcher and procedure engine for Centaury
 */

import { z } from 'zod';
import { CentauryContext } from './context';

export interface ProcedureDefinition<TInput = unknown, TOutput = unknown> {
  inputSchema?: z.ZodType<TInput>;
  description?: string;
  handler: (args: { input: TInput; ctx: CentauryContext }) => Promise<TOutput> | TOutput;
}

export class CentauryRPC {
  private procedures = new Map<string, ProcedureDefinition>();

  /**
   * Register a type-safe RPC procedure
   */
  public register<TInput, TOutput>(
    name: string,
    definition: ProcedureDefinition<TInput, TOutput>
  ): this {
    this.procedures.set(name, definition as unknown as ProcedureDefinition);
    return this;
  }

  /**
   * Execute an RPC call by procedure name
   */
  public async execute(name: string, rawInput: unknown, ctx: CentauryContext): Promise<unknown> {
    const procedure = this.procedures.get(name);
    if (!procedure) {
      throw new Error(`RPC Procedure '${name}' not found`);
    }

    let parsedInput = rawInput;
    if (procedure.inputSchema) {
      const parseResult = await procedure.inputSchema.safeParseAsync(rawInput);
      if (!parseResult.success) {
        throw new Error(`Invalid RPC input for '${name}': ${parseResult.error.message}`);
      }
      parsedInput = parseResult.data;
    }

    return await procedure.handler({ input: parsedInput, ctx });
  }

  /**
   * Handle incoming /rpc HTTP request (supports single and batched RPC calls)
   */
  public async handleRequest(ctx: CentauryContext): Promise<Response> {
    if (ctx.method !== 'POST') {
      return ctx.errorResponse('Method Not Allowed', 405, 'RPC dispatcher requires POST method');
    }

    try {
      const body = await ctx.json<{ procedure: string; input?: unknown } | Array<{ id: string; procedure: string; input?: unknown }>>();

      // 1. Batched RPC call
      if (Array.isArray(body)) {
        const results = await Promise.all(
          body.map(async (call) => {
            try {
              const data = await this.execute(call.procedure, call.input, ctx);
              return { id: call.id, success: true, data };
            } catch (err) {
              return { id: call.id, success: false, error: (err as Error).message };
            }
          })
        );
        return ctx.jsonResponse(results);
      }

      // 2. Single RPC call
      if (!body.procedure) {
        return ctx.errorResponse('Bad Request', 400, "Missing 'procedure' in RPC payload");
      }

      const result = await this.execute(body.procedure, body.input, ctx);
      return ctx.jsonResponse({ success: true, data: result });
    } catch (err) {
      return ctx.errorResponse('RPC Execution Error', 400, (err as Error).message);
    }
  }

  /**
   * Introspect registered procedures for MCP Tool definitions & client types
   */
  public getMetadata(): Array<{ name: string; description?: string; hasInputSchema: boolean }> {
    const meta = [];
    for (const [name, def] of this.procedures.entries()) {
      meta.push({
        name,
        description: def.description,
        hasInputSchema: !!def.inputSchema,
      });
    }
    return meta;
  }
}
