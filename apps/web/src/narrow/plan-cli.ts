import { discoverRoutes } from './discover.js';
import { describeRobots, parseRobots, splitByRobots, type Robots } from './robots.js';
import { normalizeRoute } from './routes.js';
import { describePlan, planAsRouteList, planAudit } from './sampling.js';
import { parseSitemap, routesFromSitemap } from './sitemap.js';
import type { Lang } from './types.js';

/**
 * `narrow-audit plan`: reads sitemaps, a robots file and saved pages from
 * disk, and prints which routes to audit. It never opens a browser and never
 * fetches anything.
 */

export const DEFAULT_AGENT = 'narrow-audit';

export interface PlanArgs {
  readonly baseUrl: string;
  readonly sitemapFiles: readonly string[];
  readonly robotsFile: string | null;
  /** Saved pages as [route or address, file]. */
  readonly pages: readonly (readonly [string, string])[];
  /** Files with one route or address per line. */
  readonly routeFiles: readonly string[];
  readonly agent: string;
  readonly perTemplate: number | null;
  readonly maxRoutes: number | null;
  readonly minSiblings: number | null;
  readonly always: readonly string[];
  readonly literals: readonly string[];
  readonly lang: Lang;
  /** File to write the chosen routes to, one per line. */
  readonly outFile: string | null;
  readonly help: boolean;
}

type Text = { readonly en: string; readonly fr: string };
export type ParsedPlanArgs = { readonly ok: true; readonly args: PlanArgs } | { readonly ok: false; readonly error: Text };

export const PLAN_HELP_TEXT =
  'Usage: narrow-audit plan --base-url URL [--sitemap FILE ...] [--routes FILE ...] [--page ROUTE=FILE ...]\n' +
  '                         [--robots FILE] [--agent NAME] [--per-template N] [--max-routes N]\n' +
  '                         [--min-siblings N] [--always ROUTE ...] [--literal SEGMENT ...]\n' +
  '                         [--lang en|fr] [--out FILE]\n' +
  'Reads files only. Prints which routes to audit and how many it leaves out.\n' +
  'Exit code 0 when a plan was printed, 2 on a usage or read error.\n' +
  '\n' +
  'Utilisation\u00A0: narrow-audit plan --base-url URL [--sitemap FICHIER ...] [--routes FICHIER ...] [--page ROUTE=FICHIER ...]\n' +
  '                         [--robots FICHIER] [--agent NOM] [--per-template N] [--max-routes N]\n' +
  '                         [--min-siblings N] [--always ROUTE ...] [--literal SEGMENT ...]\n' +
  '                         [--lang en|fr] [--out FICHIER]\n' +
  'Lit seulement des fichiers. Affiche les routes à auditer et le nombre de routes laissées de côté.\n' +
  'Code de sortie 0 quand un plan est affiché, 2 en cas d’erreur d’utilisation ou de lecture.\n';

export function parsePlanArgs(argv: readonly string[]): ParsedPlanArgs {
  const fail = (en: string, fr: string): ParsedPlanArgs => ({ ok: false, error: { en, fr } });
  let baseUrl = '';
  const sitemapFiles: string[] = [];
  const routeFiles: string[] = [];
  const pages: [string, string][] = [];
  const always: string[] = [];
  const literals: string[] = [];
  let robotsFile: string | null = null;
  let agent = DEFAULT_AGENT;
  let perTemplate: number | null = null;
  let maxRoutes: number | null = null;
  let minSiblings: number | null = null;
  let lang: Lang = 'en';
  let outFile: string | null = null;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? '';
    if (a === '--help') {
      help = true;
      continue;
    }
    const v = argv[++i];
    if (!v) {
      return ['--base-url', '--sitemap', '--routes', '--page', '--robots', '--agent', '--per-template', '--max-routes', '--min-siblings', '--always', '--literal', '--lang', '--out'].includes(a)
        ? fail(`${a} needs a value.`, `${a} demande une valeur.`)
        : fail(`Unknown option ${a}.`, `Option non reconnue ${a}.`);
    }
    switch (a) {
      case '--base-url':
        baseUrl = v;
        break;
      case '--sitemap':
        sitemapFiles.push(v);
        break;
      case '--routes':
        routeFiles.push(v);
        break;
      case '--page': {
        const at = v.indexOf('=');
        if (at < 1 || at === v.length - 1) return fail('--page needs ROUTE=FILE, for example /=dist/index.html.', '--page demande ROUTE=FICHIER, par exemple /=dist/index.html.');
        pages.push([v.slice(0, at), v.slice(at + 1)]);
        break;
      }
      case '--robots':
        robotsFile = v;
        break;
      case '--agent':
        agent = v;
        break;
      case '--per-template':
      case '--max-routes':
      case '--min-siblings': {
        const n = Number(v);
        const least = a === '--min-siblings' ? 2 : 1;
        if (!Number.isInteger(n) || n < least) return fail(`${a} needs a whole number, ${least} or more.`, `${a} demande un nombre entier, ${least} ou plus.`);
        if (a === '--per-template') perTemplate = n;
        else if (a === '--max-routes') maxRoutes = n;
        else minSiblings = n;
        break;
      }
      case '--always':
        always.push(v);
        break;
      case '--literal':
        literals.push(v);
        break;
      case '--lang':
        if (v !== 'en' && v !== 'fr') return fail('--lang must be en or fr.', '--lang doit être en ou fr.');
        lang = v;
        break;
      case '--out':
        outFile = v;
        break;
      default:
        return fail(`Unknown option ${a}.`, `Option non reconnue ${a}.`);
    }
  }
  if (!help) {
    if (baseUrl === '') return fail('--base-url is required: it says which host the routes belong to.', '--base-url est obligatoire\u00A0: il indique à quel hôte les routes appartiennent.');
    if (normalizeRoute('/', baseUrl) === null) return fail('--base-url must be a full http or https address.', '--base-url doit être une adresse http ou https complète.');
    if (sitemapFiles.length === 0 && routeFiles.length === 0 && pages.length === 0) {
      return fail('Nothing to plan from. Give --sitemap, --routes or --page.', 'Rien pour établir un plan. Indiquez --sitemap, --routes ou --page.');
    }
  }
  return { ok: true, args: { baseUrl, sitemapFiles, robotsFile, pages, routeFiles, agent, perTemplate, maxRoutes, minSiblings, always, literals, lang, outFile, help } };
}

export interface PlanDeps {
  readText(path: string): Promise<string>;
  writeText(path: string, text: string): Promise<void>;
  log(line: string): void;
}

export async function runPlan(argv: readonly string[], deps: PlanDeps): Promise<number> {
  const parsed = parsePlanArgs(argv);
  if (!parsed.ok) {
    deps.log(`${parsed.error.en} / ${parsed.error.fr}`);
    deps.log(PLAN_HELP_TEXT);
    return 2;
  }
  const { args } = parsed;
  if (args.help) {
    deps.log(PLAN_HELP_TEXT);
    return 0;
  }
  const fr = args.lang === 'fr';
  const colon = fr ? '\u00A0:' : ':';
  try {
    const routes = new Set<string>();
    for (const file of args.sitemapFiles) {
      const sitemap = parseSitemap(await deps.readText(file));
      if (!sitemap.ok) {
        deps.log(`${file}: ${sitemap.error.en} / ${file}\u00A0: ${sitemap.error.fr}`);
        return 2;
      }
      if (sitemap.value.kind === 'index') {
        deps.log(
          fr
            ? `${file}${colon} ce fichier est un index. Il nomme ${sitemap.value.entries.length} autre(s) plan(s) du site, qui ne sont pas lus d’ici. Donnez chacun avec --sitemap.`
            : `${file}${colon} this file is an index. It names ${sitemap.value.entries.length} other sitemap(s), which are not read from here. Give each one with --sitemap.`,
        );
        continue;
      }
      const found = routesFromSitemap(sitemap.value, args.baseUrl);
      for (const r of found.routes) routes.add(r);
      deps.log(
        fr
          ? `${file}${colon} ${found.routes.length} route(s), ${found.skipped} adresse(s) d’un autre hôte, ${found.duplicates} répétition(s).`
          : `${file}${colon} ${found.routes.length} route(s), ${found.skipped} address(es) on another host, ${found.duplicates} repeat(s).`,
      );
      if (sitemap.value.truncated) {
        deps.log(fr ? `${file}${colon} le fichier dépasse la limite du protocole. Seules les premières adresses ont été lues.` : `${file}${colon} the file is over the limit of the protocol. Only the first addresses were read.`);
      }
    }
    for (const file of args.routeFiles) {
      let skipped = 0;
      for (const line of (await deps.readText(file)).split(/\r?\n/)) {
        const text = line.trim();
        if (text === '' || text.startsWith('#')) continue;
        const route = normalizeRoute(text, args.baseUrl);
        if (route === null) skipped++;
        else routes.add(route);
      }
      if (skipped > 0) deps.log(fr ? `${file}${colon} ${skipped} ligne(s) qui ne sont pas des routes de ce site ont été laissées de côté.` : `${file}${colon} ${skipped} line(s) that are not routes of this site were left out.`);
    }
    if (args.pages.length > 0) {
      const markup = new Map<string, string>();
      for (const [where, file] of args.pages) {
        let address: string;
        try {
          address = new URL(where, args.baseUrl).toString();
        } catch {
          deps.log(`--page ${where}=${file}: not a route or an address / n’est ni une route ni une adresse`);
          return 2;
        }
        markup.set(address, await deps.readText(file));
      }
      const found = discoverRoutes(markup);
      for (const r of found.routes) if (normalizeRoute(r, args.baseUrl) !== null) routes.add(r);
      deps.log(
        fr
          ? `Pages lues${colon} ${args.pages.length}. Routes trouvées dans leurs liens${colon} ${found.routes.length}, dont ${found.notRead.length} sans balisage fourni. Les liens ajoutés par un script ne sont pas vus.`
          : `Pages read${colon} ${args.pages.length}. Routes found in their links${colon} ${found.routes.length}, of which ${found.notRead.length} with no markup given. Links that a script adds are not seen.`,
      );
    }

    let list = [...routes];
    let robots: Robots | null = null;
    if (args.robotsFile !== null) {
      robots = parseRobots(await deps.readText(args.robotsFile));
      deps.log(describeRobots(robots, args.agent, list, args.lang));
      const split = splitByRobots(robots, args.agent, list);
      for (const r of split.disallowed.slice(0, 20)) deps.log(`  - ${r}`);
      if (split.disallowed.length > 20) deps.log(fr ? `  et ${split.disallowed.length - 20} de plus` : `  and ${split.disallowed.length - 20} more`);
      list = [...split.allowed];
    }

    const always = args.always.map((r) => normalizeRoute(r, args.baseUrl)).filter((r): r is string => r !== null);
    const plan = planAudit(list, {
      ...(args.perTemplate !== null ? { perTemplate: args.perTemplate } : {}),
      ...(args.maxRoutes !== null ? { maxRoutes: args.maxRoutes } : {}),
      ...(args.minSiblings !== null ? { minSiblings: args.minSiblings } : {}),
      ...(args.literals.length > 0 ? { literals: args.literals } : {}),
      ...(always.length > 0 ? { always } : {}),
    });
    deps.log(describePlan(plan, args.lang));
    if (args.outFile !== null) await deps.writeText(args.outFile, planAsRouteList(plan));
    return 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    deps.log(`Planning failed / Échec du plan${fr ? '\u00A0' : ''}: ${msg}`);
    return 2;
  }
}
