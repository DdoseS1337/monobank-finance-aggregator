import { Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { LlmService } from '../../../shared-kernel/ai/llm.service';
import { ConfigService } from '@nestjs/config';
import { ToolDefinition, toOpenAiFunction, ToolResult } from '../tools/tool.interface';
import { ToolRegistry } from '../tools/tool-registry';
import { AgentSessionService } from '../orchestration/agent-session.service';
import {
  VerificationReport,
  VerificationService,
} from '../verification/verification.service';

export interface AgentRunInput {
  userId: string;
  sessionId: string;
  userMessage: string;
  /** History from prior turns; kept short to control tokens. */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface AgentRunOutput {
  text: string;
  pendingConfirmations: Array<{ stagedActionId: string; preview: unknown; toolName: string }>;
  toolCalls: Array<{ name: string; ok: boolean; input?: unknown; output: unknown }>;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
  /** Hallucination-detection report on the final assistant text. */
  verification?: VerificationReport;
  /** True if we asked the model to redraft after the first answer failed verification. */
  verificationRetried?: boolean;
}

const MAX_TOOL_LOOPS = 10;

/**
 * Base class shared by all sub-agents.
 *
 * Implements the ReAct-ish loop on top of OpenAI function calling:
 *
 *   while not stop:
 *     completion = LLM(messages, tools=this.toolNames)
 *     if completion has tool_calls:
 *       for each tool_call:
 *         result = registry.execute(tool_call)
 *         messages.append(tool, result)
 *         if result is CONFIRMATION_REQUIRED → record, but keep going
 *     else:
 *       return completion.message
 *     loop_count++
 *     if loop_count >= MAX → stop (safety net)
 *
 * Sub-classes override `systemPrompt` and `toolNames` only.
 */
export abstract class BaseAgent {
  protected readonly logger: Logger;
  protected abstract readonly agentType: string;
  protected abstract readonly systemPrompt: string;
  protected abstract readonly toolNames: string[];

  protected readonly client: OpenAI | null;
  protected readonly defaultModel: string;
  protected readonly cheapModel: string;
  protected readonly verificationEnabled: boolean;

  protected constructor(
    protected readonly llm: LlmService,
    protected readonly registry: ToolRegistry,
    protected readonly sessions: AgentSessionService,
    protected readonly verifier: VerificationService,
    config: ConfigService,
  ) {
    this.logger = new Logger(this.constructor.name);
    const apiKey = config.get<string>('OPENAI_API_KEY', '');
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
    this.defaultModel = config.get<string>('OPENAI_MODEL_DEFAULT', 'gpt-4o');
    this.cheapModel = config.get<string>('OPENAI_MODEL_CHEAP', 'gpt-4o-mini');
    // Eval-mode hook: set AI_VERIFICATION_ENABLED=false in .env to disable
    // the verification layer so we can A/B-compare against the same agent
    // pipeline without rebuilding. Defaults to true.
    this.verificationEnabled =
      config.get<string>('AI_VERIFICATION_ENABLED', 'true') !== 'false';
  }

  async run(input: AgentRunInput): Promise<AgentRunOutput> {
    if (!this.client || !this.llm.isAvailable()) {
      return this.fallbackResponse(input);
    }

    const tools = this.registry.subset(this.toolNames);
    if (tools.length === 0) {
      return this.fallbackResponse(input);
    }

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: this.buildRuntimeContext() },
      { role: 'system', content: this.systemPrompt },
    ];
    for (const m of input.history ?? []) {
      messages.push({ role: m.role, content: m.content });
    }
    messages.push({ role: 'user', content: input.userMessage });

    const totals = { tokensIn: 0, tokensOut: 0, costUsd: 0 };
    const toolResults: AgentRunOutput['toolCalls'] = [];
    const pendingConfirmations: AgentRunOutput['pendingConfirmations'] = [];
    let verificationRetried = false;
    let consecutiveBadCalls = 0;

    for (let loop = 0; loop < MAX_TOOL_LOOPS; loop++) {
      const start = Date.now();
      let completion: OpenAI.Chat.Completions.ChatCompletion;
      try {
        completion = await this.client.chat.completions.create({
          model: this.cheapModel,
          messages,
          tools: tools.map((t) => toOpenAiFunction(t)),
          tool_choice: 'auto',
          temperature: 0.4,
          max_tokens: 800,
        });
      } catch (error) {
        this.logger.warn(`LLM call failed: ${(error as Error).message}`);
        return this.fallbackResponse(input);
      }
      const elapsed = Date.now() - start;
      const usage = completion.usage;
      totals.tokensIn += usage?.prompt_tokens ?? 0;
      totals.tokensOut += usage?.completion_tokens ?? 0;
      totals.costUsd += this.estimateCost(this.cheapModel, usage?.prompt_tokens ?? 0, usage?.completion_tokens ?? 0);

      const message = completion.choices[0]?.message;
      if (!message) break;

      // Persist assistant turn (intermediate or final).
      const assistantTurn = await this.sessions.appendTurn({
        sessionId: input.sessionId,
        role: 'ASSISTANT',
        content: message.content ?? null,
        toolCalls: message.tool_calls,
        latencyMs: elapsed,
        tokensIn: usage?.prompt_tokens,
        tokensOut: usage?.completion_tokens,
        costUsd: this.estimateCost(this.cheapModel, usage?.prompt_tokens ?? 0, usage?.completion_tokens ?? 0),
      });

      messages.push(message);

      const toolCalls = message.tool_calls ?? [];
      if (toolCalls.length === 0) {
        const finalText = message.content ?? '';
        // We always compute the report (cheap, deterministic) so eval logs
        // capture the raw hallucination metric even when the retry+block
        // behaviour is disabled. The flag only controls whether we ACT on
        // unverified claims by asking the model to redraft.
        const verification = this.verifier.verifyResponse(
          finalText,
          toolResults.map((t) => t.output),
          toolResults.filter((t) => t.ok).map((t) => ({
            name: t.name,
            input: t.input,
            output: t.output,
          })),
          input.userMessage,
        );

        if (
          this.verificationEnabled &&
          !verificationRetried &&
          verification.unverifiedCount > 0 &&
          loop < MAX_TOOL_LOOPS - 1
        ) {
          verificationRetried = true;
          const offending = verification.unverified
            .map((c) => c.rawText)
            .slice(0, 6)
            .join(', ');
          messages.push({
            role: 'system',
            content:
              'VERIFICATION FAILURE: the following numeric claims do not match any value returned by your tool calls in this turn: ' +
              offending +
              '. Redraft the answer using ONLY values that were actually returned by tool calls. ' +
              'If you need a different number, call the appropriate tool first. Do not invent numbers.',
          });
          await this.sessions.appendTurn({
            sessionId: input.sessionId,
            role: 'SYSTEM',
            content: `verification_retry: ${verification.unverifiedCount}/${verification.total} unverified`,
            reasoningTrace: { unverified: verification.unverified },
          });
          continue;
        }

        // Persist the final verification report on the turn for analytics.
        await this.sessions.appendTurn({
          sessionId: input.sessionId,
          role: 'SYSTEM',
          content: 'verification_report',
          reasoningTrace: {
            verification,
            retried: verificationRetried,
          },
        });

        return {
          text: finalText,
          pendingConfirmations,
          toolCalls: toolResults,
          ...totals,
          verification,
          verificationRetried,
        };
      }

      let productiveCallInLoop = false;
      for (const call of toolCalls) {
        if (call.type !== 'function') continue;
        const tool = this.registry.get(call.function.name);
        if (!tool) {
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify({ ok: false, error: 'Unknown tool' }),
          });
          // Surface invalid tool calls so the UI / eval logs can see what the
          // model tried, instead of silently burning loop budget.
          toolResults.push({
            name: call.function.name,
            ok: false,
            input: call.function.arguments,
            output: { kind: 'UNKNOWN_TOOL', name: call.function.name },
          });
          continue;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(call.function.arguments || '{}');
        } catch {
          parsed = {};
        }
        const validation = tool.inputSchema.safeParse(parsed);
        if (!validation.success) {
          const errMsg = validation.error.issues.map((i) => i.message).join('; ');
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify({ ok: false, error: 'VALIDATION', message: errMsg }),
          });
          toolResults.push({
            name: tool.name,
            ok: false,
            input: parsed,
            output: { kind: 'VALIDATION', message: errMsg },
          });
          continue;
        }
        productiveCallInLoop = true;
        const callStart = Date.now();
        const result = await tool.execute(validation.data, {
          userId: input.userId,
          agentSessionId: input.sessionId,
          turnId: assistantTurn.id,
        });
        const callDuration = Date.now() - callStart;

        await this.sessions.logToolInvocation({
          turnId: assistantTurn.id,
          toolName: tool.name,
          input: validation.data,
          output: result.ok ? result.data : null,
          status: this.statusFromResult(result),
          durationMs: callDuration,
          error: result.ok ? null : result.error,
        });

        const pendingError =
          !result.ok && result.error.kind === 'CONFIRMATION_REQUIRED'
            ? (result.error as Extract<
                typeof result.error,
                { kind: 'CONFIRMATION_REQUIRED' }
              >)
            : null;

        toolResults.push({
          name: tool.name,
          // A staged-action waiting for user confirmation is a SUCCESS for the
          // tool — only hard failures should be surfaced as ✗.
          ok: result.ok || pendingError !== null,
          input: validation.data,
          output: result.ok ? result.data : result.error,
        });
        if (pendingError) {
          pendingConfirmations.push({
            stagedActionId: pendingError.stagedActionId,
            preview: pendingError.preview,
            toolName: tool.name,
          });
        }

        // What the LLM sees in the tool-result message. Re-shape pending
        // confirmations as positive outcomes — `ok:false` pushes the model
        // to retry, creating duplicate staged actions. The note tells it
        // to summarise and stop.
        const llmContent = pendingError
          ? JSON.stringify({
              ok: true,
              status: 'AWAITING_USER_CONFIRMATION',
              stagedActionId: pendingError.stagedActionId,
              preview: pendingError.preview,
              note:
                'The action has been staged successfully. The user will see a Confirm/Cancel card in the chat UI. DO NOT call this mutation tool again — instead, respond with a one-paragraph Ukrainian summary of what was staged and tell the user to press Confirm.',
            })
          : JSON.stringify(result);

        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: llmContent,
        });
      }

      // Circuit breaker: if the model keeps emitting only unknown-tool or
      // validation-failed calls, abort early instead of burning the full
      // loop budget. Three strikes is enough signal that it's stuck.
      if (productiveCallInLoop) {
        consecutiveBadCalls = 0;
      } else {
        consecutiveBadCalls += 1;
        if (consecutiveBadCalls >= 3) {
          this.logger.warn(
            `Aborting agent loop after ${consecutiveBadCalls} consecutive ` +
              `invalid tool-call attempts (sessionId=${input.sessionId}).`,
          );
          break;
        }
      }
    }

    // Loop budget exhausted — return last assistant text we have.
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    return {
      text:
        typeof lastAssistant?.content === 'string'
          ? lastAssistant.content
          : 'Перевищено ліміт міркування. Спробуйте уточнити запит.',
      pendingConfirmations,
      toolCalls: toolResults,
      ...totals,
    };
  }

  private statusFromResult(result: ToolResult<unknown>): 'OK' | 'ERROR' | 'CONFIRMATION_REQUIRED' {
    if (result.ok) return 'OK';
    return result.error.kind === 'CONFIRMATION_REQUIRED' ? 'CONFIRMATION_REQUIRED' : 'ERROR';
  }

  private estimateCost(model: string, tokensIn: number, tokensOut: number): number {
    const rates: Record<string, { input: number; output: number }> = {
      'gpt-4o': { input: 2.5, output: 10 },
      'gpt-4o-mini': { input: 0.15, output: 0.6 },
    };
    const rate = rates[model];
    if (!rate) return 0;
    return (tokensIn * rate.input + tokensOut * rate.output) / 1_000_000;
  }

  private buildRuntimeContext(): string {
    const now = new Date();
    const tz = 'Europe/Kyiv';
    const isoDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
    const weekday = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'long',
    }).format(now);
    const isoMonth = isoDate.slice(0, 7);
    const monthStart = `${isoMonth}-01`;
    const [yearStr, monthStr] = isoMonth.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const prevYear = month === 1 ? year - 1 : year;
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevMonthIso = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
    return [
      'Runtime context (use these absolute dates whenever the user uses relative time references):',
      `- Today: ${isoDate} (${weekday}), timezone ${tz}.`,
      `- Current ISO month: ${isoMonth}; month-to-date window starts at ${monthStart}.`,
      `- Previous full month: ${prevMonthIso}.`,
      '- Default user currency: UAH.',
      'When you call a tool that accepts dates (e.g. get_transactions fromDate/toDate, spending ranges), always resolve relative phrases ("цей місяць", "минулий тиждень", "за рік") into absolute ISO dates derived from the values above.',
    ].join('\n');
  }

  private fallbackResponse(_input: AgentRunInput): AgentRunOutput {
    return {
      text:
        'AI-агент тимчасово недоступний (немає API ключа або помилка LLM). ' +
        'Скористайтесь UI: бюджети, цілі та рекомендації працюють у звичайному режимі.',
      pendingConfirmations: [],
      toolCalls: [],
      costUsd: 0,
      tokensIn: 0,
      tokensOut: 0,
    };
  }

  /** Used by supervisor to expose per-agent capability — read-only. */
  describeAvailableTools(): Array<Pick<ToolDefinition<unknown, unknown>, 'name' | 'description'>> {
    return this.registry.subset(this.toolNames).map((t) => ({
      name: t.name,
      description: t.description,
    }));
  }
}
