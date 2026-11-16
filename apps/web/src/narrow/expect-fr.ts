import { expect } from 'vitest';
import { frTypographyIssues } from './i18n.js';
import type { Entry } from './types.js';

/** Test support. Every entry has both languages, they differ, and the French follows the typography rules. */
export function noFrIssues(es: readonly Entry[]): void {
  for (const e of es) {
    expect(e.message.en, `${e.rule} en`).not.toBe('');
    expect(frTypographyIssues(e.message.fr), `${e.rule}: ${e.message.fr}`).toEqual([]);
    expect(e.message.fr, e.rule).not.toBe(e.message.en);
  }
}
