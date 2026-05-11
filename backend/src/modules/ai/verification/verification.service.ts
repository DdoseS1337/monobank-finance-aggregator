import { Injectable, Logger } from '@nestjs/common';

/**
 * Verifies that every numeric claim in an LLM-produced message is grounded
 * in the structured outputs of the tool calls executed during the same
 * agent turn. The thesis-level invariant is:
 *
 *   "Numbers in the answer come from the database (via tools);
 *    natural language wraps them, but does not invent them."
 *
 * Strategy:
 *   1. Extract numeric claims from the assistant text:
 *        - currency amounts ("109,674.13 UAH", "1 500 грн", "$23.50")
 *        - percentages ("27%", "5,5 %")
 *   2. Recursively flatten tool-call outputs into a multiset of numeric
 *      leaves (with currency tag where applicable).
 *   3. For each claim, check whether a leaf within tolerance exists.
 *   4. Return a structured report with unverified claims listed; the caller
 *      can retry, annotate, or just record the metric.
 *
 * What this is NOT:
 *   - Not a full fact-checker (no entity resolution, no semantic NLI).
 *   - Not a replacement for guardrails — it complements them.
 *   - Not perfect on multi-step arithmetic the LLM does in its head
 *     (e.g. summing two tool outputs). Those count as unverified, which
 *     for the thesis metric is the conservative direction.
 */
const CURRENCY_TOKEN = '(?:грн|UAH|USD|EUR|GBP|PLN|CHF|JPY|SEK|\\u20B4|\\$|\\u20AC|\\u00A3|z\\u0142)';
// Number alternatives, longest first so the regex consumes the whole number
// instead of a fragment when both styles can apply.
const NUMBER_ALT =
  // US/UK style: 109,674.13   (comma thousands, optional dot decimal)
  '\\d{1,3}(?:,\\d{3})+(?:\\.\\d{1,2})?' +
  '|' +
  // UA/EU style: 109 674,13   (space / nbsp / narrow-nbsp thousands, optional comma decimal)
  '\\d{1,3}(?:[ \\u00A0\\u202F]\\d{3})+(?:,\\d{1,2})?' +
  '|' +
  // Plain: 109674.13 / 109674,13 / 109674
  '\\d+(?:[.,]\\d{1,2})?';
const MONEY_RE_SOURCE =
  '(?:(' + CURRENCY_TOKEN + ')\\s*)?(' + NUMBER_ALT + ')\\s*(' + CURRENCY_TOKEN + ')?';

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  private static readonly MONEY_RE = new RegExp(MONEY_RE_SOURCE, 'giu');
  private static readonly PERCENT_RE = /(\d+(?:[.,]\d+)?)\s*%/g;

  // Numbers that almost never count as a financial claim: years, common
  // round counts ("3 рахунки"), small integers in section markers.
  private static readonly TRIVIAL_NUMBERS = new Set([
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 24, 30, 31, 60, 365,
  ]);

  /**
   * @param text         Final assistant message.
   * @param toolOutputs  Raw `data` payloads from successful tool calls.
   * @param toolCalls    Optional richer view: tool name + input + output.
   *                     Enables TRANSITIVE verification — a number coming
   *                     out of `calculate` must trace back to numbers that
   *                     themselves are in some tool output OR were stated
   *                     verbatim by the user, otherwise it's flagged as
   *                     ungrounded.
   * @param userMessage  Optional original user prompt. Numbers literally
   *                     present in it are considered grounded (the user
   *                     "stated them as fact" — e.g. "salary 2500 USD").
   */
  verifyResponse(
    text: string,
    toolOutputs: unknown[],
    toolCalls?: Array<{ name: string; input?: unknown; output?: unknown }>,
    userMessage?: string,
  ): VerificationReport {
    const claims = this.extractClaims(text);

    const userNumbers = userMessage
      ? this.extractAllNumbers(userMessage)
      : new Set<number>();

    // Build the "grounded numbers" set. Calculate-tool outputs are admitted
    // only when each literal in their expression is grounded.
    const groundedOutputs = toolCalls
      ? this.collectGroundedOutputs(toolCalls, userNumbers)
      : toolOutputs;
    const leaves = this.flattenNumbers(groundedOutputs);
    const numericLeaves = leaves.numeric;
    const stringLeaves = leaves.strings;

    const verified: NumericClaim[] = [];
    const unverified: NumericClaim[] = [];

    for (const claim of claims) {
      if (this.matchesAny(claim, numericLeaves, stringLeaves)) {
        verified.push(claim);
      } else {
        unverified.push(claim);
      }
    }

    const total = verified.length + unverified.length;
    return {
      total,
      verifiedCount: verified.length,
      unverifiedCount: unverified.length,
      hallucinationRate: total === 0 ? 0 : unverified.length / total,
      verified,
      unverified,
      sampledLeafCount: numericLeaves.length,
    };
  }

  /**
   * Walks every tool call and decides which outputs count as "grounded".
   *
   *   - Non-calculate tools: trusted. Their outputs are presumed correct
   *     because they pull from databases / external APIs.
   *   - calculate tool: trusted ONLY if every numeric literal in its
   *     expression appears in some non-calculate tool output (transitive
   *     grounding). Otherwise the entire calculate output is excluded —
   *     so a downstream "65000" produced by `650 * 100` will not satisfy
   *     a verification check, because `100` was invented.
   *
   * Calculate-on-calculate chains work too: pass 2 already-grounded inputs
   * into a sum, the result is grounded; pass one grounded + one invented
   * literal, the result is rejected.
   */
  private collectGroundedOutputs(
    toolCalls: Array<{ name: string; input?: unknown; output?: unknown }>,
    userNumbers: Set<number>,
  ): unknown[] {
    const trustedNumbers = new Set<number>(userNumbers);
    const trustedOutputs: unknown[] = [];

    // First pass: every non-calculate output is trusted unconditionally.
    for (const call of toolCalls) {
      if (call.name === 'calculate') continue;
      trustedOutputs.push(call.output);
      const flat = this.flattenNumbers([call.output]);
      for (const n of flat.numeric) trustedNumbers.add(this.roundForSet(n));
    }

    // Also push user-stated numbers as a fake "output" so they appear when
    // we flatten the trustedOutputs set later.
    if (userNumbers.size > 0) {
      trustedOutputs.push(Array.from(userNumbers));
    }

    // Second pass (multiple sweeps until stable): admit a calculate output
    // only when every literal in its expression is in trustedNumbers, OR is
    // a trivial constant (0, 1, 2, 100, …).
    let changed = true;
    const admitted = new Set<number>();
    while (changed) {
      changed = false;
      for (let i = 0; i < toolCalls.length; i++) {
        if (admitted.has(i)) continue;
        const call = toolCalls[i]!;
        if (call.name !== 'calculate') continue;
        const expr = this.extractCalcExpression(call);
        if (!expr) continue;
        if (!this.allLiteralsGrounded(expr, trustedNumbers)) continue;

        admitted.add(i);
        trustedOutputs.push(call.output);
        const flat = this.flattenNumbers([call.output]);
        for (const n of flat.numeric) trustedNumbers.add(this.roundForSet(n));
        changed = true;
      }
    }
    return trustedOutputs;
  }

  private extractCalcExpression(call: {
    input?: unknown;
    output?: unknown;
  }): string | null {
    const input = call.input as { expression?: unknown } | null | undefined;
    if (input && typeof input.expression === 'string') return input.expression;
    const output = call.output as
      | { expression?: unknown; normalisedExpression?: unknown }
      | null
      | undefined;
    if (output && typeof output.normalisedExpression === 'string') {
      return output.normalisedExpression;
    }
    if (output && typeof output.expression === 'string') return output.expression;
    return null;
  }

  private allLiteralsGrounded(
    expr: string,
    trustedNumbers: Set<number>,
  ): boolean {
    // Same locale-aware tokenizer pattern used for extraction.
    const literals = expr.match(/\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:[.,]\d+)?/g);
    if (!literals) return true; // No literals → only operators/parens, harmless.
    for (const lit of literals) {
      const value = this.parseNumber(lit);
      if (value === null) continue;
      if (VerificationService.TRIVIAL_NUMBERS.has(value)) continue;
      if (trustedNumbers.has(this.roundForSet(value))) continue;
      return false;
    }
    return true;
  }

  private roundForSet(n: number): number {
    return Math.round(n * 100) / 100;
  }

  /**
   * Pulls every numeric literal out of free text (user prompt or similar).
   * Used to seed the "trusted numbers" set with values the user stated
   * verbatim (e.g. "salary 2500 USD" → {2500}, "їжа 50 000 грн" → {50000}).
   * Includes the bare value AND `value × 1000` for casual shorthand
   * ("50к" or "50k" intended as 50 000).
   */
  private extractAllNumbers(text: string): Set<number> {
    const out = new Set<number>();
    const literals = text.match(
      /\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d{1,3}(?:[   ]\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d+)?/g,
    );
    if (!literals) return out;
    for (const lit of literals) {
      const val = this.parseNumber(lit);
      if (val === null) continue;
      out.add(this.roundForSet(val));
      // Casual shorthand "50к", "50k" — also trust the ×1000 expansion.
      if (Number.isInteger(val) && val < 10000) {
        out.add(this.roundForSet(val * 1000));
      }
    }
    return out;
  }

  private extractClaims(text: string): NumericClaim[] {
    const claims: NumericClaim[] = [];
    const seen = new Set<string>();

    for (const match of text.matchAll(VerificationService.MONEY_RE)) {
      const currency = (match[1] || match[3] || '').trim();
      const raw = match[2]!;
      // Skip "5 рекомендацій"-style matches — only count when a currency is
      // explicitly present on either side of the number.
      if (!currency) continue;
      const value = this.parseNumber(raw);
      if (value === null) continue;
      if (VerificationService.TRIVIAL_NUMBERS.has(value)) continue;
      const key = `money:${value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      claims.push({
        kind: 'money',
        rawText: match[0]!.trim(),
        value,
        currency: this.normalizeCurrency(currency),
      });
    }

    for (const match of text.matchAll(VerificationService.PERCENT_RE)) {
      const value = this.parseNumber(match[1]!);
      if (value === null) continue;
      const key = `pct:${value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      claims.push({
        kind: 'percent',
        rawText: match[0]!.trim(),
        value,
      });
    }

    return claims;
  }

  /**
   * Locale-aware number parser. Handles US ("109,674.13"), UA/EU
   * ("109 674,13"), and bare ("109674.13" / "109674,13") forms.
   */
  private parseNumber(raw: string): number | null {
    let s = raw.replace(/[\s  ]/g, '');
    const hasComma = s.includes(',');
    const hasDot = s.includes('.');

    if (hasComma && hasDot) {
      // Whichever sep appears LAST is the decimal sep.
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
        // "109.674,13" — dot thousands, comma decimal (rare UA mixed)
        s = s.replace(/\./g, '').replace(',', '.');
      } else {
        // "109,674.13" — comma thousands, dot decimal (US)
        s = s.replace(/,/g, '');
      }
    } else if (hasComma) {
      const parts = s.split(',');
      const last = parts[parts.length - 1] ?? '';
      // Ambiguous single comma. If the LAST group has exactly 3 digits AND
      // there is more than one comma OR the leading group is short, treat
      // as thousands; otherwise as decimal.
      if (parts.length > 2 || (parts.length === 2 && last.length === 3)) {
        s = s.replace(/,/g, '');
      } else {
        s = s.replace(',', '.');
      }
    }
    // (else: only dot or no separator — already JS-parseable)

    const num = Number(s);
    return Number.isFinite(num) ? num : null;
  }

  private normalizeCurrency(symbol: string): string {
    switch (symbol) {
      case '₴': // ₴
      case 'грн':
        return 'UAH';
      case '$':
        return 'USD';
      case '€': // €
        return 'EUR';
      case '£': // £
        return 'GBP';
      case 'zł': // zł
        return 'PLN';
      default:
        return symbol.toUpperCase();
    }
  }

  /**
   * Walks tool outputs (any JSON shape) and collects every numeric leaf,
   * plus the raw stringified payloads for substring fallback matches
   * (some legitimate values come back as strings — IDs, formatted amounts).
   */
  private flattenNumbers(outputs: unknown[]): {
    numeric: number[];
    strings: string[];
  } {
    const numeric: number[] = [];
    const strings: string[] = [];

    const visit = (node: unknown) => {
      if (node === null || node === undefined) return;
      if (typeof node === 'number') {
        if (Number.isFinite(node)) numeric.push(node);
        return;
      }
      if (typeof node === 'string') {
        strings.push(node);
        const asNum = Number(node);
        if (Number.isFinite(asNum)) numeric.push(asNum);
        return;
      }
      if (typeof node === 'boolean') return;
      if (Array.isArray(node)) {
        for (const item of node) visit(item);
        return;
      }
      if (typeof node === 'object') {
        for (const value of Object.values(node as Record<string, unknown>)) {
          visit(value);
        }
      }
    };
    for (const output of outputs) visit(output);
    return { numeric, strings };
  }

  private matchesAny(
    claim: NumericClaim,
    leaves: number[],
    stringLeaves: string[],
  ): boolean {
    const tolerance = this.toleranceFor(claim);
    for (const leaf of leaves) {
      if (Math.abs(leaf - claim.value) <= tolerance) return true;
      // Tool may return a signed value (-1500) while the claim is "1500 грн".
      if (Math.abs(Math.abs(leaf) - claim.value) <= tolerance) return true;
    }
    // Last-resort substring match against raw stringified payloads.
    const needle = claim.value.toFixed(claim.kind === 'percent' ? 1 : 2);
    if (stringLeaves.some((s) => s.includes(needle))) return true;
    const needleInt = Math.round(claim.value).toString();
    if (claim.kind === 'percent' && stringLeaves.some((s) => s.includes(needleInt))) {
      return true;
    }
    return false;
  }

  private toleranceFor(claim: NumericClaim): number {
    // Money: 1% relative tolerance + 0.5 absolute (rounding).
    if (claim.kind === 'money') {
      return Math.max(0.5, claim.value * 0.01);
    }
    // Percent: 0.5 absolute is enough; LLMs frequently round.
    return 0.5;
  }
}

export interface NumericClaim {
  kind: 'money' | 'percent';
  rawText: string;
  value: number;
  currency?: string;
}

export interface VerificationReport {
  total: number;
  verifiedCount: number;
  unverifiedCount: number;
  hallucinationRate: number;
  verified: NumericClaim[];
  unverified: NumericClaim[];
  sampledLeafCount: number;
}
