import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { validateEnv } from '../config/app.config';
import { PrismaModule } from '../shared-kernel/prisma/prisma.module';
import { QueueModule } from '../shared-kernel/queues/queue.module';
import { EventsModule } from '../shared-kernel/events/events.module';
import { AiKernelModule } from '../shared-kernel/ai/ai-kernel.module';
import { EvalModule } from './eval.module';
import { ForecastEvaluator } from './forecast-evaluator';
import { ToolSuccessReport } from './tool-success-rate';
import { RecommendationAcceptanceSimulator } from './recommendation-acceptance';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv }),
    PrismaModule,
    QueueModule,
    EventsModule,
    AiKernelModule,
    EvalModule,
  ],
})
class EvalAppModule {}

interface CliArgs {
  command: 'forecast' | 'tools' | 'agents' | 'recommendations' | 'all';
  userId?: string;
  horizon?: number;
  trials?: number;
  daysBack?: number;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { command: 'all' };
  const command = argv[0];
  if (
    command === 'forecast' ||
    command === 'tools' ||
    command === 'agents' ||
    command === 'recommendations' ||
    command === 'all'
  ) {
    out.command = command;
  }
  for (let i = 1; i < argv.length; i++) {
    const [key, value] = argv[i]!.replace(/^--/, '').split('=');
    if (!key || !value) continue;
    if (key === 'user') out.userId = value;
    if (key === 'horizon') out.horizon = Number(value);
    if (key === 'trials') out.trials = Number(value);
    if (key === 'days') out.daysBack = Number(value);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(EvalAppModule, {
    bufferLogs: true,
    logger: ['error', 'warn', 'log'],
  });

  const forecast = app.get(ForecastEvaluator);
  const toolReport = app.get(ToolSuccessReport);
  const recSim = app.get(RecommendationAcceptanceSimulator);

  console.log('═══ PFOS Evaluation Suite ═══');
  console.log(`Command: ${args.command}`);
  console.log();

  try {
    if (args.command === 'forecast' || args.command === 'all') {
      await runForecast(forecast, args);
    }
    if (args.command === 'tools' || args.command === 'all') {
      await runToolReport(toolReport, args);
    }
    if (args.command === 'agents' || args.command === 'all') {
      await runAgentReport(toolReport, args);
    }
    if (args.command === 'recommendations' || args.command === 'all') {
      await runRecommendations(recSim, args);
    }
  } catch (error) {
    console.error('Eval failed:', (error as Error).message);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

async function runForecast(eval_: ForecastEvaluator, args: CliArgs): Promise<void> {
  if (!args.userId) {
    console.log('▶ Forecast eval: skipped (no --user=<uuid> provided)');
    return;
  }
  console.log(`▶ Forecast eval (user=${args.userId}, horizon=${args.horizon ?? 30}d, trials=${args.trials ?? 1000})`);
  const report = await eval_.evaluate({
    userId: args.userId,
    testHorizonDays: args.horizon,
    trials: args.trials,
  });
  console.table({
    'MAPE %': (report.metrics.mape * 100).toFixed(2),
    'Coverage P10–P90 %': (report.metrics.coverage90 * 100).toFixed(1),
    'Coverage P25–P75 % (approx)': (report.metrics.coverage50 * 100).toFixed(1),
    'Bias': report.metrics.bias.toFixed(2),
    'RMSE': report.metrics.rmse.toFixed(2),
    'Model': report.modelVersion,
  });
}

async function runToolReport(report: ToolSuccessReport, args: CliArgs) {
  const days = args.daysBack ?? 30;
  console.log(`▶ Tool success rate (last ${days}d)`);
  const rows = await report.perTool(days);
  if (rows.length === 0) {
    console.log('  No tool invocations recorded.');
    return;
  }
  console.table(
    rows.map((r) => ({
      tool: r.toolName,
      total: r.totalCalls,
      ok: r.ok,
      err: r.errors,
      'conf-required': r.confirmationRequired,
      'success%': (r.successRate * 100).toFixed(1),
      'avg ms': r.avgDurationMs ? Math.round(r.avgDurationMs) : '—',
      'p95 ms': r.p95DurationMs ?? '—',
    })),
  );
}

async function runAgentReport(report: ToolSuccessReport, args: CliArgs) {
  const days = args.daysBack ?? 30;
  console.log(`▶ Agent latency / cost (last ${days}d)`);
  const rows = await report.perAgent(days);
  if (rows.length === 0) {
    console.log('  No agent sessions recorded.');
    return;
  }
  console.table(
    rows.map((r) => ({
      agent: r.agentType,
      sessions: r.totalSessions,
      turns: r.totalTurns,
      'avg in tok': Math.round(r.avgTokensIn),
      'avg out tok': Math.round(r.avgTokensOut),
      '$/session': r.avgCostPerSessionUsd.toFixed(6),
      'p50 ms': r.p50LatencyMs ?? '—',
      'p95 ms': r.p95LatencyMs ?? '—',
    })),
  );
}

async function runRecommendations(sim: RecommendationAcceptanceSimulator, args: CliArgs) {
  if (!args.userId) {
    console.log('▶ Recommendation acceptance sim: skipped (no --user=<uuid>)');
    return;
  }
  console.log(`▶ Recommendation acceptance simulation (user=${args.userId})`);
  const result = await sim.simulate(args.userId, {
    perKind: {
      CASHFLOW: 0.85,
      BUDGET: 0.7,
      GOAL: 0.6,
      SAVING: 0.55,
      SUBSCRIPTION: 0.8,
      SPENDING: 0.4,
      BEHAVIORAL: 0.3,
    },
    defaultProb: 0.5,
  });
  console.table({
    Generated: result.generated,
    Accepted: result.accepted,
    Rejected: result.rejected,
    'Acceptance %': (result.acceptanceRate * 100).toFixed(1),
    'NDCG@5': result.ndcgAt5.toFixed(3),
    'Mean score (accepted)': result.meanScoreAccepted.toFixed(3),
    'Mean score (rejected)': result.meanScoreRejected.toFixed(3),
  });
}

void main();
