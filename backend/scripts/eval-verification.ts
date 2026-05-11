/**
 * Empirical evaluation harness for the verification layer (V2).
 *
 * Reads `eval/queries.csv` (id,type,query,note) and runs each query against
 * the live `/ai/chat` endpoint of the running backend, collecting per-query:
 *
 *   - agent that handled it (analyst / planner / forecaster)
 *   - tool calls (count + names)
 *   - latency (ms)
 *   - cost (USD)
 *   - hallucination metrics (verified / total / rate / retried)
 *
 * Output: `eval/results-<timestamp>.csv`. Run twice — once with verifier
 * enabled (default) and once with `AI_VERIFICATION_ENABLED=false` in
 * backend/.env — to A/B-compare the two configurations on identical data.
 *
 * Authentication options (one of):
 *
 *   A. EVAL_TOKEN  — Supabase user access_token grabbed from the running
 *      frontend's localStorage. Simplest but expires in ~1h.
 *
 *   B. SUPABASE_JWT_SECRET + EVAL_USER_ID — script mints a fresh HS256 JWT
 *      identical to what Supabase Auth issues for that user. The guard
 *      verifies it locally. The user-id is the Supabase `auth.users.id`
 *      (UUID) of your test account — easiest source is `SELECT id FROM
 *      users LIMIT 1` after at least one successful frontend login.
 *
 * Anon key / service-role key DO NOT work — they're for the Supabase REST
 * API, not for our app's user-bearer auth.
 */
import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import jwt from 'jsonwebtoken';

interface QueryRow {
  id: string;
  type: string;
  query: string;
  note: string;
}

interface ChatResponse {
  sessionId: string;
  agent: string;
  rationale: string;
  text: string;
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

interface ResultRow {
  id: string;
  type: string;
  query: string;
  agent: string;
  rationale: string;
  toolCallCount: number;
  toolNames: string;
  responseChars: number;
  latencyMs: number;
  costUsd: number;
  verifTotal: number;
  verifVerified: number;
  verifUnverified: number;
  hallucinationRate: number;
  retried: boolean;
  unverifiedClaims: string;
  errorMessage: string;
}

function parseCsv(raw: string): QueryRow[] {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const [header, ...rest] = lines;
  if (!header) return [];
  const cols = splitCsvRow(header);
  const idIdx = cols.indexOf('id');
  const typeIdx = cols.indexOf('type');
  const queryIdx = cols.indexOf('query');
  const noteIdx = cols.indexOf('note');
  const out: QueryRow[] = [];
  for (const line of rest) {
    const f = splitCsvRow(line);
    out.push({
      id: f[idIdx] ?? '',
      type: f[typeIdx] ?? '',
      query: f[queryIdx] ?? '',
      note: noteIdx >= 0 ? f[noteIdx] ?? '' : '',
    });
  }
  return out;
}

function splitCsvRow(row: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i]!;
    if (inQuotes) {
      if (ch === '"' && row[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else if (ch === '"') {
      inQuotes = true;
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows: ResultRow[]): string {
  const headers: Array<keyof ResultRow> = [
    'id',
    'type',
    'query',
    'agent',
    'rationale',
    'toolCallCount',
    'toolNames',
    'responseChars',
    'latencyMs',
    'costUsd',
    'verifTotal',
    'verifVerified',
    'verifUnverified',
    'hallucinationRate',
    'retried',
    'unverifiedClaims',
    'errorMessage',
  ];
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(','));
  }
  return lines.join('\n');
}

async function callChat(
  apiUrl: string,
  token: string,
  message: string,
): Promise<{ response: ChatResponse; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const res = await fetch(`${apiUrl}/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ message }),
    });
    const latencyMs = Date.now() - start;
    if (!res.ok) {
      const body = await res.text();
      return {
        response: {} as ChatResponse,
        latencyMs,
        error: `HTTP ${res.status}: ${body.slice(0, 200)}`,
      };
    }
    const json = (await res.json()) as ChatResponse;
    return { response: json, latencyMs };
  } catch (err) {
    // Node's `fetch` (undici) wraps connection errors as "fetch failed" with
    // the real reason hidden in `.cause`. Surface it.
    const e = err as Error & { cause?: { code?: string; message?: string } };
    const detail = e.cause?.code
      ? `${e.message} — ${e.cause.code}${
          e.cause.message ? `: ${e.cause.message}` : ''
        }`
      : e.message;
    return {
      response: {} as ChatResponse,
      latencyMs: Date.now() - start,
      error: detail,
    };
  }
}

function summarise(results: ResultRow[]): void {
  const numeric = results.filter((r) => r.type === 'numeric' && r.errorMessage === '');
  const educational = results.filter((r) => r.type === 'educational' && r.errorMessage === '');
  const total = results.length;
  const ok = results.filter((r) => r.errorMessage === '').length;
  const errors = total - ok;

  const meanLatency =
    ok > 0
      ? results.filter((r) => !r.errorMessage).reduce((s, r) => s + r.latencyMs, 0) / ok
      : 0;
  const meanCost =
    ok > 0
      ? results.filter((r) => !r.errorMessage).reduce((s, r) => s + r.costUsd, 0) / ok
      : 0;
  const numericWithClaims = numeric.filter((r) => r.verifTotal > 0);
  const meanHalluc =
    numericWithClaims.length > 0
      ? numericWithClaims.reduce((s, r) => s + r.hallucinationRate, 0) /
        numericWithClaims.length
      : 0;
  const retriedCount = numeric.filter((r) => r.retried).length;

  console.log('\n──── SUMMARY ────');
  console.log(`Total queries:        ${total}`);
  console.log(`Successful:           ${ok}`);
  console.log(`Errors:               ${errors}`);
  console.log(`Mean latency:         ${meanLatency.toFixed(0)} ms`);
  console.log(`Mean cost:            $${meanCost.toFixed(6)}`);
  console.log(`Numeric queries:      ${numeric.length}`);
  console.log(`  with claims:        ${numericWithClaims.length}`);
  console.log(`  mean halluc rate:   ${(meanHalluc * 100).toFixed(2)}%`);
  console.log(`  retried:            ${retriedCount}`);
  console.log(`Educational queries:  ${educational.length}`);
}

function obtainToken(): { token: string; source: string } {
  if (process.env.EVAL_TOKEN) {
    return { token: process.env.EVAL_TOKEN, source: 'EVAL_TOKEN env' };
  }
  const secret = process.env.SUPABASE_JWT_SECRET;
  const userId = process.env.EVAL_USER_ID;
  if (secret && userId) {
    const email = process.env.EVAL_USER_EMAIL ?? `${userId}@eval.local`;
    const now = Math.floor(Date.now() / 1000);
    const token = jwt.sign(
      {
        sub: userId,
        email,
        role: 'authenticated',
        aud: 'authenticated',
        iat: now,
        exp: now + 60 * 60, // 1h
      },
      secret,
      { algorithm: 'HS256' },
    );
    return { token, source: `minted for user ${userId}` };
  }
  throw new Error(
    'No auth available. Set EITHER:\n' +
      '  EVAL_TOKEN=<supabase access_token>  (from frontend localStorage)\n' +
      '  ── OR ──\n' +
      '  SUPABASE_JWT_SECRET=<from Supabase project Settings → API → JWT Settings>\n' +
      '  EVAL_USER_ID=<UUID of your test user>\n' +
      '  EVAL_USER_EMAIL=<optional, defaults to <userId>@eval.local>',
  );
}

async function fetchServerConfig(
  apiUrl: string,
): Promise<{ verificationEnabled: boolean } | null> {
  try {
    const res = await fetch(`${apiUrl}/health/config`);
    if (!res.ok) return null;
    const json = (await res.json()) as { ai?: { verificationEnabled?: boolean } };
    if (typeof json.ai?.verificationEnabled === 'boolean') {
      return { verificationEnabled: json.ai.verificationEnabled };
    }
    return null;
  } catch {
    return null;
  }
}

async function main() {
  const apiUrl = process.env.EVAL_API_URL ?? 'http://localhost:4000/api/v1';
  const { token, source } = obtainToken();

  const serverConfig = await fetchServerConfig(apiUrl);
  if (!serverConfig) {
    console.error(
      `\n✗ Backend at ${apiUrl} is not reachable (cannot read /health/config).` +
        `\n  Start it with: npm --prefix backend run dev\n`,
    );
    process.exit(1);
  }
  const tag = process.env.EVAL_TAG ?? 'baseline';
  const expectedFromTag =
    tag === 'no-verifier'
      ? false
      : tag === 'with-verifier' || tag === 'baseline'
        ? true
        : null;
  const mode = serverConfig.verificationEnabled ? 'WITH VERIFIER' : 'NO VERIFIER';
  const banner =
    '\n┌──────────────────────────────────────────────────────────┐\n' +
    `│ Backend AI_VERIFICATION_ENABLED = ${serverConfig.verificationEnabled.toString().padEnd(22)} │\n` +
    `│ Effective mode:                   ${mode.padEnd(22)} │\n` +
    `│ EVAL_TAG (label only):            ${tag.padEnd(22)} │\n` +
    '└──────────────────────────────────────────────────────────┘\n';
  console.log(banner);
  if (expectedFromTag !== null && expectedFromTag !== serverConfig.verificationEnabled) {
    console.error(
      `✗ Mismatch: EVAL_TAG=${tag} expects verifier=${expectedFromTag}, ` +
        `but server has verifier=${serverConfig.verificationEnabled}.\n` +
        `  Either change AI_VERIFICATION_ENABLED in backend/.env and restart the backend,\n` +
        `  or set EVAL_TAG to '${serverConfig.verificationEnabled ? 'with-verifier' : 'no-verifier'}'.\n` +
        `  To override this guard, set EVAL_FORCE=1.\n`,
    );
    if (process.env.EVAL_FORCE !== '1') process.exit(1);
    console.log('… EVAL_FORCE=1 set, proceeding anyway.\n');
  }
  const queriesPath =
    process.env.EVAL_QUERIES ?? resolve(__dirname, '..', '..', 'eval', 'queries.csv');
  const outDir = resolve(__dirname, '..', '..', 'eval');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = resolve(outDir, `results-${tag}-${stamp}.csv`);

  const queries = parseCsv(readFileSync(queriesPath, 'utf8'));
  console.log(
    `Loaded ${queries.length} queries from ${queriesPath}; writing to ${outPath}`,
  );
  console.log(`API: ${apiUrl} · token: ${token.slice(0, 8)}… (${source})`);

  const results: ResultRow[] = [];
  let i = 0;
  for (const q of queries) {
    i++;
    process.stdout.write(`[${i}/${queries.length}] ${q.id} ${q.type.padEnd(11)} `);
    const { response, latencyMs, error } = await callChat(apiUrl, token, q.query);
    const v = response.verification;
    const row: ResultRow = {
      id: q.id,
      type: q.type,
      query: q.query,
      agent: response.agent ?? '',
      rationale: response.rationale ?? '',
      toolCallCount: response.toolCalls?.length ?? 0,
      toolNames: (response.toolCalls ?? []).map((c) => c.name).join('|'),
      responseChars: response.text?.length ?? 0,
      latencyMs,
      costUsd: response.costUsd ?? 0,
      verifTotal: v?.total ?? 0,
      verifVerified: v?.verified ?? 0,
      verifUnverified: v?.unverified ?? 0,
      hallucinationRate: v?.hallucinationRate ?? 0,
      retried: v?.retried ?? false,
      unverifiedClaims: v?.unverifiedClaims?.join(' | ') ?? '',
      errorMessage: error ?? '',
    };
    results.push(row);
    if (error) {
      process.stdout.write(`✗ ERROR (${latencyMs}ms): ${error}\n`);
    } else {
      const halluc = v ? `${v.verified}/${v.total}${v.retried ? ' R' : ''}` : '—';
      process.stdout.write(
        `${response.agent ?? '?'} · ${row.toolCallCount} tools · ${latencyMs}ms · ${halluc}\n`,
      );
    }
  }

  writeFileSync(outPath, toCsv(results), 'utf8');
  console.log(`\nWrote ${results.length} rows to ${outPath}`);
  summarise(results);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
