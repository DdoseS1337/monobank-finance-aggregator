import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { validateEnv } from '../config/app.config';
import { PrismaModule } from '../shared-kernel/prisma/prisma.module';
import { QueueModule } from '../shared-kernel/queues/queue.module';
import { EventsModule } from '../shared-kernel/events/events.module';
import { AiKernelModule } from '../shared-kernel/ai/ai-kernel.module';
import { EvalModule } from './eval.module';
import { ForecastEvaluator, ForecastRollingReport } from './forecast-evaluator';
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
  rolling?: number;
  stepDays?: number;
  seed?: number;
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
    if (key === 'rolling') out.rolling = Number(value);
    if (key === 'step') out.stepDays = Number(value);
    if (key === 'seed') out.seed = Number(value);
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

  if (args.rolling && args.rolling > 1) {
    await runForecastRolling(eval_, args);
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

async function runForecastRolling(eval_: ForecastEvaluator, args: CliArgs): Promise<void> {
  const windows = args.rolling!;
  const horizon = args.horizon ?? 30;
  const stepDays = args.stepDays ?? 7;
  const trials = args.trials ?? 1000;
  const seed = args.seed ?? 42;

  console.log(
    `▶ Forecast rolling-window backtest (user=${args.userId}, windows=${windows}, ` +
      `step=${stepDays}d, horizon=${horizon}d, trials=${trials}, seed=${seed})`,
  );

  const report = await eval_.evaluateRollingWindow(args.userId!, {
    windows,
    stepDays,
    horizon,
    trials,
    seed,
  });

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.resolve(process.cwd(), '..', 'eval');
  fs.mkdirSync(outDir, { recursive: true });
  const csvPath = path.join(outDir, `forecast-rolling-${ts}.csv`);
  const mdPath = path.join(outDir, 'forecast-rolling-summary.md');

  fs.writeFileSync(csvPath, renderRollingCsv(report), 'utf8');
  fs.writeFileSync(mdPath, renderRollingMd(report), 'utf8');

  console.table(
    report.windows.map((w) => ({
      i: w.windowIndex,
      cutoff: w.cutoffDate,
      'MAPE %': (w.metrics.mape * 100).toFixed(2),
      'cov90 %': (w.metrics.coverage90 * 100).toFixed(1),
      bias: w.metrics.bias.toFixed(2),
      rmse: w.metrics.rmse.toFixed(2),
      n: w.samples,
    })),
  );
  console.log(
    `Aggregate: MAPE = ${(report.aggregate.mapeMean * 100).toFixed(2)}% ± ` +
      `${(report.aggregate.mapeStd * 100).toFixed(2)}% across ${report.aggregate.windowsUsed} windows`,
  );
  console.log(`CSV  → ${csvPath}`);
  console.log(`MD   → ${mdPath}`);
}

function renderRollingCsv(report: ForecastRollingReport): string {
  const header = 'window_index,cutoff_date,mape,coverage,bias,rmse,samples';
  const rows = report.windows.map((w) =>
    [
      w.windowIndex,
      w.cutoffDate,
      w.metrics.mape.toFixed(6),
      w.metrics.coverage90.toFixed(6),
      w.metrics.bias.toFixed(6),
      w.metrics.rmse.toFixed(6),
      w.samples,
    ].join(','),
  );
  return [header, ...rows].join('\n') + '\n';
}

function renderRollingMd(report: ForecastRollingReport): string {
  const a = report.aggregate;
  const pct = (x: number) => (x * 100).toFixed(2);
  const interpretation =
    a.mapeStd <= 0.05
      ? 'Низьке std MAPE (≤5%) свідчить про стабільність моделі поза тренувальним вікном.'
      : a.mapeStd <= 0.1
        ? 'Помірне std MAPE (5–10%) — модель прийнятно стабільна, але чутлива до зсуву вікна.'
        : 'Високе std MAPE (>10%) — прогноз сильно залежить від обраного cutoff; калібрування потребує уточнення.';

  const lines: string[] = [];
  lines.push('# Forecast — Rolling-Window Backtest');
  lines.push('');
  lines.push(
    `User: \`${report.userId}\`  ·  Model: \`${report.modelVersion}\`  ·  Generated: ${new Date().toISOString()}`,
  );
  lines.push('');
  lines.push('## Configuration');
  lines.push('');
  lines.push(`- baseCutoff: ${report.config.baseCutoff}`);
  lines.push(`- windows: ${report.config.windows}`);
  lines.push(`- stepDays: ${report.config.stepDays}`);
  lines.push(`- horizon: ${report.config.horizon}`);
  lines.push(`- trials: ${report.config.trials}`);
  lines.push(`- seed: ${report.config.seed} (per-window seed = seed + i, deterministic)`);
  lines.push('');
  lines.push('## Per-window results');
  lines.push('');
  lines.push('| i | cutoff | MAPE % | coverage P10–P90 % | bias | RMSE | n |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const w of report.windows) {
    lines.push(
      `| ${w.windowIndex} | ${w.cutoffDate} | ${pct(w.metrics.mape)} | ` +
        `${pct(w.metrics.coverage90)} | ${w.metrics.bias.toFixed(2)} | ` +
        `${w.metrics.rmse.toFixed(2)} | ${w.samples} |`,
    );
  }
  lines.push('');
  lines.push('## Aggregate');
  lines.push('');
  lines.push(`- **MAPE** = ${pct(a.mapeMean)}% ± ${pct(a.mapeStd)}% across ${a.windowsUsed} windows`);
  lines.push(`- **Coverage P10–P90** = ${pct(a.coverage90Mean)}% ± ${pct(a.coverage90Std)}%`);
  lines.push(`- **Bias** = ${a.biasMean.toFixed(2)} ± ${a.biasStd.toFixed(2)}`);
  lines.push(`- **RMSE (mean)** = ${a.rmseMean.toFixed(2)}`);
  lines.push(`- **Samples (total)** = ${a.samplesTotal}`);
  lines.push('');
  lines.push('## Interpretation');
  lines.push('');
  lines.push(interpretation);
  lines.push('');
  return lines.join('\n');
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
