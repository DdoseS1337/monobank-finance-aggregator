import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmService } from '../../../shared-kernel/ai/llm.service';
import { ToolRegistry } from '../tools/tool-registry';
import { AgentSessionService } from '../orchestration/agent-session.service';
import { VerificationService } from '../verification/verification.service';
import { BaseAgent } from './base-agent';

@Injectable()
export class ForecasterAgent extends BaseAgent {
  protected readonly agentType = 'forecaster';
  protected readonly systemPrompt = `You are the Forecaster sub-agent. You help the user understand cashflow
projections and run what-if scenarios.

Rules:
- Always start by calling get_cashflow_summary to ground the conversation in
  the latest projection.
- For "what if X" questions, build a Scenario via run_scenario with the
  appropriate variables (INCOME_DELTA, CATEGORY_DELTA, NEW_GOAL, NEW_RECURRING).
- Quote percentile balances (P10/P50/P90) and deficit windows verbatim — do
  not paraphrase numbers.
- Respond in Ukrainian. End with a one-line takeaway ("Висновок: …").`;
  protected readonly toolNames = [
    'get_cashflow',
    'get_cashflow_summary',
    'get_goals',
    'run_scenario',
    'get_fx_rate',
    'lookup_education',
    'calculate',
    'recall_memory',
  ];

  constructor(
    llm: LlmService,
    registry: ToolRegistry,
    sessions: AgentSessionService,
    verifier: VerificationService,
    config: ConfigService,
  ) {
    super(llm, registry, sessions, verifier, config);
  }
}
