import { clip, t, type CheckResult, type Entry } from './types.js';
import type { FieldFact } from './semantics.js';

/**
 * Labels, hints and error messages on the fields a page shows (WCAG 3.3.2 and
 * 3.3.1). A missing label is a measured failure. Anything that needs a person
 * to read the page (does the mark explain itself, is the hint close enough)
 * is UNKNOWN.
 */

export type FormRule = 'placeholder-only' | 'error-empty' | 'required-unmarked' | 'hint-unlinked' | 'type-mismatch' | 'error-unannounced';

export const FORM_RULES: readonly FormRule[] = ['placeholder-only', 'error-empty', 'required-unmarked', 'hint-unlinked', 'type-mismatch', 'error-unannounced'];

const MARK = /\*|＊|required|obligatoire|requis|optional|facultatif/i;
const EMAIL = /e-?mail|courriel/i;
const PHONE = /phone|téléphone|telephone|\btel\b|mobile|cell/i;

/** Which input type a field's name or label asks for, or null. */
export function wantedType(f: Pick<FieldFact, 'name' | 'label' | 'id'>): 'email' | 'tel' | null {
  const text = `${f.name} ${f.label} ${f.id}`;
  if (EMAIL.test(text)) return 'email';
  if (PHONE.test(text)) return 'tel';
  return null;
}

const fieldName = (f: FieldFact): string => clip(f.label || f.name || f.id, 32);

export function auditForms(fields: readonly FieldFact[], requiredNote: boolean): CheckResult {
  const entries: Entry[] = [];
  const add = (f: FieldFact, status: 'fail' | 'unknown', rule: FormRule, en: string, fr: string): void => {
    entries.push({ check: 'forms', id: f.id, status, rule, message: t(en, fr) });
  };
  for (const f of fields) {
    if (f.label === '' && f.placeholder !== '') {
      add(
        f,
        'fail',
        'placeholder-only',
        `The field “${clip(f.placeholder, 24)}” has only a placeholder. The text disappears when typing, so it is not a label.`,
        `Le champ «\u202F${clip(f.placeholder, 24)}\u202F» n’a qu’un texte indicatif. Il disparaît à la saisie, ce n’est donc pas une étiquette.`,
      );
    }
    if (f.invalid && f.error && f.error.text === '') {
      add(
        f,
        'fail',
        'error-empty',
        `The field ${fieldName(f)} is marked invalid and points to an error message with no text.`,
        `Le champ ${fieldName(f)} est marqué invalide et pointe vers un message d’erreur sans texte.`,
      );
    }
    if (f.invalid && f.error && f.error.text !== '' && !f.error.announced) {
      add(
        f,
        'unknown',
        'error-unannounced',
        `The error for ${fieldName(f)} is not in a live region. Check that a screen reader user hears it.`,
        `L’erreur de ${fieldName(f)} n’est pas dans une région live. Contrôlez qu’une personne qui utilise un lecteur d’écran l’entend.`,
      );
    }
    if (f.required && !MARK.test(f.label) && !requiredNote) {
      add(
        f,
        'unknown',
        'required-unmarked',
        `The field ${fieldName(f)} is required but its label does not say so, and the page has no note about required fields.`,
        `Le champ ${fieldName(f)} est obligatoire mais son étiquette ne l’indique pas, et la page n’a aucune note sur les champs obligatoires.`,
      );
    }
    if (f.hintUnlinked) {
      add(
        f,
        'unknown',
        'hint-unlinked',
        `A hint next to ${fieldName(f)} is not linked with aria-describedby, so it may not be read with the field.`,
        `Une aide à côté de ${fieldName(f)} n’est pas liée par aria-describedby, elle peut donc ne pas être lue avec le champ.`,
      );
    }
    const want = wantedType(f);
    if (want && f.kind === 'input' && f.type === 'text' && f.inputmode === '') {
      add(
        f,
        'unknown',
        'type-mismatch',
        `The field ${fieldName(f)} looks like a ${want === 'email' ? 'email address' : 'phone number'} but has no matching type. The right keyboard would not open.`,
        `Le champ ${fieldName(f)} ressemble à ${want === 'email' ? 'une adresse courriel' : 'un numéro de téléphone'} mais n’a pas de type correspondant. Le bon clavier ne s’ouvrirait pas.`,
      );
    }
  }
  return { checked: fields.length, entries };
}
