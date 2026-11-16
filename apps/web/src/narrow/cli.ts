import { auditCopy, auditCopyDict } from './copylint.js';
import { htmlTextItems, lintHtml } from './htmllint.js';
import { auditI18n, flattenDict } from './i18n.js';
import type { OfflineContext } from './offline.js';
import { PROFILES, selectProfiles, type Profile } from './profiles.js';
import { auditProvenance } from './provenance.js';
import { buildRouteAudit, makeReport, renderHtml, renderJson, renderText, totals, type AuditReport, type RouteAudit } from './report.js';
import { runAudit, type FullPage } from './run.js';
import type { Lang } from './types.js';

export interface CliArgs {
  readonly baseUrl: string;
  readonly routes: readonly string[];
  readonly lang: Lang;
  readonly outDir: string | null;
  readonly enFile: string | null;
  readonly frFile: string | null;
  readonly offline: boolean;
  readonly strictUnknown: boolean;
  readonly help: boolean;
  /** Profile ids, "all", or null for the 320px profile only. */
  readonly profiles: string | null;
  readonly htmlFiles: readonly string[];
  readonly dataFile: string | null;
  readonly allowLicences: readonly string[];
  readonly requireFacts: readonly string[];
  readonly keyboardMax: number | null;
}

export type ParsedArgs =
  | { readonly ok: true; readonly args: CliArgs }
  | { readonly ok: false; readonly error: { readonly en: string; readonly fr: string } };

export const HELP_TEXT =
  'Usage: narrow-audit [--base-url URL --route /path ...] [--lang en|fr] [--out DIR]\n' +
  '                    [--profiles all|narrow,dark,...] [--offline] [--keyboard-max N]\n' +
  '                    [--en en.json --fr fr.json] [--html FILE ...] [--data FILE]\n' +
  '                    [--allow-licence ID ...] [--require-fact KEY ...] [--strict-unknown]\n' +
  `Profiles: ${PROFILES.map((p) => p.id).join(', ')}. A browser is only needed when routes are given.\n` +
  'Exit code 0 when no check failed, 1 when a check failed, 2 on a usage or run error.\n' +
  '\n' +
  'Utilisation\u00A0: narrow-audit [--base-url URL --route /chemin ...] [--lang en|fr] [--out DOSSIER]\n' +
  '                    [--profiles all|narrow,dark,...] [--offline] [--keyboard-max N]\n' +
  '                    [--en en.json --fr fr.json] [--html FICHIER ...] [--data FICHIER]\n' +
  '                    [--allow-licence ID ...] [--require-fact CLÉ ...] [--strict-unknown]\n' +
  'Un navigateur n’est nécessaire que lorsque des routes sont indiquées.\n' +
  'Code de sortie 0 sans anomalie, 1 si un contrôle échoue, 2 en cas d’erreur d’utilisation ou d’exécution.\n';

export function parseArgs(argv: readonly string[]): ParsedArgs {
  let baseUrl = '';
  const routes: string[] = [];
  const htmlFiles: string[] = [];
  const allowLicences: string[] = [];
  const requireFacts: string[] = [];
  let lang: Lang = 'en';
  let outDir: string | null = null;
  let enFile: string | null = null;
  let frFile: string | null = null;
  let dataFile: string | null = null;
  let profiles: string | null = null;
  let keyboardMax: number | null = null;
  let offline = false;
  let strictUnknown = false;
  let help = false;
  const fail = (en: string, fr: string): ParsedArgs => ({ ok: false, error: { en, fr } });
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? '';
    const next = (): string | undefined => argv[++i];
    const need = (flag: string, v: string | undefined, what: string, quoi: string): string | ParsedArgs => {
      if (!v) return fail(`${flag} needs ${what}.`, `${flag} demande ${quoi}.`);
      return v;
    };
    let got: string | ParsedArgs;
    switch (a) {
      case '--help':
      case '-h':
        help = true;
        break;
      case '--offline':
        offline = true;
        break;
      case '--strict-unknown':
        strictUnknown = true;
        break;
      case '--base-url':
        got = need(a, next(), 'a value', 'une valeur');
        if (typeof got !== 'string') return got;
        baseUrl = got;
        break;
      case '--route':
        got = need(a, next(), 'a value', 'une valeur');
        if (typeof got !== 'string') return got;
        routes.push(got);
        break;
      case '--lang': {
        const v = next();
        if (v !== 'en' && v !== 'fr') return fail('--lang must be en or fr.', '--lang doit valoir en ou fr.');
        lang = v;
        break;
      }
      case '--out':
        got = need(a, next(), 'a folder', 'un dossier');
        if (typeof got !== 'string') return got;
        outDir = got;
        break;
      case '--en':
        got = need(a, next(), 'a file', 'un fichier');
        if (typeof got !== 'string') return got;
        enFile = got;
        break;
      case '--fr':
        got = need(a, next(), 'a file', 'un fichier');
        if (typeof got !== 'string') return got;
        frFile = got;
        break;
      case '--html':
        got = need(a, next(), 'a file', 'un fichier');
        if (typeof got !== 'string') return got;
        htmlFiles.push(got);
        break;
      case '--data':
        got = need(a, next(), 'a file', 'un fichier');
        if (typeof got !== 'string') return got;
        dataFile = got;
        break;
      case '--allow-licence':
        got = need(a, next(), 'a licence id', 'un identifiant de licence');
        if (typeof got !== 'string') return got;
        allowLicences.push(got);
        break;
      case '--require-fact':
        got = need(a, next(), 'a fact key', 'une clé de fait');
        if (typeof got !== 'string') return got;
        requireFacts.push(got);
        break;
      case '--profiles': {
        const v = next();
        if (!v || !selectProfiles(v)) return fail('--profiles must be all or a list of known profile ids.', '--profiles doit valoir all ou une liste d’identifiants de profil connus.');
        profiles = v;
        break;
      }
      case '--keyboard-max': {
        const n = Number.parseInt(next() ?? '', 10);
        if (!Number.isInteger(n) || n < 0 || n > 500) return fail('--keyboard-max must be a whole number from 0 to 500.', '--keyboard-max doit être un entier de 0 à 500.');
        keyboardMax = n;
        break;
      }
      default:
        return fail(`Unknown option ${a}.`, `Option inconnue ${a}.`);
    }
  }
  if (!help) {
    const offlineOnly = routes.length === 0 && baseUrl === '';
    if (routes.length > 0 && !baseUrl) return fail('--base-url is required with --route.', '--base-url est obligatoire avec --route.');
    if (baseUrl && routes.length === 0) return fail('Give at least one --route.', 'Indiquez au moins un --route.');
    if (offlineOnly && htmlFiles.length === 0 && dataFile === null && enFile === null) {
      return fail('Nothing to audit. Give --route, --html, --data or --en and --fr.', 'Rien à auditer. Indiquez --route, --html, --data ou --en et --fr.');
    }
    if ((enFile === null) !== (frFile === null)) return fail('Give both --en and --fr, or neither.', 'Indiquez --en et --fr ensemble, ou aucun des deux.');
  }
  return {
    ok: true,
    args: { baseUrl, routes, lang, outDir, enFile, frFile, offline, strictUnknown, help, profiles, htmlFiles, dataFile, allowLicences, requireFacts, keyboardMax },
  };
}

export interface BrowserHandle {
  readonly page: FullPage;
  readonly context: OfflineContext;
  close(): Promise<void>;
}

/** Everything that touches the outside world is passed in, so the CLI can be tested. */
export interface CliDeps {
  launch(): Promise<BrowserHandle>;
  readText(path: string): Promise<string>;
  writeText(path: string, text: string): Promise<void>;
  log(line: string): void;
  now(): Date;
}

export function exitCode(report: AuditReport, strictUnknown: boolean): 0 | 1 {
  const t = totals(report.routes);
  return t.failed > 0 || (strictUnknown && t.unknown > 0) ? 1 : 0;
}

export async function runCli(argv: readonly string[], deps: CliDeps): Promise<number> {
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    deps.log(`${parsed.error.en} / ${parsed.error.fr}`);
    deps.log(HELP_TEXT);
    return 2;
  }
  const { args } = parsed;
  if (args.help) {
    deps.log(HELP_TEXT);
    return 0;
  }
  let browser: BrowserHandle | null = null;
  try {
    let i18n: { en: Record<string, string>; fr: Record<string, string> } | undefined;
    if (args.enFile !== null && args.frFile !== null) {
      i18n = {
        en: flattenDict(JSON.parse(await deps.readText(args.enFile))),
        fr: flattenDict(JSON.parse(await deps.readText(args.frFile))),
      };
    }
    const extra: RouteAudit[] = [];
    for (const file of args.htmlFiles) {
      const html = await deps.readText(file);
      extra.push(buildRouteAudit(`html:${file}`, null, { 'static-html': lintHtml(html), copy: auditCopy(htmlTextItems(html)) }));
    }
    if (args.dataFile !== null) {
      const data: unknown = JSON.parse(await deps.readText(args.dataFile));
      extra.push(
        buildRouteAudit(`data:${args.dataFile}`, null, {
          provenance: auditProvenance(data, {
            now: deps.now(),
            ...(args.allowLicences.length > 0 ? { allowedLicences: args.allowLicences } : {}),
            ...(args.requireFacts.length > 0 ? { requiredFacts: args.requireFacts } : {}),
          }),
        }),
      );
    }
    const profiles: Profile[] | undefined = args.profiles ? (selectProfiles(args.profiles) ?? undefined) : undefined;
    let report: AuditReport;
    if (args.routes.length > 0) {
      browser = await deps.launch();
      report = await runAudit({
        page: browser.page,
        ...(args.offline ? { context: browser.context } : {}),
        baseUrl: args.baseUrl,
        routes: args.routes,
        ...(profiles ? { profiles } : {}),
        ...(args.keyboardMax !== null ? { options: { keyboardMax: args.keyboardMax } } : {}),
        ...(i18n ? { i18n } : {}),
        extra,
        now: deps.now(),
      });
    } else {
      const strings = i18n ? [buildRouteAudit('strings', null, stringChecks(i18n.en, i18n.fr))] : [];
      report = makeReport([...strings, ...extra], deps.now());
    }
    deps.log(renderText(report, args.lang));
    if (args.outDir !== null) {
      const dir = args.outDir.replace(/\/+$/, '');
      await deps.writeText(`${dir}/narrow-audit.json`, renderJson(report));
      await deps.writeText(`${dir}/narrow-audit.${args.lang}.html`, renderHtml(report, args.lang));
    }
    return exitCode(report, args.strictUnknown);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    deps.log(`Audit failed / Échec de l’audit${args.lang === 'fr' ? '\u00A0' : ''}: ${msg}`);
    return 2;
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }
}

function stringChecks(en: Record<string, string>, fr: Record<string, string>): Parameters<typeof buildRouteAudit>[2] {
  const tag = (p: string, d: Record<string, string>): Record<string, string> =>
    Object.fromEntries(Object.entries(d).map(([k, v]) => [`${p}:${k}`, v]));
  const a = auditCopyDict(tag('en', en));
  const b = auditCopyDict(tag('fr', fr));
  return { i18n: auditI18n(en, fr), copy: { checked: a.checked + b.checked, entries: [...a.entries, ...b.entries] } };
}
