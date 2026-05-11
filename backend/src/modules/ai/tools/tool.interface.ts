import { z } from 'zod';

export type ToolCategory = 'READ' | 'MUTATION' | 'COGNITIVE' | 'MEMORY';

/**
 * Authorization scope for a tool — drives the audit log and
 * confirmation gating for mutations.
 *
 *   OWN_DATA   — touches only resources owned by the user
 *   AGGREGATED — touches anonymized/aggregated cross-user data (peer comparison, etc.)
 *   PUBLIC     — touches no user data (knowledge base lookups, etc.)
 */
export type AuthScope = 'OWN_DATA' | 'AGGREGATED' | 'PUBLIC';

export interface SideEffectSpec {
  /** Names of aggregates that may be written. Empty for read tools. */
  writes: string[];
  /** Domain events that may be emitted as a result. */
  emitsEvents: string[];
  /** Cost hint for tool selection (used by supervisor when budget is tight). */
  estimatedCost: 'LOW' | 'MEDIUM' | 'HIGH';
}

/**
 * Context that every tool receives.
 * Carries the authenticated user id, current agent session, and a few
 * runtime helpers (logger, request id).
 */
export interface ToolContext {
  userId: string;
  agentSessionId: string;
  turnId: string;
  /** Reason captured by the supervisor for transparency / audit. */
  reason?: string;
}

/**
 * Structured discriminated result. Tools never throw — they return a typed
 * Failure so the calling agent can decide what to do.
 */
export type ToolError =
  | { kind: 'AUTHORIZATION'; message: string }
  | { kind: 'VALIDATION'; field: string; message: string }
  | { kind: 'NOT_FOUND'; resource: string; id: string }
  | { kind: 'RATE_LIMITED'; retryAfterSeconds: number }
  | { kind: 'CONFIRMATION_REQUIRED'; stagedActionId: string; preview: unknown }
  | { kind: 'CONFLICT'; conflictingResource: string }
  | { kind: 'EXTERNAL'; service: string; details: string }
  | { kind: 'INTERNAL'; correlationId: string };

export type ToolResult<T> =
  | { ok: true; data: T; metadata?: Record<string, unknown> }
  | { ok: false; error: ToolError; retryable: boolean };

export interface ToolDefinition<TInput, TOutput> {
  readonly name: string;
  readonly category: ToolCategory;
  readonly description: string;
  readonly inputSchema: z.ZodType<TInput>;
  readonly outputSchema: z.ZodType<TOutput>;
  readonly authorization: { scope: AuthScope; requiresConfirmation: boolean };
  readonly sideEffects: SideEffectSpec;

  execute(input: TInput, ctx: ToolContext): Promise<ToolResult<TOutput>>;
}

/**
 * OpenAI function-calling format. We generate this from the input schema
 * so the LLM can call tools natively.
 */
export interface OpenAiFunctionSpec {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * Best-effort Zod → JSON schema converter for the small subset of types we use
 * in tool inputs. Handles object/string/number/boolean/enum/array/optional.
 * For anything more exotic — fall back to `{ type: 'object' }` and rely on
 * runtime validation inside the tool.
 */
export function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const def = schema._def;
  const typeName = def.typeName;

  if (typeName === 'ZodObject') {
    const shape = def.shape();
    const properties: Record<string, Record<string, unknown>> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(shape)) {
      const inner = value as z.ZodTypeAny;
      properties[key] = zodToJsonSchema(inner);
      if (!inner.isOptional()) required.push(key);
    }
    return {
      type: 'object',
      properties,
      required,
      additionalProperties: false,
    };
  }
  if (typeName === 'ZodString') {
    const out: Record<string, unknown> = { type: 'string' };
    const enumValues = (def as { values?: string[] }).values;
    if (enumValues) out.enum = enumValues;
    return out;
  }
  if (typeName === 'ZodNumber') return { type: 'number' };
  if (typeName === 'ZodBoolean') return { type: 'boolean' };
  if (typeName === 'ZodEnum') {
    return { type: 'string', enum: (def as { values: string[] }).values };
  }
  if (typeName === 'ZodArray') {
    return { type: 'array', items: zodToJsonSchema(def.type) };
  }
  if (typeName === 'ZodOptional' || typeName === 'ZodNullable') {
    return zodToJsonSchema(def.innerType);
  }
  if (typeName === 'ZodDefault') {
    return zodToJsonSchema(def.innerType);
  }
  if (typeName === 'ZodUnion') {
    return { oneOf: (def.options as z.ZodTypeAny[]).map((o) => zodToJsonSchema(o)) };
  }
  if (typeName === 'ZodLiteral') {
    return { const: (def as { value: unknown }).value };
  }
  return { type: 'object', additionalProperties: true };
}

export function toOpenAiFunction(tool: ToolDefinition<unknown, unknown>): OpenAiFunctionSpec {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: zodToJsonSchema(tool.inputSchema),
    },
  };
}
