import { t, type CheckResult, type Entry, type EntryStatus } from './types.js';

/**
 * Static checks of a service worker's source text for the parts the App needs
 * to work offline. It reads the text and does not run it, so a worker built
 * from a library (Workbox, say) may look incomplete here: the result is a prompt
 * to look, and the rules that need judgement are UNKNOWN.
 */

export type SwRule = 'no-fetch-handler' | 'no-cache' | 'no-precache' | 'no-fallback' | 'cache-version' | 'no-cleanup' | 'no-catch';

export const SW_RULES: readonly SwRule[] = ['no-fetch-handler', 'no-cache', 'no-precache', 'no-fallback', 'cache-version', 'no-cleanup', 'no-catch'];

const MESSAGES: Readonly<Record<SwRule, { en: string; fr: string }>> = {
  'no-fetch-handler': { en: 'The worker has no fetch handler, so pages cannot be served offline.', fr: 'Le worker n’a pas de gestionnaire fetch, les pages ne peuvent donc pas être servies hors ligne.' },
  'no-cache': { en: 'The worker never uses the Cache API.', fr: 'Le worker n’utilise jamais l’API Cache.' },
  'no-precache': { en: 'The worker has no install step that fills a cache, so the first offline visit may find nothing.', fr: 'Le worker n’a pas d’étape install qui remplit un cache, la première visite hors ligne risque de ne rien trouver.' },
  'no-fallback': { en: 'No offline page or answer is named. Check what a person sees with no network.', fr: 'Aucune page ni réponse hors ligne n’est nommée. Contrôlez ce que voit une personne sans réseau.' },
  'cache-version': { en: 'A cache name has no version, so old files may be served after an update.', fr: 'Un nom de cache n’a pas de version, d’anciens fichiers risquent d’être servis après une mise à jour.' },
  'no-cleanup': { en: 'No activate step deletes old caches. They will pile up on the device.', fr: 'Aucune étape activate ne supprime les anciens caches. Ils s’accumuleront sur l’appareil.' },
  'no-catch': { en: 'A fetch has no way to handle a network error.', fr: 'Un fetch n’a aucun moyen de gérer une erreur réseau.' },
};

const REVIEW: ReadonlySet<SwRule> = new Set<SwRule>(['no-precache', 'no-fallback', 'cache-version', 'no-cleanup', 'no-catch']);

/** Removes comments and keeps line breaks so line numbers stay right. */
export function stripComments(src: string): string {
  let out = '';
  let i = 0;
  let quote: string | null = null;
  while (i < src.length) {
    const c = src[i] ?? '';
    const n = src[i + 1] ?? '';
    if (quote) {
      out += c;
      if (c === '\\') {
        out += n;
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c;
      out += c;
      i++;
    } else if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') i++;
    } else if (c === '/' && n === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') out += '\n';
        i++;
      }
      i += 2;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

const lineOf = (text: string, index: number): number => text.slice(0, index).split('\n').length;

export function lintServiceWorker(file: string, source: string): CheckResult {
  const code = stripComments(source);
  const entries: Entry[] = [];
  const add = (rule: SwRule, at?: number): void => {
    const status: EntryStatus = REVIEW.has(rule) ? 'unknown' : 'fail';
    const m = MESSAGES[rule];
    entries.push({ check: 'service-worker', id: at === undefined ? file : `${file}@L${lineOf(code, at)}`, status, rule, message: t(m.en, m.fr) });
  };
  const listens = (ev: string): boolean => new RegExp(`addEventListener\\(\\s*['"\`]${ev}['"\`]|\\bon${ev}\\s*=`).test(code);
  const usesCache = /\bcaches\s*\.\s*(open|match|keys|delete)\b|\bcache\s*\.\s*(add|addAll|put|match)\b/.test(code);
  const workbox = /\bworkbox\b|importScripts\(/.test(code);

  if (!listens('fetch') && !workbox) add('no-fetch-handler');
  if (!usesCache && !workbox) add('no-cache');
  if (usesCache && !(listens('install') && /\.addAll\(|\.add\(|\.put\(/.test(code))) add('no-precache');
  if (!/offline|fallback/i.test(code) && !workbox) add('no-fallback');
  for (const m of code.matchAll(/caches\s*\.\s*open\(\s*(['"`])([^'"`]*)\1/g)) {
    if (!/\d|v\b|version/i.test(m[2] ?? '')) add('cache-version', m.index);
  }
  for (const m of code.matchAll(/caches\s*\.\s*open\(\s*([A-Za-z_$][\w$.]*)\s*\)/g)) {
    const name = m[1] ?? '';
    const decl = new RegExp(`(?:const|let|var)\\s+${name.replace(/[.$]/g, '\\$&')}\\s*=\\s*(['"\`])([^'"\`]*)\\1`).exec(code);
    if (decl && !/\d|v\b|version/i.test(decl[2] ?? '')) add('cache-version', decl.index);
  }
  if (usesCache && !(listens('activate') && /caches\s*\.\s*delete\b/.test(code))) add('no-cleanup');
  if (listens('fetch') && /\bfetch\s*\(/.test(code) && !/\.catch\s*\(|\bcatch\s*[({]/.test(code)) add('no-catch');
  return { checked: 1, entries };
}
