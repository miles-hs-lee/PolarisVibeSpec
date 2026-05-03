import { IntentClassification } from '../types';

/**
 * Classify a natural-language intent into a task shape and a recommendation
 * about whether PV's impact set or a plain grep is more likely to help.
 *
 * Backed by the bench-002 finding that pure rename refactors cost +44% tools
 * and +65% cost when forced through PV — `passwordHash` is a unique
 * syntactic identifier and grep is already optimal. The classifier flags
 * such intents so the agent can route on shape rather than blindly running
 * the PV preamble.
 */

// Rename detection. The literal X-to-Y form is risky because
// "flag to pv impact" or "wire to cli" are common feature phrasings
// that shouldn't trigger. We require either an explicit verb ("rename",
// "convert ... to camelCase"), OR an arrow operator (→, ->, =>), OR
// X and Y that look like code identifiers (have _ or mixedCase).
const IDENT = '[A-Za-z_][A-Za-z0-9_]*';
const CODELIKE = `(?:[A-Za-z_]+_[\\w_]+|[a-z]+[A-Z]\\w*|[A-Z]+_[A-Z_]+)`;

const RENAME_PATTERNS: RegExp[] = [
  /\brename\b/i,
  /\b(replace|substitute)\s+`?[A-Za-z_][\w-]*`?\s+(with|→|->|=>)/i,
  // Arrow form: `foo → bar` or `passwordHash -> password_hash`.
  new RegExp(`\\b${IDENT}\\s*(?:→|->|=>)\\s*${IDENT}\\b`),
  // Snake/camel/kebab/pascal mention.
  /\b(snake[_-]?case|camel[_-]?case|kebab[_-]?case|pascal[_-]?case)\b/i,
  // "X to Y" only when both look like code identifiers (contain _ or
  // mixedCase) — avoids matching prepositional phrases like "flag to pv".
  new RegExp(`\\b${CODELIKE}\\s+(?:to|with)\\s+${CODELIKE}\\b`)
];

const FEATURE_HINTS = /\b(add|implement|introduce|support|create|new)\b/i;
const REFACTOR_HINTS = /\b(refactor|reorganize|move|extract|split|merge)\b/i;
const DOMAIN_HINTS = /\b(auth|login|signup|password|token|session|user|profile|account|billing|payment|invoice|charge|refund|subscription|order|cart|checkout|shipping|fulfillment|notif|email|sms|push)\b/i;

export function classifyIntent(intent: string): IntentClassification {
  const text = intent.trim();
  if (!text) {
    return { shape: 'unknown', recommendation: 'use_pv', reason: 'empty intent' };
  }

  for (const re of RENAME_PATTERNS) {
    if (re.test(text)) {
      return {
        shape: 'rename',
        recommendation: 'use_grep',
        reason:
          'Looks like a rename or pattern substitution — bench-002 task-3 showed PV adds 44–65% overhead vs grep on this shape because the target identifier is unique and grep is already deterministic.'
      };
    }
  }

  // Cross-domain heuristic: multiple distinct domain keywords.
  const domainHits = new Set<string>();
  let m;
  const re = new RegExp(DOMAIN_HINTS.source, 'gi');
  while ((m = re.exec(text)) !== null) domainHits.add(m[0].toLowerCase());

  if (FEATURE_HINTS.test(text)) {
    if (domainHits.size >= 2) {
      return {
        shape: 'feature',
        recommendation: 'use_pv',
        reason: 'Cross-domain feature add — exactly the shape where bench-002 showed PV saves the most (-28% cost, -44% tools).'
      };
    }
    return {
      shape: 'feature',
      recommendation: 'use_pv',
      reason: 'Looks like a scoped feature add — bench-002 showed PV saves -17% cost, -47% tools on this shape.'
    };
  }

  if (REFACTOR_HINTS.test(text)) {
    return {
      shape: 'refactor',
      recommendation: 'use_both',
      reason: 'Looks like a refactor — start with PV impact for scope, then grep within that file set to confirm coverage.'
    };
  }

  return {
    shape: 'unknown',
    recommendation: 'use_pv',
    reason: 'Default: try PV impact first; if the result has coverage="global" the answer is in many files and grep may be a better fit.'
  };
}
