import type { CheckResult, Entry } from './types.js';

/**
 * Wording rules for user-facing text. A "ban" rule is a hard failure. A
 * "review" rule only asks a person to look, so it is reported as UNKNOWN.
 * The descriptions avoid repeating the wording they forbid.
 */

export type CopyLevel = 'ban' | 'review';

export interface CopyRule {
  readonly id: string;
  readonly level: CopyLevel;
  /** Matched against lower-case text with accents removed, unless caseSensitive. */
  readonly pattern: RegExp;
  readonly caseSensitive?: boolean;
  readonly en: string;
  readonly fr: string;
}

export const COPY_RULES: readonly CopyRule[] = [
  {
    id: 'claim-checked',
    level: 'ban',
    pattern: /\bverified\b|\bverifie(?:e|s|es)?\b/,
    en: 'Wording that implies the information was checked or approved.',
    fr: 'Formulation qui laisse entendre que l’information a été contrôlée ou approuvée.',
  },
  {
    id: 'claim-live',
    level: 'ban',
    pattern: /\breal[- ]?time\b|\btemps reel\b/,
    en: 'Wording that implies live or instant updates.',
    fr: 'Formulation qui laisse entendre des mises à jour en direct ou instantanées.',
  },
  {
    id: 'claim-relationship',
    level: 'ban',
    pattern: /\bpartnerships?\b|\bpartenariats?\b/,
    en: 'Wording that implies a formal relationship with another organisation.',
    fr: 'Formulation qui laisse entendre un lien formel avec une autre organisation.',
  },
  {
    id: 'claim-promise',
    level: 'ban',
    pattern: /\bguarant(?:ee|eed|ees|eeing)\b|\bgarant(?:ie|ies|i|is|ir|it|issons)\b/,
    en: 'Wording that promises an outcome.',
    fr: 'Formulation qui promet un résultat.',
  },
  {
    id: 'claim-conformance',
    level: 'ban',
    pattern:
      /\b(?:aaa|aa)[- ]?(?:conformant|compliant|conforme)\b|\bwcag[- ](?:2\.\d[- ])?(?:compliant|conforme|certified|certifie)|\bfully accessible\b|\b100 ?% accessible\b|\bentierement accessible\b|\bcertified\b|\bcertifie(?:e|s|es)?\b/,
    en: 'Wording that claims a conformance level or certification.',
    fr: 'Formulation qui revendique un niveau de conformité ou une certification.',
  },
  {
    id: 'mention-tech',
    level: 'ban',
    pattern: /\bAI\b|\bIA\b/,
    caseSensitive: true,
    en: 'Mention of the technology behind a feature.',
    fr: 'Mention de la technologie derrière une fonctionnalité.',
  },
  {
    id: 'mention-tech-terms',
    level: 'ban',
    pattern: /artificial intelligence|intelligence artificielle|machine learning|apprentissage automatique|\bllm\b|\bgpt\b|chatbot|agent conversationnel/,
    en: 'Mention of the technology behind a feature.',
    fr: 'Mention de la technologie derrière une fonctionnalité.',
  },
  {
    id: 'mention-org',
    level: 'ban',
    // Names built from codes so they never appear as literals in a bundle.
    pattern: new RegExp(
      [
        [115, 112, 105, 110, 97, 108, 32, 99, 111, 114, 100, 32, 105, 110, 106, 117, 114, 121, 32, 111, 110, 116, 97, 114, 105, 111].reduce((s, n) => s + String.fromCharCode(n), '').replace(/ /g, '\\s+'),
        '\\b' + [115, 99, 105, 111].reduce((s, n) => s + String.fromCharCode(n), '') + '\\b',
        [115, 99, 105, 111, 110, 116, 97, 114, 105, 111].reduce((s, n) => s + String.fromCharCode(n), ''),
      ].join('|'),
      'i',
    ),
    en: 'Name of an organisation that must not appear.',
    fr: 'Nom d’un organisme qui ne doit pas apparaître.',
  },
  {
    id: 'advice-eligibility',
    level: 'review',
    pattern: /\byou (?:are|will be|may be|might be) eligible\b|\byou qualify\b|\bvous (?:etes|serez) (?:admissibles?|eligibles?)\b|\bvous avez droit\b/,
    en: 'Wording that tells a person they qualify for something.',
    fr: 'Formulation qui dit à une personne qu’elle remplit les conditions.',
  },
  {
    id: 'advice-medical',
    level: 'review',
    pattern: /\byou should (?:take|stop|see a doctor)\b|\bconsult (?:your|a) (?:doctor|physician)\b|\bconsultez (?:votre|un) medecin\b|\bvous devriez (?:prendre|arreter)\b/,
    en: 'Wording that gives medical direction.',
    fr: 'Formulation qui donne une consigne médicale.',
  },
  {
    id: 'claim-complete',
    level: 'review',
    pattern: /\balways up[- ]to[- ]date\b|\btoujours a jour\b|\bcomplete and accurate\b|\bcomplet et exact\b/,
    en: 'Wording that promises completeness or freshness.',
    fr: 'Formulation qui promet l’exhaustivité ou la fraîcheur.',
  },
];

export interface CopyHit {
  readonly rule: CopyRule;
}

export function plain(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Rules that match the text, each listed once. */
export function scanCopy(text: string, rules: readonly CopyRule[] = COPY_RULES): CopyHit[] {
  const folded = plain(text);
  const hits: CopyHit[] = [];
  for (const rule of rules) {
    if (rule.pattern.test(rule.caseSensitive ? text : folded)) hits.push({ rule });
  }
  return hits;
}

export function auditCopy(items: ReadonlyArray<{ readonly id: string; readonly text: string }>): CheckResult {
  const entries: Entry[] = [];
  for (const item of items) {
    for (const { rule } of scanCopy(item.text)) {
      entries.push({
        check: 'copy',
        id: item.id,
        status: rule.level === 'ban' ? 'fail' : 'unknown',
        rule: rule.id,
        message: {
          en: `${rule.en} (rule ${rule.id})`,
          fr: `${rule.fr} (règle ${rule.id})`,
        },
      });
    }
  }
  return { checked: items.length, entries };
}

export function auditCopyDict(dict: Readonly<Record<string, string>>): CheckResult {
  return auditCopy(Object.entries(dict).map(([id, text]) => ({ id, text })));
}
