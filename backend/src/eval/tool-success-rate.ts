import { Injectable } from '@nestjs/common';
import dayjs from 'dayjs';
import { PrismaService } from '../shared-kernel/prisma/prisma.service';

export interface ToolSuccessRow {
  toolName: string;
  totalCalls: number;
  ok: number;
  errors: number;
  confirmationRequired: number;
  successRate: number; // ok / (ok + errors), excludes CONFIRMATION_REQUIRED
  avgDurationMs: number | null;
  p95DurationMs: number | null;
}

export interface AgentLatencyRow {
  agentType: string;
  totalSessions: number;
  totalTurns: number;
  avgTokensIn: number;
  avgTokensOut: number;
  avgCostPerSessionUsd: number;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
}

@Injectable()
export class ToolSuccessReport {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Success rate per tool over the last `daysBack` days.
   * CONFIRMATION_REQUIRED is recorded separately because it represents
   * intentional human-in-the-loop pauses, not failures.
   */
  async perTool(daysBack = 30): Promise<ToolSuccessRow[]> {
    const since = dayjs().subtract(daysBack, 'day').toDate();

    const rows = await this.prisma.toolInvocation.findMany({
      where: { turn: { createdAt: { gte: since } } },
      select: { toolName: true, status: true, durationMs: true },
    });

    const buckets = new Map<
      string,
      { ok: number; err: number; conf: number; durations: number[] }
    >();
    for (const row of rows) {
      const b = buckets.get(row.toolName) ?? { ok: 0, err: 0, conf: 0, durations: [] };
      if (row.status === 'OK') b.ok++;
      else if (row.status === 'CONFIRMATION_REQUIRED') b.conf++;
      else b.err++;
      if (row.durationMs !== null) b.durations.push(row.durationMs);
      buckets.set(row.toolName, b);
    }

    const out: ToolSuccessRow[] = [];
    for (const [toolName, b] of buckets) {
      const decisive = b.ok + b.err;
      const sortedDur = [...b.durations].sort((a, b) => a - b);
      out.push({
        toolName,
        totalCalls: b.ok + b.err + b.conf,
        ok: b.ok,
        errors: b.err,
        confirmationRequired: b.conf,
        successRate: decisive === 0 ? 0 : b.ok / decisive,
        avgDurationMs:
          sortedDur.length === 0
            ? null
            : sortedDur.reduce((s, v) => s + v, 0) / sortedDur.length,
        p95DurationMs:
          sortedDur.length === 0
            ? null
            : sortedDur[Math.floor(0.95 * sortedDur.length)] ?? null,
      });
    }
    return out.sort((a, b) => b.totalCalls - a.totalCalls);
  }

  /**
   * Per-agent latency / token / cost breakdown.
   * Useful for spotting which agent is "expensive" and where to apply
   * model escalation (cheap → default).
   */
  async perAgent(daysBack = 30): Promise<AgentLatencyRow[]> {
    const since = dayjs().subtract(daysBack, 'day').toDate();
    const sessions = await this.prisma.agentSession.findMany({
      where: { startedAt: { gte: since } },
      select: {
        agentType: true,
        totalCostUsd: true,
        totalTokensIn: true,
        totalTokensOut: true,
        turns: { select: { latencyMs: true } },
      },
    });

    const buckets = new Map<
      string,
      {
        sessions: number;
        turns: number;
        tokensIn: number;
        tokensOut: number;
        cost: number;
        latencies: number[];
      }
    >();

    for (const s of sessions) {
      const b = buckets.get(s.agentType) ?? {
        sessions: 0,
        turns: 0,
        tokensIn: 0,
        tokensOut: 0,
        cost: 0,
        latencies: [],
      };
      b.sessions++;
      b.tokensIn += s.totalTokensIn ?? 0;
      b.tokensOut += s.totalTokensOut ?? 0;
      b.cost += Number(s.totalCostUsd ?? 0);
      for (const t of s.turns) {
        b.turns++;
        if (t.latencyMs !== null) b.latencies.push(t.latencyMs);
      }
      buckets.set(s.agentType, b);
    }

    const out: AgentLatencyRow[] = [];
    for (const [agentType, b] of buckets) {
      const sortedLat = [...b.latencies].sort((a, b) => a - b);
      out.push({
        agentType,
        totalSessions: b.sessions,
        totalTurns: b.turns,
        avgTokensIn: b.sessions === 0 ? 0 : b.tokensIn / b.sessions,
        avgTokensOut: b.sessions === 0 ? 0 : b.tokensOut / b.sessions,
        avgCostPerSessionUsd: b.sessions === 0 ? 0 : b.cost / b.sessions,
        p50LatencyMs:
          sortedLat.length === 0
            ? null
            : sortedLat[Math.floor(0.5 * sortedLat.length)] ?? null,
        p95LatencyMs:
          sortedLat.length === 0
            ? null
            : sortedLat[Math.floor(0.95 * sortedLat.length)] ?? null,
      });
    }
    return out.sort((a, b) => b.totalSessions - a.totalSessions);
  }
}
