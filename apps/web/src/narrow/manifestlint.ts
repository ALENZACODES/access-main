import { parseColor } from './contrast.js';
import { t, type CheckResult, type Entry, type EntryStatus } from './types.js';

/**
 * Static checks of a web app manifest (manifest.webmanifest or manifest.json)
 * for what the App needs to install and run offline in English and French.
 * It reads the file as text and never fetches an icon or a page.
 */

export type ManifestRule =
  | 'invalid-json'
  | 'name'
  | 'short-name'
  | 'short-name-length'
  | 'start-url'
  | 'start-url-origin'
  | 'scope'
  | 'display'
  | 'icons'
  | 'icon-size'
  | 'icon-maskable'
  | 'lang'
  | 'orientation'
  | 'theme-color'
  | 'id'
  | 'related-apps'
  | 'shortcuts';

export const MANIFEST_RULES: readonly ManifestRule[] = [
  'invalid-json', 'name', 'short-name', 'short-name-length', 'start-url', 'start-url-origin', 'scope', 'display', 'icons',
  'icon-size', 'icon-maskable', 'lang', 'orientation', 'theme-color', 'id', 'related-apps', 'shortcuts',
];

const MESSAGES: Readonly<Record<ManifestRule, { en: string; fr: string }>> = {
  'invalid-json': { en: 'The manifest is not valid JSON.', fr: 'Le manifeste n’est pas un JSON valide.' },
  name: { en: 'The manifest has no name.', fr: 'Le manifeste n’a pas de nom.' },
  'short-name': { en: 'The manifest has no short_name for the home screen.', fr: 'Le manifeste n’a pas de short_name pour l’écran d’accueil.' },
  'short-name-length': {
    en: 'The short_name is longer than 12 characters and may be cut off under an icon.',
    fr: 'Le short_name dépasse 12 caractères et risque d’être tronqué sous l’icône.',
  },
  'start-url': { en: 'The manifest has no start_url.', fr: 'Le manifeste n’a pas de start_url.' },
  'start-url-origin': {
    en: 'The start_url is a full address. It should be on the same origin as the manifest.',
    fr: 'Le start_url est une adresse complète. Il devrait être sur la même origine que le manifeste.',
  },
  scope: { en: 'The start_url is outside the scope, so the App would not open as an installed app.', fr: 'Le start_url est hors du scope, l’application ne s’ouvrirait donc pas comme application installée.' },
  display: { en: 'The manifest has no display mode. Choose standalone or another one on purpose.', fr: 'Le manifeste n’a pas de mode d’affichage. Choisissez standalone ou un autre mode en connaissance de cause.' },
  icons: { en: 'The manifest has no icons.', fr: 'Le manifeste n’a pas d’icônes.' },
  'icon-size': { en: 'The icons need a 192x192 and a 512x512 size.', fr: 'Les icônes doivent exister en 192x192 et en 512x512.' },
  'icon-maskable': { en: 'No icon is marked maskable, so some launchers will shrink it on a plate.', fr: 'Aucune icône n’est marquée maskable, certains lanceurs la réduiront sur une pastille.' },
  lang: { en: 'The manifest has no valid lang. Set en or fr, and serve one manifest per language if the name differs.', fr: 'Le manifeste n’a pas de lang valide. Indiquez en ou fr, et servez un manifeste par langue si le nom diffère.' },
  orientation: { en: 'The orientation is locked. People who cannot turn their device need both orientations.', fr: 'L’orientation est verrouillée. Les personnes qui ne peuvent pas tourner leur appareil ont besoin des deux orientations.' },
  'theme-color': { en: 'The theme_color is missing or is not a colour.', fr: 'Le theme_color est absent ou n’est pas une couleur.' },
  id: { en: 'The manifest has no id, so the install identity follows start_url.', fr: 'Le manifeste n’a pas d’id, l’identité d’installation suit donc le start_url.' },
  'related-apps': { en: 'The manifest prefers a related native app. Check that this is meant.', fr: 'Le manifeste préfère une application native liée. Contrôlez que c’est voulu.' },
  shortcuts: { en: 'A shortcut has no name or no url.', fr: 'Un raccourci n’a pas de nom ou pas d’url.' },
};

const REVIEW: ReadonlySet<ManifestRule> = new Set<ManifestRule>(['short-name-length', 'start-url-origin', 'display', 'icon-maskable', 'id', 'related-apps']);

const DISPLAYS = new Set(['fullscreen', 'standalone', 'minimal-ui', 'browser']);
const LANG = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i;

function pathOf(url: string): string {
  const m = /^(?:https?:)?\/\/[^/]+(\/[^?#]*)?/i.exec(url);
  const p = m ? (m[1] ?? '/') : url.split(/[?#]/)[0] ?? '';
  return p;
}

const isAbsolute = (u: string): boolean => /^(?:https?:)?\/\//i.test(u);

/** Resolves a relative start_url against the manifest folder. Only for the scope comparison. */
function normalise(path: string): string {
  const parts: string[] = [];
  for (const seg of path.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return '/' + parts.join('/');
}

export function lintManifest(text: string): CheckResult {
  const entries: Entry[] = [];
  const add = (rule: ManifestRule, id: string, extra?: { en: string; fr: string }): void => {
    const m = MESSAGES[rule];
    const status: EntryStatus = REVIEW.has(rule) ? 'unknown' : 'fail';
    entries.push({ check: 'manifest', id, status, rule, message: extra ? t(`${m.en} ${extra.en}`, `${m.fr} ${extra.fr}`) : t(m.en, m.fr) });
  };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    add('invalid-json', 'manifest');
    return { checked: 1, entries };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    add('invalid-json', 'manifest');
    return { checked: 1, entries };
  }
  const m = raw as Record<string, unknown>;
  const str = (k: string): string => (typeof m[k] === 'string' ? (m[k] as string).trim() : '');
  let checked = 0;
  const count = (): void => void checked++;

  count();
  if (!str('name')) add('name', 'manifest:name');
  count();
  const short = str('short_name');
  if (!short) add('short-name', 'manifest:short_name');
  else if ([...short].length > 12) add('short-name-length', 'manifest:short_name');

  count();
  const start = str('start_url');
  if (!start) add('start-url', 'manifest:start_url');
  else {
    if (isAbsolute(start)) add('start-url-origin', 'manifest:start_url');
    const scope = str('scope');
    if (scope && !isAbsolute(start) && !isAbsolute(scope)) {
      const s = normalise(pathOf(scope)).replace(/\/$/, '');
      const u = normalise(pathOf(start));
      if (!(u === s || u.startsWith(s + '/') || s === '')) add('scope', 'manifest:scope');
    }
  }

  count();
  const display = str('display');
  if (!display || !DISPLAYS.has(display)) add('display', 'manifest:display');
  count();
  if (!LANG.test(str('lang'))) add('lang', 'manifest:lang');
  count();
  const orientation = str('orientation');
  if (/^(portrait|landscape)(-primary|-secondary)?$/.test(orientation)) add('orientation', 'manifest:orientation');
  count();
  if (!parseColor(str('theme_color'))) add('theme-color', 'manifest:theme_color');
  count();
  if (!str('id')) add('id', 'manifest:id');
  if (m['prefer_related_applications'] === true) add('related-apps', 'manifest:prefer_related_applications');

  count();
  const icons = Array.isArray(m['icons']) ? (m['icons'] as unknown[]) : [];
  if (icons.length === 0) add('icons', 'manifest:icons');
  else {
    const sizes = new Set<string>();
    let maskable = false;
    for (const i of icons) {
      const o = (i ?? {}) as Record<string, unknown>;
      for (const s of typeof o['sizes'] === 'string' ? (o['sizes'] as string).split(/\s+/) : []) sizes.add(s.toLowerCase());
      if (typeof o['purpose'] === 'string' && (o['purpose'] as string).split(/\s+/).includes('maskable')) maskable = true;
    }
    if (!sizes.has('192x192') || !sizes.has('512x512')) add('icon-size', 'manifest:icons');
    if (!maskable) add('icon-maskable', 'manifest:icons');
  }

  const shortcuts = Array.isArray(m['shortcuts']) ? (m['shortcuts'] as unknown[]) : [];
  shortcuts.forEach((s, i) => {
    count();
    const o = (s ?? {}) as Record<string, unknown>;
    if (typeof o['name'] !== 'string' || !(o['name'] as string).trim() || typeof o['url'] !== 'string' || !(o['url'] as string).trim()) add('shortcuts', `manifest:shortcuts[${i}]`);
  });
  return { checked, entries };
}
