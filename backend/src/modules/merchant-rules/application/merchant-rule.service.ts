import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MerchantRuleRepository } from '../infrastructure/merchant-rule.repository';

interface CompiledRule {
  matchType: string;
  field: string;
  category: string;
  subcategory: string | null;
  rawPattern: string;
  regex?: RegExp;
}

interface MatchResult {
  category: string;
  subcategory: string | null;
}

@Injectable()
export class MerchantRuleService implements OnModuleInit {
  private readonly logger = new Logger(MerchantRuleService.name);
  private rules: CompiledRule[] = [];

  constructor(private readonly ruleRepo: MerchantRuleRepository) {}

  async onModuleInit() {
    await this.loadRules();
  }

  async loadRules(): Promise<void> {
    const dbRules = await this.ruleRepo.findAllActive();
    this.rules = dbRules.map((r) => {
      const compiled: CompiledRule = {
        matchType: r.matchType,
        field: r.field,
        category: r.category,
        subcategory: r.subcategory,
        rawPattern: r.pattern,
      };
      if (r.matchType === 'REGEX') {
        try {
          compiled.regex = new RegExp(r.pattern, 'i');
        } catch {
          this.logger.warn(`Invalid regex pattern: ${r.pattern}`);
        }
      }
      return compiled;
    });
    this.logger.log(`Loaded ${this.rules.length} merchant rules`);
  }

  match(merchantName?: string | null, description?: string | null): MatchResult | null {
    const merchant = (merchantName ?? '').toLowerCase();
    const desc = (description ?? '').toLowerCase();

    for (const rule of this.rules) {
      const pattern = rule.rawPattern.toLowerCase();

      const checkText = (text: string): boolean => {
        if (rule.matchType === 'CONTAINS') return text.includes(pattern);
        if (rule.matchType === 'EXACT') return text === pattern;
        if (rule.matchType === 'REGEX' && rule.regex) return rule.regex.test(text);
        return false;
      };

      let matched = false;
      if (rule.field === 'MERCHANT') {
        matched = checkText(merchant);
      } else if (rule.field === 'DESCRIPTION') {
        matched = checkText(desc);
      } else {
        matched = checkText(merchant) || checkText(desc);
      }

      if (matched) {
        return { category: rule.category, subcategory: rule.subcategory };
      }
    }

    return null;
  }
}
