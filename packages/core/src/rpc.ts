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

export interface ProcedureMetadata {
  name: string;
  description?: string;
  hasInputSchema: boolean;
  inputSchema: Record<string, unknown>;
}

export interface ZodToJsonSchemaOptions {
  /** Enforce closed object schemas (additionalProperties: false, all properties required) for LLM structured decoding. */
  strict?: boolean;
  /** Sort object property keys alphabetically for deterministic KV-cache prefix hashing. */
  sortKeys?: boolean;
}

export type ZodSchemaInput =
  | z.ZodTypeAny
  | { _def?: object; description?: string };

function ensureNullableSchema(inner: Record<string, unknown>): Record<string, unknown> {
  if (Array.isArray(inner.anyOf)) {
    const hasNull = inner.anyOf.some(
      (item) => typeof item === 'object' && item !== null && (item as Record<string, unknown>).type === 'null'
    );
    return hasNull ? inner : { anyOf: [...inner.anyOf, { type: 'null' }] };
  }
  if (inner.type === 'null') {
    return inner;
  }
  return { anyOf: [inner, { type: 'null' }] };
}

/**
 * Convert a Zod schema into a compact JSON Schema 2020-12 / MCP / Frontier Structured Output compatible descriptor.
 */
export function zodToJsonSchema(
  schema?: ZodSchemaInput,
  options?: ZodToJsonSchemaOptions
): Record<string, unknown> {
  if (!schema) {
    return options?.strict
      ? { type: 'object', properties: {}, required: [], additionalProperties: false }
      : { type: 'object', properties: {} };
  }

  const def = (schema as unknown as { _def?: Record<string, any> })._def;
  const desc = schema.description ?? def?.description;
  const withDesc = (obj: Record<string, unknown>): Record<string, unknown> =>
    desc ? { ...obj, description: desc } : obj;

  if (!def || !def.typeName) {
    return withDesc(
      options?.strict
        ? { type: 'object', properties: {}, required: [], additionalProperties: false }
        : { type: 'object', properties: {} }
    );
  }

  switch (def.typeName) {
    case 'ZodOptional':
    case 'ZodDefault':
      return withDesc(zodToJsonSchema(def.innerType, options));

    case 'ZodNullable': {
      const inner = zodToJsonSchema(def.innerType, options);
      return withDesc(ensureNullableSchema(inner));
    }

    case 'ZodString':
      return withDesc({ type: 'string' });

    case 'ZodNumber': {
      const isInt = Array.isArray(def.checks) && def.checks.some((c: { kind?: string }) => c.kind === 'int');
      return withDesc({ type: isInt ? 'integer' : 'number' });
    }

    case 'ZodBoolean':
      return withDesc({ type: 'boolean' });

    case 'ZodEnum':
      return withDesc({ type: 'string', enum: Array.isArray(def.values) ? [...def.values] : [] });

    case 'ZodLiteral': {
      const literalType =
        typeof def.value === 'number'
          ? 'number'
          : typeof def.value === 'boolean'
            ? 'boolean'
            : 'string';
      return withDesc({ type: literalType, const: def.value });
    }

    case 'ZodArray':
      return withDesc({
        type: 'array',
        items: zodToJsonSchema(def.type, options),
      });

    case 'ZodRecord':
      return withDesc({
        type: 'object',
        additionalProperties: def.valueType ? zodToJsonSchema(def.valueType, options) : true,
      });

    case 'ZodUnion':
      return withDesc({
        anyOf: Array.isArray(def.options)
          ? def.options.map((opt: z.ZodTypeAny) => zodToJsonSchema(opt, options))
          : [],
      });

    case 'ZodObject': {
      const shapeFn = def.shape;
      const shape: Record<string, ZodSchemaInput> =
        typeof shapeFn === 'function' ? shapeFn() : shapeFn && typeof shapeFn === 'object' ? shapeFn : {};
      let entries = Object.entries(shape);
      if (options?.strict || options?.sortKeys) {
        entries = entries.sort(([a], [b]) => a.localeCompare(b));
      }

      const properties: Record<string, unknown> = {};
      const required: string[] = [];

      for (const [key, fieldSchema] of entries) {
        const fieldDef = (fieldSchema as unknown as { _def?: Record<string, any> })._def;
        const fieldType = fieldDef?.typeName as string | undefined;
        const isOptional = fieldType === 'ZodOptional' || fieldType === 'ZodDefault';

        if (options?.strict) {
          if (isOptional && fieldDef?.innerType) {
            const innerDesc =
              (fieldSchema as { description?: string }).description ?? (fieldDef?.description as string | undefined);
            const innerJson = zodToJsonSchema(fieldDef.innerType, options);
            const nullableProp = ensureNullableSchema(innerJson);
            properties[key] =
              innerDesc && !nullableProp.description
                ? { ...nullableProp, description: innerDesc }
                : nullableProp;
          } else {
            properties[key] = zodToJsonSchema(fieldSchema, options);
          }
          required.push(key);
        } else {
          properties[key] = zodToJsonSchema(fieldSchema, options);
          if (!isOptional) {
            required.push(key);
          }
        }
      }

      if (options?.strict) {
        return withDesc({
          type: 'object',
          properties,
          required,
          additionalProperties: false,
        });
      }

      return withDesc({
        type: 'object',
        properties,
        ...(required.length > 0 ? { required } : {}),
      });
    }

    default:
      return withDesc(
        options?.strict
          ? { type: 'object', properties: {}, required: [], additionalProperties: false }
          : { type: 'object', properties: {} }
      );
  }
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
  public getMetadata(): ProcedureMetadata[] {
    const meta: ProcedureMetadata[] = [];
    for (const [name, def] of this.procedures.entries()) {
      meta.push({
        name,
        description: def.description,
        hasInputSchema: !!def.inputSchema,
        inputSchema: zodToJsonSchema(def.inputSchema),
      });
    }
    return meta;
  }
}
