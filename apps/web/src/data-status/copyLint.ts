/**
 * Wording guard for user-visible copy (EN + FR). Tests run it over the whole message
 * catalog and over rendered pages, so a banned claim fails the build.
 * Rules: no "verified" language, no real-time claims, no conformance claims,
 * no AI mentions, no partnership claims, no medical or eligibility advice,
 * no guarantees, and no reference to the organisations the App is unbranded from.
 */
import { forbiddenOrgNeedles } from '../../../../packages/shared/test/forbiddenOrg.ts';
import { CATALOG, type MessageKey } from './i18n';
import type { Locale } from './dataStatus';

export interface CopyRule {
  id: string;
  pattern: RegExp;
}

// The banned names come only from the repo's shared helper (it rebuilds them from code points), never from text here.
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
const BANNED_NAMES = new RegExp(forbiddenOrgNeedles().map((needle) => `(?<![\\p{L}\\p{N}])${escapeRegExp(needle)}(?![\\p{L}\\p{N}])`).join('|'), 'iu');

export const COPY_RULES: readonly CopyRule[] = [
  { id: 'verified-claim', pattern: /\bverif\w*|\bv[ée]rifi\w*/i },
  { id: 'real-time-claim', pattern: /real[- ]?time|temps r[ée]el|\blive (data|updates?)\b|en direct/i },
  { id: 'conformance-claim', pattern: /\bAAA\b|\bAA[- ]?conform\w*|\bWCAG\b.{0,40}?(compliant|conform\w*)|conforme\w* (aux? )?WCAG/i },
  { id: 'ai-mention', pattern: /\b(AI|A\.I\.|IA|LLM|GPT)\b|artificial intelligence|intelligence artificielle|machine learning|apprentissage automatique|chatbot|agent conversationnel/ },
  { id: 'partnership-claim', pattern: /\bpartner\w*|\bpartenai\w*|\bpartenariat\w*|\bofficial(ly)?\b|\bofficiel\w*|endorsed|approuv[ée]\w* par/i },
  { id: 'medical-advice', pattern: /\b(medical advice|see (a|your) (doctor|physician)|diagnos\w*|treatment|symptom\w*|medication)\b|conseil m[ée]dical|consultez (un|votre) m[ée]decin|\bdiagnostic\b|\btraitement\b|sympt[ôo]me\w*|m[ée]dicament\w*/i },
  { id: 'eligibility-advice', pattern: /\beligib\w*|you qualify|vous [êe]tes admissible|\badmissib\w*|vous avez droit/i },
  { id: 'guarantee-claim', pattern: /\bguarantee\w*|\bgaranti\w*|100 ?% (accurate|complete|exact|complet)|always accurate|toujours exact/i },
  { id: 'banned-name', pattern: BANNED_NAMES },
];

export interface CopyViolation {
  rule: string;
  match: string;
}

export function scanCopy(text: string, rules: readonly CopyRule[] = COPY_RULES): CopyViolation[] {
  const out: CopyViolation[] = [];
  for (const r of rules) {
    const m = r.pattern.exec(text);
    if (m) out.push({ rule: r.id, match: m[0] });
  }
  return out;
}

/** Scan every catalog message; returns "locale key: rule (match)" strings, empty when clean. */
export function scanCatalog(rules: readonly CopyRule[] = COPY_RULES): string[] {
  const out: string[] = [];
  for (const locale of Object.keys(CATALOG) as Locale[]) {
    for (const [key, value] of Object.entries(CATALOG[locale]) as [MessageKey, string][]) {
      for (const v of scanCopy(value, rules)) out.push(`${locale} ${key}: ${v.rule} (${v.match})`);
    }
  }
  return out;
}

const ENTITIES: Readonly<Record<string, string>> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

/** Text a reader would see: styles, scripts and tags removed, entities decoded. */
export function visibleText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(amp|lt|gt|quot|#39);/g, (m) => ENTITIES[m] ?? m)
    .replace(/[ \t\r\n\f]+/g, ' ')
    .trim();
}

/** Scan rendered HTML as a reader sees it. */
export function scanHtml(html: string, rules: readonly CopyRule[] = COPY_RULES): CopyViolation[] {
  return scanCopy(visibleText(html), rules);
}
