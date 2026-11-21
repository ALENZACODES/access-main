import { clip, t, type CheckResult, type Entry } from './types.js';
import type { FieldFact } from './semantics.js';

/**
 * Identify input purpose (WCAG 1.3.5). A field that asks for the person's own
 * name, address, phone or e-mail should say so with an autocomplete token, so
 * the browser can fill it in. A token that contradicts the label is a measured
 * failure. Autocomplete off on a personal field is UNKNOWN, because it may be
 * needed. A missing or invalid token is already a rule of the static-html
 * check, so it is not repeated here.
 */

export type PurposeRule = 'purpose-mismatch' | 'autocomplete-off';

export const PURPOSE_RULES: readonly PurposeRule[] = ['purpose-mismatch', 'autocomplete-off'];

/** The tokens the HTML standard lists for autofill, without the prefixes. */
export const TOKENS: ReadonlySet<string> = new Set([
  'name', 'honorific-prefix', 'given-name', 'additional-name', 'family-name', 'honorific-suffix', 'nickname',
  'username', 'new-password', 'current-password', 'one-time-code', 'organization-title', 'organization',
  'street-address', 'address-line1', 'address-line2', 'address-line3', 'address-level4', 'address-level3', 'address-level2', 'address-level1',
  'country', 'country-name', 'postal-code',
  'cc-name', 'cc-given-name', 'cc-additional-name', 'cc-family-name', 'cc-number', 'cc-exp', 'cc-exp-month', 'cc-exp-year', 'cc-csc', 'cc-type',
  'transaction-currency', 'transaction-amount', 'language', 'bday', 'bday-day', 'bday-month', 'bday-year', 'sex', 'url', 'photo',
  'tel', 'tel-country-code', 'tel-national', 'tel-area-code', 'tel-local', 'tel-extension', 'impp', 'email',
]);

const CONTACT = new Set(['tel', 'tel-country-code', 'tel-national', 'tel-area-code', 'tel-local', 'tel-extension', 'email', 'impp']);
const CONTACT_PREFIX = new Set(['home', 'work', 'mobile', 'fax', 'pager']);

/** The one token left once section, shipping or billing, contact prefix and webauthn are removed, or null when the value is not valid. */
export function parseToken(value: string): { token: string } | { off: true } | null {
  const parts = value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length === 1 && (parts[0] === 'off' || parts[0] === 'on')) return parts[0] === 'off' ? { off: true } : { token: 'on' };
  let rest = parts;
  if (rest.at(-1) === 'webauthn') rest = rest.slice(0, -1);
  if (rest[0]?.startsWith('section-')) rest = rest.slice(1);
  if (rest[0] === 'shipping' || rest[0] === 'billing') rest = rest.slice(1);
  let prefixed = false;
  if (rest[0] && CONTACT_PREFIX.has(rest[0])) {
    prefixed = true;
    rest = rest.slice(1);
  }
  if (rest.length !== 1) return null;
  const token = rest[0] ?? '';
  if (!TOKENS.has(token)) return null;
  if (prefixed && !CONTACT.has(token)) return null;
  return { token };
}

interface Purpose {
  readonly group: string;
  /** Tokens that are right for the label. */
  readonly tokens: readonly string[];
  readonly en: string;
  readonly fr: string;
}

/** What a field's label or name says it asks for. Order matters, the first match wins. */
const PURPOSES: ReadonlyArray<{ re: RegExp; p: Purpose }> = [
  { re: /e-?mail|courriel/i, p: { group: 'email', tokens: ['email', 'username'], en: 'e-mail address', fr: 'adresse courriel' } },
  { re: /phone|t[ée]l[ée]phone|\btel\b|mobile|cell/i, p: { group: 'tel', tokens: ['tel', 'tel-national', 'tel-local', 'tel-area-code', 'tel-country-code', 'tel-extension'], en: 'phone number', fr: 'numéro de téléphone' } },
  { re: /postal|zip|code postal/i, p: { group: 'postal', tokens: ['postal-code'], en: 'postal code', fr: 'code postal' } },
  { re: /first name|given name|pr[ée]nom/i, p: { group: 'given', tokens: ['given-name', 'additional-name', 'cc-given-name'], en: 'first name', fr: 'prénom' } },
  { re: /last name|family name|surname|nom de famille/i, p: { group: 'family', tokens: ['family-name', 'cc-family-name'], en: 'last name', fr: 'nom de famille' } },
  { re: /^\s*(your |votre )?(full )?name\s*\*?\s*$|^\s*nom( complet)?\s*\*?\s*$/i, p: { group: 'name', tokens: ['name', 'cc-name', 'nickname'], en: 'name', fr: 'nom' } },
  { re: /street|address line|adresse|\baddress\b/i, p: { group: 'street', tokens: ['street-address', 'address-line1', 'address-line2', 'address-line3'], en: 'street address', fr: 'adresse' } },
  { re: /\bcity\b|\btown\b|\bville\b/i, p: { group: 'city', tokens: ['address-level2'], en: 'city', fr: 'ville' } },
  { re: /province|\bstate\b|\bterritory\b/i, p: { group: 'region', tokens: ['address-level1'], en: 'province or state', fr: 'province ou État' } },
  { re: /country|\bpays\b/i, p: { group: 'country', tokens: ['country', 'country-name'], en: 'country', fr: 'pays' } },
  { re: /birthday|birth ?date|date of birth|date de naissance|naissance/i, p: { group: 'bday', tokens: ['bday', 'bday-day', 'bday-month', 'bday-year'], en: 'birth date', fr: 'date de naissance' } },
  { re: /user ?name|nom d['’]utilisateur|identifiant/i, p: { group: 'username', tokens: ['username', 'email'], en: 'user name', fr: 'nom d’utilisateur' } },
  { re: /card number|num[ée]ro de carte/i, p: { group: 'card', tokens: ['cc-number'], en: 'card number', fr: 'numéro de carte' } },
];

/** What a field's words say it asks for, or null. */
export function purposeOf(f: Pick<FieldFact, 'label' | 'name'>): Purpose | null {
  for (const { re, p } of PURPOSES) if (re.test(f.label) || (f.label === '' && re.test(f.name))) return p;
  return null;
}

/** Field types that never take an autofill token of this kind. */
const SKIP_TYPES = new Set(['number', 'range', 'date', 'datetime-local', 'month', 'week', 'time']);

export function auditPurpose(fields: readonly FieldFact[]): CheckResult {
  const entries: Entry[] = [];
  const add = (f: FieldFact, status: 'fail' | 'unknown', rule: PurposeRule, en: string, fr: string): void => {
    entries.push({ check: 'purpose', id: f.id, status, rule, message: t(en, fr) });
  };
  let checked = 0;
  for (const f of fields) {
    const name = clip(f.label || f.name || f.id, 32);
    const raw = f.autocomplete;
    const purpose = SKIP_TYPES.has(f.type) && f.type !== 'date' ? null : purposeOf(f);
    if (raw !== '') {
      checked++;
      const parsed = parseToken(raw);
      if (parsed === null) continue;
      if ('off' in parsed) {
        if (purpose && f.type !== 'password') {
          add(
            f,
            'unknown',
            'autocomplete-off',
            `The field ${name} asks for a ${purpose.en} and turns autofill off. Check that this is needed, since people with memory or motor limits rely on autofill.`,
            `Le champ ${name} demande un ${purpose.fr} et désactive le remplissage automatique. Contrôlez que c’est nécessaire, car les personnes avec des limites de mémoire ou de motricité s’y fient.`,
          );
        }
        continue;
      }
      if (purpose && !purpose.tokens.includes(parsed.token) && parsed.token !== 'on') {
        add(
          f,
          'fail',
          'purpose-mismatch',
          `The field ${name} asks for a ${purpose.en}, but its autocomplete says “${parsed.token}”.`,
          `Le champ ${name} demande un ${purpose.fr}, mais son autocomplete indique «\u202F${parsed.token}\u202F».`,
        );
      }
      continue;
    }
  }
  return { checked, entries };
}
