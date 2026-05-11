import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../shared-kernel/prisma/prisma.service';

export interface CategorizationInput {
  description: string | null;
  merchantName: string | null;
  mccCode: number | null;
}

export interface CategorizationResult {
  categoryId: string;
  categorySlug: string;
  source: 'MERCHANT_RULE' | 'MCC' | 'FALLBACK_OTHER';
  ruleId?: string;
  matchedPattern?: string;
}

/**
 * Resolves a category for a transaction.
 *
 * Strategy (in priority order):
 *   1. Merchant rules (high priority overrides) — exact / contains / regex
 *      against merchantName | description | both, sorted by priority asc.
 *   2. MCC fallback — direct lookup in mcc_mappings.
 *   3. "Other" fallback — guarantees that every transaction has a category.
 *
 * Categories form a tree (parent_id). The returned categoryId is the
 * SUBCATEGORY when available so analytics / budgets can drill down.
 *
 * The merchant rule list is small (~tens of rows) so we cache it in
 * memory for `MERCHANT_CACHE_TTL_MS`. MCC mappings are larger (hundreds)
 * but accessed by primary key — a tiny LRU is enough.
 */
@Injectable()
export class CategorizationService {
  private readonly logger = new Logger(CategorizationService.name);
  private static readonly MERCHANT_CACHE_TTL_MS = 60_000;

  private merchantRulesCache: {
    rules: Array<{
      id: string;
      pattern: string;
      patternLower: string;
      regex: RegExp | null;
      matchType: 'EXACT' | 'CONTAINS' | 'REGEX';
      matchField: 'BOTH' | 'DESCRIPTION' | 'MERCHANT';
      categoryId: string;
      priority: number;
    }>;
    expiresAt: number;
  } | null = null;

  private fallbackOtherId: string | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async categorize(input: CategorizationInput): Promise<CategorizationResult> {
    const merchantHit = await this.matchMerchantRule(input);
    if (merchantHit) return merchantHit;

    const mccHit = await this.matchMccCode(input.mccCode);
    if (mccHit) return mccHit;

    return this.fallback();
  }

  private async matchMerchantRule(
    input: CategorizationInput,
  ): Promise<CategorizationResult | null> {
    const rules = await this.loadMerchantRules();
    if (rules.length === 0) return null;

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
        if (!target) continue;
        if (this.matches(rule, target)) {
          const slug = await this.lookupCategorySlug(rule.categoryId);
          return {
            categoryId: rule.categoryId,
            categorySlug: slug,
            source: 'MERCHANT_RULE',
            ruleId: rule.id,
            matchedPattern: rule.pattern,
          };
        }
      }
    }
    return null;
  }

  private matches(
    rule: {
      patternLower: string;
      regex: RegExp | null;
      matchType: 'EXACT' | 'CONTAINS' | 'REGEX';
    },
    target: string,
  ): boolean {
    switch (rule.matchType) {
      case 'EXACT':
        return target === rule.patternLower;
      case 'CONTAINS':
        return target.includes(rule.patternLower);
      case 'REGEX':
        return rule.regex !== null && rule.regex.test(target);
    }
  }

  private async matchMccCode(
    mccCode: number | null,
  ): Promise<CategorizationResult | null> {
    if (mccCode === null || mccCode === undefined) return null;
    const mapping = await this.prisma.mccMapping.findUnique({
      where: { mccCode },
      include: { category: { select: { slug: true } } },
    });
    if (!mapping) return null;
    return {
      categoryId: mapping.categoryId,
      categorySlug: mapping.category.slug,
      source: 'MCC',
    };
  }

  private async fallback(): Promise<CategorizationResult> {
    if (!this.fallbackOtherId) {
      const other = await this.prisma.category.findUnique({
        where: { slug: 'other' },
        select: { id: true },
      });
      if (!other) {
        // Should never happen — seed always creates "Other".
        // Hard-fail loudly so seed misconfiguration surfaces immediately.
        throw new Error('Fallback category "other" missing — re-run seed');
      }
      this.fallbackOtherId = other.id;
    }
    return {
      categoryId: this.fallbackOtherId,
      categorySlug: 'other',
      source: 'FALLBACK_OTHER',
    };
  }

  private async loadMerchantRules() {
    const now = Date.now();
    if (this.merchantRulesCache && this.merchantRulesCache.expiresAt > now) {
      return this.merchantRulesCache.rules;
    }
    const rows = await this.prisma.merchantRule.findMany({
      where: { enabled: true },
      orderBy: { priority: 'asc' },
    });
    const rules = rows.map((r) => ({
      id: r.id,
      pattern: r.pattern,
      patternLower: r.pattern.toLowerCase(),
      regex:
        r.matchType === 'REGEX'
          ? this.safeRegex(r.pattern)
          : null,
      matchType: r.matchType as 'EXACT' | 'CONTAINS' | 'REGEX',
      matchField: r.matchField as 'BOTH' | 'DESCRIPTION' | 'MERCHANT',
      categoryId: r.categoryId,
      priority: r.priority,
    }));
    this.merchantRulesCache = {
      rules,
      expiresAt: now + CategorizationService.MERCHANT_CACHE_TTL_MS,
    };
    return rules;
  }

  private safeRegex(pattern: string): RegExp | null {
    try {
      return new RegExp(pattern, 'i');
    } catch (error) {
      this.logger.warn(`Invalid regex in merchant rule: ${pattern} — ${(error as Error).message}`);
      return null;
    }
  }

  private async lookupCategorySlug(categoryId: string): Promise<string> {
    const cat = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { slug: true },
    });
    return cat?.slug ?? 'unknown';
  }

  /** Used in tests + admin endpoints to flush the rule cache. */
  invalidateCache(): void {
    this.merchantRulesCache = null;
  }
}
