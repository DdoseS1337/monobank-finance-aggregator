import { Injectable, Logger } from '@nestjs/common';
import { SupervisorAgent, AgentName } from '../agents/supervisor';
import { AgentSessionService } from '../orchestration/agent-session.service';
import { GuardrailsService } from '../guardrails/guardrails.service';
import { StagedActionsService } from '../orchestration/staged-actions.service';
import { StagedActionExecutor } from '../tools/mutation/mutation-tools';

const REFUSAL_MESSAGE =
  'Не можу виконати цей запит — він не стосується керування персональними фінансами. ' +
  'Спробуйте запитати про бюджети, цілі, рекомендації чи прогноз cashflow.';

export interface ChatInput {
  userId: string;
  sessionId?: string;
  message: string;
}

export interface ChatOutput {
  sessionId: string;
  agent: AgentName | 'guardrail-blocked';
  rationale: string;
  text: string;
  pendingConfirmations: Array<{ stagedActionId: string; preview: unknown; toolName: string }>;
  toolCalls: Array<{ name: string; ok: boolean }>;
  flags: string[];
  costUsd: number;
  verification?: {
    total: number;
    verified: number;
    unverified: number;
    hallucinationRate: number;
    retried: boolean;
    unverifiedClaims: string[];
  };
}

@Injectable()
export class AiChatService {
  private readonly logger = new Logger(AiChatService.name);

  constructor(
    private readonly supervisor: SupervisorAgent,
    private readonly sessions: AgentSessionService,
    private readonly guardrails: GuardrailsService,
    private readonly staged: StagedActionsService,
    private readonly executor: StagedActionExecutor,
  ) {}

  async chat(input: ChatInput): Promise<ChatOutput> {
    const guard = this.guardrails.inspect(input.message);
    if (!guard.allowed) {
      return {
        sessionId: input.sessionId ?? 'guardrail-blocked',
        agent: 'guardrail-blocked',
        rationale: 'guardrail',
        text: REFUSAL_MESSAGE,
        pendingConfirmations: [],
        toolCalls: [],
        flags: guard.flags,
        costUsd: 0,
      };
    }

    const sessionId = input.sessionId ?? (await this.sessions.startSession(input.userId, 'supervisor'));

    await this.sessions.appendTurn({
      sessionId,
      role: 'USER',
      content: guard.redactedMessage,
      reasoningTrace: { flags: guard.flags },
    });

    const history = await this.sessions
      .getRecentTurns(sessionId, 10)
      .then((turns) =>
        turns
          .filter((t) => t.role === 'USER' || t.role === 'ASSISTANT')
          .filter((t) => typeof t.content === 'string' && (t.content as string).length > 0)
          .map((t) => ({
            role: t.role === 'USER' ? ('user' as const) : ('assistant' as const),
            content: t.content as string,
          })),
      );

    // Drop the very last user turn we just appended (it's the current input).
    const trimmedHistory = history.slice(0, Math.max(0, history.length - 1));

    const routed = await this.supervisor.runRouted({
      userId: input.userId,
      sessionId,
      userMessage: guard.redactedMessage,
      history: trimmedHistory,
    });

    const verification = routed.output.verification
      ? {
          total: routed.output.verification.total,
          verified: routed.output.verification.verifiedCount,
          unverified: routed.output.verification.unverifiedCount,
          hallucinationRate: Number(
            routed.output.verification.hallucinationRate.toFixed(4),
          ),
          retried: routed.output.verificationRetried ?? false,
          unverifiedClaims: routed.output.verification.unverified.map(
            (c) => c.rawText,
          ),
        }
      : undefined;

    return {
      sessionId,
      agent: routed.agent,
      rationale: routed.rationale,
      text: routed.output.text,
      pendingConfirmations: routed.output.pendingConfirmations,
      toolCalls: routed.output.toolCalls.map((c) => ({ name: c.name, ok: c.ok })),
      flags: guard.flags,
      costUsd: Number(routed.output.costUsd.toFixed(6)),
      verification,
    };
  }

  async confirmStagedAction(userId: string, stagedActionId: string): Promise<unknown> {
    return this.executor.confirmAndExecute(userId, stagedActionId);
  }

  async rejectStagedAction(userId: string, stagedActionId: string): Promise<void> {
    await this.staged.reject(userId, stagedActionId);
  }

  async listPendingActions(userId: string) {
    return this.staged.listPending(userId);
  }

  async endSession(sessionId: string): Promise<void> {
    await this.sessions.endSession(sessionId);
  }
}
