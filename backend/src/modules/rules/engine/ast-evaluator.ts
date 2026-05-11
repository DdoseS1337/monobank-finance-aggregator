import {
  ConditionASTNode,
  ConditionField,
  EvaluationContext,
} from '../domain/rule-schemas';

/**
 * Safe boolean expression evaluator over EvaluationContext.
 *
 * - No `eval`, no Function constructor, no dynamic property strings.
 * - Field names are typed via `ConditionField` and resolved through an
 *   explicit allowlist below.
 * - Comparisons short-circuit (AND / OR) and are exception-safe: if a
 *   field is missing in the context, EQ returns false rather than throw.
 *
 * Used by:
 *   - RulesEngine to decide whether a rule should fire on an event.
 *   - DryRun endpoint, to test a rule without executing actions.
 */
export class AstEvaluator {
  evaluate(node: ConditionASTNode, ctx: EvaluationContext): boolean {
    switch (node.op) {
      case 'AND':
        return this.evaluate(node.left, ctx) && this.evaluate(node.right, ctx);
      case 'OR':
        return this.evaluate(node.left, ctx) || this.evaluate(node.right, ctx);
      case 'NOT':
        return !this.evaluate(node.expr, ctx);
      case 'EQ':
        return this.equals(this.field(node.field, ctx), node.value);
      case 'NEQ':
        return !this.equals(this.field(node.field, ctx), node.value);
      case 'GT':
        return this.numeric(this.field(node.field, ctx), (v) => v > node.value);
      case 'GTE':
        return this.numeric(this.field(node.field, ctx), (v) => v >= node.value);
      case 'LT':
        return this.numeric(this.field(node.field, ctx), (v) => v < node.value);
      case 'LTE':
        return this.numeric(this.field(node.field, ctx), (v) => v <= node.value);
      case 'IN':
        return this.includes(this.field(node.field, ctx), node.values);
      case 'CONTAINS':
        return this.contains(this.field(node.field, ctx), node.substring);
    }
  }

  private field(name: ConditionField, ctx: EvaluationContext): unknown {
    switch (name) {
      case 'transaction.amount':
        return ctx.transaction?.amount;
      case 'transaction.mccCode':
        return ctx.transaction?.mccCode;
      case 'transaction.categorySlug':
        return ctx.transaction?.categorySlug;
      case 'transaction.merchantName':
        return ctx.transaction?.merchantName;
      case 'transaction.type':
        return ctx.transaction?.type;
      case 'transaction.description':
        return ctx.transaction?.description;
      case 'time.dayOfWeek':
        return ctx.time.dayOfWeek;
      case 'time.hourOfDay':
        return ctx.time.hourOfDay;
      case 'budget.spentPct':
        return ctx.budget?.spentPct;
      case 'budget.spentAmount':
        return ctx.budget?.spentAmount;
      case 'goal.feasibilityScore':
        return ctx.goal?.feasibilityScore;
      case 'goal.progressPct':
        return ctx.goal?.progressPct;
      case 'goal.priority':
        return ctx.goal?.priority;
    }
  }

  private equals(a: unknown, b: unknown): boolean {
    if (a === undefined || a === null) return b === null || b === undefined;
    return a === b;
  }

  private numeric(value: unknown, predicate: (n: number) => boolean): boolean {
    if (typeof value !== 'number' || Number.isNaN(value)) return false;
    return predicate(value);
  }

  private includes(value: unknown, list: Array<string | number>): boolean {
    if (typeof value !== 'string' && typeof value !== 'number') return false;
    return (list as Array<unknown>).includes(value);
  }

  private contains(value: unknown, substring: string): boolean {
    if (typeof value !== 'string') return false;
    return value.toLowerCase().includes(substring.toLowerCase());
  }
}
