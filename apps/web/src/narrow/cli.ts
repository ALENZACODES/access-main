import { flattenDict } from './i18n.js';
import { renderHtml, renderJson, renderText, totals, type AuditReport } from './report.js';
import { runAudit, type AuditPage } from './run.js';
import type { OfflineContext } from './offline.js';
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
}

export type ParsedArgs =
  | { readonly ok: true; readonly args: CliArgs }
  | { readonly ok: false; readonly error: { readonly en: string; readonly fr: string } };

export const HELP_TEXT =
  'Usage: narrow-audit --base-url URL --route /path [--route /other] [--lang en|fr] [--out DIR]\n' +
  '                    [--en en.json --fr fr.json] [--offline] [--strict-unknown]\n' +
  'Exit code 0 when no check failed, 1 when a check failed, 2 on a usage or run error.\n' +
  '\n' +
  'Utilisation\u00A0: narrow-audit --base-url URL --route /chemin [--route /autre] [--lang en|fr] [--out DOSSIER]\n' +
  '                    [--en en.json --fr fr.json] [--offline] [--strict-unknown]\n' +
  'Code de sortie 0 sans anomalie, 1 si un contrôle échoue, 2 en cas d’erreur d’utilisation ou d’exécution.\n';

export function parseArgs(argv: readonly string[]): ParsedArgs {
  let baseUrl = '';
  const routes: string[] = [];
  let lang: Lang = 'en';
  let outDir: string | null = null;
  let enFile: string | null = null;
  let frFile: string | null = null;
  let offline = false;
  let strictUnknown = false;
  let help = false;
  const fail = (en: string, fr: string): ParsedArgs => ({ ok: false, error: { en, fr } });
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? '';
    const next = (): string | undefined => argv[++i];
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
      case '--base-url': {
        const v = next();
        if (!v) return fail('--base-url needs a value.', '--base-url demande une valeur.');
        baseUrl = v;
        break;
      }
      case '--route': {
        const v = next();
        if (!v) return fail('--route needs a value.', '--route demande une valeur.');
        routes.push(v);
        break;
      }
      case '--lang': {
        const v = next();
        if (v !== 'en' && v !== 'fr') return fail('--lang must be en or fr.', '--lang doit valoir en ou fr.');
        lang = v;
        break;
      }
      case '--out': {
        const v = next();
        if (!v) return fail('--out needs a folder.', '--out demande un dossier.');
        outDir = v;
        break;
      }
      case '--en': {
        const v = next();
        if (!v) return fail('--en needs a file.', '--en demande un fichier.');
        enFile = v;
        break;
      }
      case '--fr': {
        const v = next();
        if (!v) return fail('--fr needs a file.', '--fr demande un fichier.');
        frFile = v;
        break;
      }
      default:
        return fail(`Unknown option ${a}.`, `Option inconnue ${a}.`);
    }
  }
  if (!help) {
    if (!baseUrl) return fail('--base-url is required.', '--base-url est obligatoire.');
    if (routes.length === 0) return fail('Give at least one --route.', 'Indiquez au moins un --route.');
    if ((enFile === null) !== (frFile === null)) return fail('Give both --en and --fr, or neither.', 'Indiquez --en et --fr ensemble, ou aucun des deux.');
  }
  return { ok: true, args: { baseUrl, routes, lang, outDir, enFile, frFile, offline, strictUnknown, help } };
}

export interface BrowserHandle {
  readonly page: AuditPage;
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
    browser = await deps.launch();
    const report = await runAudit({
      page: browser.page,
      ...(args.offline ? { context: browser.context } : {}),
      baseUrl: args.baseUrl,
      routes: args.routes,
      ...(i18n ? { i18n } : {}),
      now: deps.now(),
    });
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
