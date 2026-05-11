/**
 * One-shot fixup for transactions that were imported with the buggy
 * pre-fix logic:
 *   - all hold-flagged rows had type = 'HOLD' (now: derive from sign,
 *     and use status = 'PENDING' for holds);
 *   - currency was set to the operation currency instead of the
 *     account currency, even though `amount` was always the
 *     account-currency value;
 *   - rows imported while the categorization worker was offline have
 *     categoryId = null. Re-runs the deterministic resolver
 *     (merchant rules → MCC mapping → "other" fallback).
 *
 * Run once after upgrading the import service:
 *
 *   npm --prefix backend run fix:tx
 *
 * Idempotent: re-running on already-fixed rows is a no-op.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface Metadata {
  operationAmount?: number;
  hold?: boolean;
  operationCurrency?: string;
}

interface MerchantRuleRow {
  id: string;
  pattern: string;
  patternLower: string;
  regex: RegExp | null;
  matchType: 'EXACT' | 'CONTAINS' | 'REGEX';
  matchField: 'BOTH' | 'DESCRIPTION' | 'MERCHANT';
  categoryId: string;
  priority: number;
}

async function loadMerchantRules(): Promise<MerchantRuleRow[]> {
  const rows = await prisma.merchantRule.findMany({
    where: { enabled: true },
    orderBy: { priority: 'asc' },
  });
  return rows.map((r) => ({
    id: r.id,
    pattern: r.pattern,
    patternLower: r.pattern.toLowerCase(),
    regex: r.matchType === 'REGEX' ? safeRegex(r.pattern) : null,
    matchType: r.matchType as 'EXACT' | 'CONTAINS' | 'REGEX',
    matchField: r.matchField as 'BOTH' | 'DESCRIPTION' | 'MERCHANT',
    categoryId: r.categoryId,
    priority: r.priority,
  }));
}

function safeRegex(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, 'i');
  } catch {
    return null;
  }
}

function ruleMatches(rule: MerchantRuleRow, target: string): boolean {
  switch (rule.matchType) {
    case 'EXACT':
      return target === rule.patternLower;
    case 'CONTAINS':
      return target.includes(rule.patternLower);
    case 'REGEX':
      return rule.regex !== null && rule.regex.test(target);
  }
}

async function categorize(
  rules: MerchantRuleRow[],
  fallbackOtherId: string,
  mccCache: Map<number, string>,
  input: {
    description: string | null;
    merchantName: string | null;
    mccCode: number | null;
  },
): Promise<string> {
  const merchantLower = input.merchantName?.toLowerCase() ?? '';
  const descriptionLower = input.description?.toLowerCase() ?? '';

  for (const rule of rules) {
    const haystacks: string[] = [];
    if (rule.matchField === 'MERCHANT' || rule.matchField === 'BOTH') {
      haystacks.push(merchantLower);
    }
    if (rule.matchField === 'DESCRIPTION' || rule.matchField === 'BOTH') {
      haystacks.push(descriptionLower);
    }
    for (const target of haystacks) {
      if (target && ruleMatches(rule, target)) return rule.categoryId;
    }
  }

  if (input.mccCode !== null && input.mccCode !== undefined) {
    const cached = mccCache.get(input.mccCode);
    if (cached) return cached;
    const mapping = await prisma.mccMapping.findUnique({
      where: { mccCode: input.mccCode },
      select: { categoryId: true },
    });
    if (mapping) {
      mccCache.set(input.mccCode, mapping.categoryId);
      return mapping.categoryId;
    }
  }

  return fallbackOtherId;
}

async function main() {
  const accounts = await prisma.account.findMany({
    select: { id: true, currency: true },
  });
  const accountCurrency = new Map(accounts.map((a) => [a.id, a.currency]));

  const other = await prisma.category.findUnique({
    where: { slug: 'other' },
    select: { id: true },
  });
  if (!other) {
    throw new Error('Fallback category "other" missing — re-run prisma seed first');
  }
  const rules = await loadMerchantRules();
  const mccCache = new Map<number, string>();

  const txs = await prisma.transaction.findMany({
    select: {
      id: true,
      type: true,
      status: true,
      currency: true,
      accountId: true,
      categoryId: true,
      description: true,
      merchantName: true,
      mccCode: true,
      metadata: true,
    },
  });

  let typeFixed = 0;
  let currencyFixed = 0;
  let statusFixed = 0;
  let categoryFixed = 0;

  for (const t of txs) {
    const meta = (t.metadata ?? {}) as Metadata;
    const update: Record<string, unknown> = {};

    if (t.type === 'HOLD') {
      const sign =
        typeof meta.operationAmount === 'number' ? meta.operationAmount : -1;
      update.type = sign >= 0 ? 'CREDIT' : 'DEBIT';
      typeFixed++;
    }

    const correctStatus = meta.hold === true ? 'PENDING' : 'POSTED';
    if (t.status !== correctStatus) {
      update.status = correctStatus;
      statusFixed++;
    }

    const correctCurrency = accountCurrency.get(t.accountId);
    if (correctCurrency && t.currency !== correctCurrency) {
      update.currency = correctCurrency;
      currencyFixed++;
    }

    if (!t.categoryId) {
      update.categoryId = await categorize(rules, other.id, mccCache, {
        description: t.description,
        merchantName: t.merchantName,
        mccCode: t.mccCode,
      });
      categoryFixed++;
    }

    if (Object.keys(update).length > 0) {
      await prisma.transaction.update({ where: { id: t.id }, data: update });
    }
  }

  console.log(
    `Done. Scanned ${txs.length}. Type: ${typeFixed}, status: ${statusFixed}, currency: ${currencyFixed}, category: ${categoryFixed}.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
