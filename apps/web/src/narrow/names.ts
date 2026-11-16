import type { DocSnap, ElSnap } from './inpage.js';
import { NNBSP, clip, type CheckResult, type Entry } from './types.js';

export function normaliseLabel(s: string): string {
  return s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Controls need a name (4.1.2), and the visible label must be part of that
 * name (2.5.3). The name is an approximation of the browser's own computation,
 * so a result is a prompt to look, not a final verdict.
 */
export function auditNames(els: readonly ElSnap[]): { readonly names: CheckResult; readonly labels: CheckResult } {
  const names: Entry[] = [];
  const labels: Entry[] = [];
  let labelChecked = 0;
  for (const e of els) {
    if (!e.name.trim()) {
      names.push({
        check: 'name',
        id: e.id,
        status: 'fail',
        message: { en: 'Control has no accessible name.', fr: 'Le contrôle n’a pas de nom accessible.' },
      });
      continue;
    }
    const visible = normaliseLabel(e.text);
    if (!visible) continue;
    labelChecked++;
    if (!normaliseLabel(e.name).includes(visible)) {
      labels.push({
        check: 'label-in-name',
        id: e.id,
        status: 'fail',
        message: {
          en: `The visible label “${clip(e.text)}” is not part of the accessible name “${clip(e.name)}”.`,
          fr: `L’étiquette visible «${NNBSP}${clip(e.text)}${NNBSP}» ne fait pas partie du nom accessible «${NNBSP}${clip(e.name)}${NNBSP}».`,
        },
      });
    }
  }
  return {
    names: { checked: els.length, entries: names },
    labels: { checked: labelChecked, entries: labels },
  };
}

/** The page needs a lang attribute holding a plausible language tag (3.1.1). */
export function auditLanguage(doc: Pick<DocSnap, 'lang'>): CheckResult {
  const lang = doc.lang.trim();
  if (!lang) {
    return {
      checked: 1,
      entries: [
        {
          check: 'language',
          id: 'html',
          status: 'fail',
          message: { en: 'The page has no lang attribute.', fr: 'La page n’a pas d’attribut lang.' },
        },
      ],
    };
  }
  if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(lang)) {
    return {
      checked: 1,
      entries: [
        {
          check: 'language',
          id: 'html',
          status: 'fail',
          message: {
            en: `The lang value “${clip(lang)}” is not a valid language tag.`,
            fr: `La valeur lang «${NNBSP}${clip(lang)}${NNBSP}» n’est pas une balise de langue valide.`,
          },
        },
      ],
    };
  }
  return { checked: 1, entries: [] };
}
