import { Injectable } from '@nestjs/common';

export interface GuardrailResult {
  allowed: boolean;
  redactedMessage: string;
  flags: string[];
}

const PII_PATTERNS: Array<{ name: string; regex: RegExp; replacement: string }> = [
  // 16-digit card numbers (loose)
  { name: 'card_number', regex: /\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/g, replacement: '[REDACTED:CARD]' },
  // Ukrainian IPN (10 digits)
  { name: 'ipn', regex: /\b\d{10}\b/g, replacement: '[REDACTED:IPN]' },
  // IBAN (UA-prefix)
  { name: 'iban', regex: /\bUA\d{27}\b/gi, replacement: '[REDACTED:IBAN]' },
  // Email
  { name: 'email', regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, replacement: '[REDACTED:EMAIL]' },
  // Ukrainian phone numbers
  { name: 'phone', regex: /\b\+?380\d{9}\b/g, replacement: '[REDACTED:PHONE]' },
];

const PROMPT_INJECTION_PATTERNS: RegExp[] = [
  /ignore (all )?(previous|prior|above) instructions/i,
  /disregard (your|the) (system|prior) prompt/i,
  /you are no longer/i,
  /system:\s*new instruction/i,
  /\bjailbreak\b/i,
];

const TOPIC_DRIFT_PATTERNS: RegExp[] = [
  /how to make (a )?bomb/i,
  /generate (illegal|harmful) content/i,
];

/**
 * Lightweight pre-flight guardrails. Two responsibilities:
 *
 *   1. PII redaction — never let raw card numbers / IBANs / phone numbers
 *      reach the LLM. We replace them with placeholders before sending the
 *      prompt; downstream tools work with structured data, not free text,
 *      so this redaction is safe.
 *
 *   2. Soft refusal — block obvious prompt-injection attempts and
 *      off-topic harmful requests. We return `allowed=false` and the chat
 *      service responds with a polite refusal without ever calling the LLM.
 *
 * For Phase 7 (security review) this is the place to plug in:
 *   - LLM-based classifier for prompt injection (Anthropic / OpenAI moderation)
 *   - Stronger PII (NER-based) detection
 *   - Per-user rate limiting for AI endpoints
 */
@Injectable()
export class GuardrailsService {
  inspect(message: string): GuardrailResult {
    const flags: string[] = [];

    for (const re of PROMPT_INJECTION_PATTERNS) {
      if (re.test(message)) flags.push('prompt_injection');
    }
    for (const re of TOPIC_DRIFT_PATTERNS) {
      if (re.test(message)) flags.push('topic_drift');
    }

    if (flags.length > 0) {
      return { allowed: false, redactedMessage: message, flags };
    }

    let redacted = message;
    for (const pattern of PII_PATTERNS) {
      const before = redacted;
      redacted = redacted.replace(pattern.regex, pattern.replacement);
      if (redacted !== before) flags.push(`pii:${pattern.name}`);
    }

    return { allowed: true, redactedMessage: redacted, flags };
  }
}
