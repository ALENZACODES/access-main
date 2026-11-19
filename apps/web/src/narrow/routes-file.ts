import { normalizeRoute } from './routes.js';

/**
 * Reads a list of routes from text, one per line, as `narrow-audit plan
 * --out` writes it. Blank lines and lines that start with `#` are skipped.
 * A line may be a path (`/places/12`) or a full address on the base URL.
 * Every other line is refused with its line number, so a wrong file is not
 * half used.
 */

type Text = { readonly en: string; readonly fr: string };

export type ParsedRoutes = { readonly ok: true; readonly routes: readonly string[]; readonly repeats: number } | { readonly ok: false; readonly error: Text };

/** Routes above which the reader adds a note that a browser audit of that many pages takes long. It is a note, not a limit. */
export const MANY_ROUTES = 200;

export function parseRoutesFile(text: string, baseUrl: string): ParsedRoutes {
  const bad = (en: string, fr: string): ParsedRoutes => ({ ok: false, error: { en, fr } });
  if (baseUrl === '' || normalizeRoute('/', baseUrl) === null) {
    return bad('A routes file needs --base-url, as a full http or https address.', 'Un fichier de routes demande --base-url, sous forme d’adresse http ou https complète.');
  }
  const seen = new Set<string>();
  let repeats = 0;
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? '').trim();
    if (line === '' || line.startsWith('#')) continue;
    const isAddress = /^https?:\/\//i.test(line);
    if (!isAddress && !line.startsWith('/')) {
      return bad(
        `Routes file, line ${i + 1}: a route starts with "/" or is a full address. Found: ${line.slice(0, 60)}`,
        `Fichier de routes, ligne ${i + 1}\u00A0: une route commence par "/" ou est une adresse complète. Trouvé\u00A0: ${line.slice(0, 60)}`,
      );
    }
    const route = normalizeRoute(line, baseUrl);
    if (route === null) {
      return bad(
        `Routes file, line ${i + 1}: this address is not on the host of --base-url: ${line.slice(0, 60)}`,
        `Fichier de routes, ligne ${i + 1}\u00A0: cette adresse n’est pas sur l’hôte de --base-url\u00A0: ${line.slice(0, 60)}`,
      );
    }
    if (seen.has(route)) repeats++;
    else seen.add(route);
  }
  if (seen.size === 0) return bad('The routes file holds no route.', 'Le fichier de routes ne contient aucune route.');
  return { ok: true, routes: [...seen], repeats };
}

/** One line on what was read, or an empty string when there is nothing worth saying. */
export function describeRoutesFile(file: string, parsed: Extract<ParsedRoutes, { ok: true }>, lang: 'en' | 'fr'): string {
  const n = parsed.routes.length;
  const parts: string[] = [];
  if (parsed.repeats > 0) parts.push(lang === 'fr' ? `${parsed.repeats} répétition(s) ignorée(s)` : `${parsed.repeats} repeat(s) dropped`);
  if (n > MANY_ROUTES) {
    parts.push(
      lang === 'fr'
        ? `un audit dans un navigateur de ${n} routes prend du temps, et narrow-audit plan peut en choisir quelques-unes par gabarit`
        : `a browser audit of ${n} routes takes a while, and narrow-audit plan can choose a few per template`,
    );
  }
  if (parts.length === 0) return '';
  return lang === 'fr' ? `${file}\u00A0: ${n} route(s) lue(s), ${parts.join(', ')}.` : `${file}: ${n} route(s) read, ${parts.join(', ')}.`;
}
