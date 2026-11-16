import { clip, t, type CheckResult, type Entry } from './types.js';

/**
 * Compares what a page offers in each view (portrait, landscape, dark and so
 * on). A control that is there in the first view and gone in another may be a
 * fair collapse into a menu, or content that is lost when the device turns
 * (WCAG 1.3.4), so it is UNKNOWN and a person decides.
 */

export interface ControlLike {
  readonly tag: string;
  readonly name: string;
  readonly text: string;
}

export interface View {
  readonly profile: string;
  /** Keys from controlKeys. */
  readonly keys: readonly string[];
}

export const controlKey = (c: ControlLike): string => `${c.tag.toLowerCase()}|${(c.name || c.text).replace(/\s+/g, ' ').trim().toLowerCase()}`;

/** Keys for the controls that have a name. Unnamed ones are the name check's business. */
export function controlKeys(controls: readonly ControlLike[]): string[] {
  const out: string[] = [];
  for (const c of controls) {
    const k = controlKey(c);
    if (!k.endsWith('|') && !out.includes(k)) out.push(k);
  }
  return out;
}

const label = (key: string): string => {
  const [tag, name] = key.split('|');
  return `${tag ?? ''} “${clip(name ?? '', 24)}”`;
};

/** The first view is the reference. */
export function auditParity(views: readonly View[]): CheckResult {
  const entries: Entry[] = [];
  const ref = views[0];
  if (!ref || views.length < 2) return { checked: ref ? ref.keys.length : 0, entries };
  for (const v of views.slice(1)) {
    const have = new Set(v.keys);
    const missing = ref.keys.filter((k) => !have.has(k));
    if (missing.length === 0) continue;
    const list = missing.slice(0, 3).map(label).join(', ');
    const more = missing.length > 3 ? ` +${missing.length - 3}` : '';
    const landscape = v.profile === 'landscape';
    entries.push({
      check: 'parity',
      id: v.profile,
      status: 'unknown',
      rule: landscape ? 'landscape-missing' : 'view-missing',
      message: t(
        `${missing.length} control(s) in the ${ref.profile} view are not available in the ${v.profile} view: ${list}${more}. ${landscape ? 'Content must not depend on how the device is held.' : 'Check that this is a fair collapse and not lost content.'}`,
        `${missing.length} contrôle(s) de l’affichage ${ref.profile} ne sont pas disponibles dans l’affichage ${v.profile}\u00A0: ${list}${more}. ${landscape ? 'Le contenu ne doit pas dépendre de la façon de tenir l’appareil.' : 'Contrôlez qu’il s’agit d’un repli légitime et non d’un contenu perdu.'}`,
      ),
    });
  }
  return { checked: ref.keys.length, entries };
}
