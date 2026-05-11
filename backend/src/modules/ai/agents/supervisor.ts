import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../../../shared-kernel/ai/llm.service';
import { AnalystAgent } from './analyst.agent';
import { PlannerAgent } from './planner.agent';
import { ForecasterAgent } from './forecaster.agent';
import { BaseAgent, AgentRunInput, AgentRunOutput } from './base-agent';

export type AgentName = 'analyst' | 'planner' | 'forecaster';

const ROUTING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    agent: { type: 'string', enum: ['analyst', 'planner', 'forecaster'] },
    rationale: { type: 'string', maxLength: 200 },
  },
  required: ['agent', 'rationale'],
};

const ROUTING_PROMPT = `You are the Supervisor that routes a user's message to ONE of three sub-agents:

  - "analyst"     → for descriptive questions: "how much did I spend on X",
                    "what does my budget look like", "explain this recommendation".
  - "planner"     → for state-changing intents: "create a goal", "add 1000 to X",
                    "accept that recommendation", "increase budget for groceries".
  - "forecaster"  → for prediction / scenario questions: "will I have enough by",
                    "what if I get a 10% raise", "show cashflow", "deficit risk".

Output JSON: { "agent": "...", "rationale": "..." } following the schema.`;

const KEYWORD_OVERRIDES: Record<AgentName, RegExp[]> = {
  planner: [
    /створ(и|ити|іть|ю)/i,
    /додай/i,
    /додати/i,
    /прийми/i,
    /прийняти/i,
    /змін(и|іть|ити)/i,
    /перенеси/i,
    /переведи/i,
    /accept|create|add/i,
  ],
  forecaster: [
    /прогноз/i,
    /дефіцит/i,
    /сценар/i,
    /\bcashflow\b/i,
    /\bif\b|якщо я/i,
    /\bпрогноз\b/i,
  ],
  analyst: [/скільки/i, /що\b/i, /де я/i, /\bпокаж(и|іть)\b/i, /how much/i, /\bwhich\b/i],
};

/**
 * Supervisor routes a user message to one sub-agent.
 *
 *   1. Cheap pre-routing via keyword overrides (handles obvious cases).
 *   2. If still ambiguous and LLM is available — ask LLM for the agent.
 *   3. Default fallback: analyst.
 *
 * Rationale lives in the audit log so we can review routing quality later.
 */
@Injectable()
export class SupervisorAgent {
  private readonly logger = new Logger(SupervisorAgent.name);

  constructor(
    private readonly llm: LlmService,
    private readonly analyst: AnalystAgent,
    private readonly planner: PlannerAgent,
    private readonly forecaster: ForecasterAgent,
  ) {}

  async route(message: string): Promise<{ agent: AgentName; rationale: string }> {
    const keywordHit = this.keywordVote(message);
    if (keywordHit) {
      return { agent: keywordHit, rationale: `keyword:${keywordHit}` };
    }
    if (!this.llm.isAvailable()) {
      return { agent: 'analyst', rationale: 'fallback:no-llm' };
    }
    const completion = await this.llm.complete({
      systemPrompt: ROUTING_PROMPT,
      userPrompt: message,
      jsonSchema: { name: 'routing_schema', schema: ROUTING_SCHEMA },
      cheap: true,
      temperature: 0.1,
      maxTokens: 80,
    });
    const json = completion?.json as { agent?: AgentName; rationale?: string } | null;
    if (!json?.agent) return { agent: 'analyst', rationale: 'fallback:llm-empty' };
    return { agent: json.agent, rationale: json.rationale ?? 'llm-routed' };
  }

  /** Run via the routed agent. */
  async runRouted(input: AgentRunInput): Promise<{ agent: AgentName; rationale: string; output: AgentRunOutput }> {
    const routed = await this.route(input.userMessage);
    const agent = this.pick(routed.agent);
    const output = await agent.run(input);
    return { ...routed, output };
  }

  private pick(agent: AgentName): BaseAgent {
    switch (agent) {
      case 'analyst':
        return this.analyst;
      case 'planner':
        return this.planner;
      case 'forecaster':
        return this.forecaster;
    }
  }

  private keywordVote(message: string): AgentName | null {
    const scores = { analyst: 0, planner: 0, forecaster: 0 };
    for (const [agent, patterns] of Object.entries(KEYWORD_OVERRIDES) as Array<[AgentName, RegExp[]]>) {
      for (const re of patterns) {
        if (re.test(message)) scores[agent] += 1;
      }
    }
    const best = (Object.entries(scores) as Array<[AgentName, number]>).sort((a, b) => b[1] - a[1])[0]!;
    if (best[1] === 0) return null;
    return best[0];
  }
}
