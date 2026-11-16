import { applyWaivers, describeDiff, describeWaived, diffAgainstBaseline, makeBaseline, parseBaseline, parseWaivers, renderJunit, renderSarif } from './ci.js';
import { applyBudget, describeBudget, parseBudget, ratchet, type Budget } from './budget.js';
import { auditCopy, auditCopyDict } from './copylint.js';
import { appendRun, DEFAULT_HISTORY_MAX, describeTrend, EMPTY_HISTORY, parseHistory, trend } from './history.js';
import { scanHosts } from './hostlint.js';
import { htmlTextItems, lintHtml } from './htmllint.js';
import { auditI18n, flattenDict } from './i18n.js';
import type { OfflineContext } from './offline.js';
import { PROFILES, selectProfiles, type Profile } from './profiles.js';
import { lintManifest } from './manifestlint.js';
import { auditProvenance } from './provenance.js';
import { buildRouteAudit, makeReport, renderHtml, renderJson, renderText, totals, type AuditReport, type RouteAudit } from './report.js';
import { runAudit, type FullPage } from './run.js';
import { describeSkipped, parseCheckIds, selectChecks } from './select.js';
import { lintServiceWorker } from './swlint.js';
import type { CheckId, Lang } from './types.js';

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
  /** Extra files to write into --out: sarif and junit. */
  readonly formats: readonly string[];
  readonly baselineFile: string | null;
  readonly writeBaselineFile: string | null;
  readonly waiversFile: string | null;
  readonly manifestFiles: readonly string[];
  readonly swFiles: readonly string[];
  readonly scanFiles: readonly string[];
  readonly allowHosts: readonly string[];
  readonly budgetFile: string | null;
  readonly writeBudgetFile: string | null;
  readonly historyFile: string | null;
  readonly historyMax: number | null;
  readonly maxWeightKb: number | null;
  /** Run only these checks. Empty means all. */
  readonly only: readonly CheckId[];
  /** Switch these checks off. */
  readonly skip: readonly CheckId[];
}

export const OUTPUT_FORMATS: readonly string[] = ['sarif', 'junit'];

export type ParsedArgs =
  | { readonly ok: true; readonly args: CliArgs }
  | { readonly ok: false; readonly error: { readonly en: string; readonly fr: string } };

export const HELP_TEXT =
  'Usage: narrow-audit [--base-url URL --route /path ...] [--lang en|fr] [--out DIR]\n' +
  '                    [--profiles all|narrow,dark,...] [--offline] [--keyboard-max N]\n' +
  '                    [--en en.json --fr fr.json] [--html FILE ...] [--data FILE]\n' +
  '                    [--allow-licence ID ...] [--require-fact KEY ...] [--strict-unknown]\n' +
  '                    [--format sarif,junit] [--baseline FILE] [--write-baseline FILE] [--waivers FILE]\n' +
  '                    [--manifest FILE ...] [--sw FILE ...] [--scan FILE ...] [--allow-host PATTERN ...]\n' +
  '                    [--budget FILE] [--write-budget FILE] [--history FILE] [--history-max N]\n' +
  '                    [--max-weight-kb N] [--only CHECK,...] [--skip CHECK,...]\n' +
  `Profiles: ${PROFILES.map((p) => p.id).join(', ')}. A browser is only needed when routes are given.\n` +
  'Exit code 0 when no check failed, 1 when a check failed, 2 on a usage or run error.\n' +
  '\n' +
  'Utilisation\u00A0: narrow-audit [--base-url URL --route /chemin ...] [--lang en|fr] [--out DOSSIER]\n' +
  '                    [--profiles all|narrow,dark,...] [--offline] [--keyboard-max N]\n' +
  '                    [--en en.json --fr fr.json] [--html FICHIER ...] [--data FICHIER]\n' +
  '                    [--allow-licence ID ...] [--require-fact CLÉ ...] [--strict-unknown]\n' +
  '                    [--format sarif,junit] [--baseline FICHIER] [--write-baseline FICHIER] [--waivers FICHIER]\n' +
  '                    [--manifest FICHIER ...] [--sw FICHIER ...] [--scan FICHIER ...] [--allow-host MOTIF ...]\n' +
  '                    [--budget FICHIER] [--write-budget FICHIER] [--history FICHIER] [--history-max N]\n' +
  '                    [--max-weight-kb N] [--only CONTRÔLE,...] [--skip CONTRÔLE,...]\n' +
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
  let formats: string[] = [];
  let baselineFile: string | null = null;
  let writeBaselineFile: string | null = null;
  let waiversFile: string | null = null;
  const manifestFiles: string[] = [];
  const swFiles: string[] = [];
  const scanFiles: string[] = [];
  const allowHosts: string[] = [];
  let budgetFile: string | null = null;
  let writeBudgetFile: string | null = null;
  let historyFile: string | null = null;
  let historyMax: number | null = null;
  let maxWeightKb: number | null = null;
  const only: CheckId[] = [];
  const skip: CheckId[] = [];
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
      case '--baseline':
        got = need(a, next(), 'a file', 'un fichier');
        if (typeof got !== 'string') return got;
        baselineFile = got;
        break;
      case '--write-baseline':
        got = need(a, next(), 'a file', 'un fichier');
        if (typeof got !== 'string') return got;
        writeBaselineFile = got;
        break;
      case '--manifest':
      case '--sw':
      case '--scan':
      case '--allow-host':
        got = need(a, next(), a === '--allow-host' ? 'a host pattern' : 'a file', a === '--allow-host' ? 'un motif d’hôte' : 'un fichier');
        if (typeof got !== 'string') return got;
        (a === '--manifest' ? manifestFiles : a === '--sw' ? swFiles : a === '--scan' ? scanFiles : allowHosts).push(got);
        break;
      case '--budget':
      case '--write-budget':
      case '--history':
        got = need(a, next(), 'a file', 'un fichier');
        if (typeof got !== 'string') return got;
        if (a === '--budget') budgetFile = got;
        else if (a === '--write-budget') writeBudgetFile = got;
        else historyFile = got;
        break;
      case '--only':
      case '--skip': {
        const list = need(a, next(), 'a list of check names', 'une liste de noms de contrôles');
        if (typeof list !== 'string') return list;
        const parsedIds = parseCheckIds(list);
        if (!parsedIds.ok) return { ok: false, error: parsedIds.error };
        for (const id of parsedIds.ids) if (!(a === '--only' ? only : skip).includes(id)) (a === '--only' ? only : skip).push(id);
        break;
      }
      case '--max-weight-kb': {
        const n = Number.parseInt(next() ?? '', 10);
        if (!Number.isInteger(n) || n < 1 || n > 1000000) return fail('--max-weight-kb must be a whole number of kilobytes, 1 or more.', '--max-weight-kb doit être un nombre entier de kilooctets, 1 ou plus.');
        maxWeightKb = n;
        break;
      }
      case '--history-max': {
        const n = Number.parseInt(next() ?? '', 10);
        if (!Number.isInteger(n) || n < 1 || n > 10000) return fail('--history-max must be a whole number from 1 to 10000.', '--history-max doit être un entier de 1 à 10000.');
        historyMax = n;
        break;
      }
      case '--waivers':
        got = need(a, next(), 'a file', 'un fichier');
        if (typeof got !== 'string') return got;
        waiversFile = got;
        break;
      case '--format': {
        const list = (next() ?? '').split(',').map((x) => x.trim()).filter(Boolean);
        if (list.length === 0 || list.some((x) => !OUTPUT_FORMATS.includes(x))) {
          return fail(`--format must be a list of: ${OUTPUT_FORMATS.join(', ')}.`, `--format doit être une liste parmi\u00A0: ${OUTPUT_FORMATS.join(', ')}.`);
        }
        formats = [...new Set(list)];
        break;
      }
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
    if (offlineOnly && htmlFiles.length === 0 && dataFile === null && enFile === null && manifestFiles.length === 0 && swFiles.length === 0 && scanFiles.length === 0) {
      return fail('Nothing to audit. Give --route, --html, --data, --manifest, --sw, --scan or --en and --fr.', 'Rien à auditer. Indiquez --route, --html, --data, --manifest, --sw, --scan ou --en et --fr.');
    }
    if (formats.length > 0 && outDir === null) return fail('--format needs --out.', '--format demande --out.');
    if ((enFile === null) !== (frFile === null)) return fail('Give both --en and --fr, or neither.', 'Indiquez --en et --fr ensemble, ou aucun des deux.');
  }
  return {
    ok: true,
    args: { baseUrl, routes, lang, outDir, enFile, frFile, offline, strictUnknown, help, profiles, htmlFiles, dataFile, allowLicences, requireFacts, keyboardMax, formats, baselineFile, writeBaselineFile, waiversFile, manifestFiles, swFiles, scanFiles, allowHosts, budgetFile, writeBudgetFile, historyFile, historyMax, maxWeightKb, only, skip },
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
    const hostOpts = args.allowHosts.length > 0 ? { allow: args.allowHosts } : {};
    for (const file of args.manifestFiles) {
      const text = await deps.readText(file);
      extra.push(buildRouteAudit(`manifest:${file}`, null, { manifest: lintManifest(text), external: scanHosts(file, text, hostOpts) }));
    }
    for (const file of args.swFiles) {
      const text = await deps.readText(file);
      extra.push(buildRouteAudit(`sw:${file}`, null, { 'service-worker': lintServiceWorker(file, text), external: scanHosts(file, text, hostOpts) }));
    }
    for (const file of args.scanFiles) extra.push(buildRouteAudit(`scan:${file}`, null, { external: scanHosts(file, await deps.readText(file), hostOpts) }));
    for (const file of args.htmlFiles) {
      const html = await deps.readText(file);
      extra.push(
        buildRouteAudit(`html:${file}`, null, {
          'static-html': lintHtml(html),
          copy: auditCopy(htmlTextItems(html)),
          external: scanHosts(file, html, hostOpts),
        }),
      );
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
        ...(args.allowHosts.length > 0 ? { allowHosts: args.allowHosts } : {}),
        ...(args.keyboardMax !== null || args.maxWeightKb !== null
          ? { options: { ...(args.keyboardMax !== null ? { keyboardMax: args.keyboardMax } : {}), ...(args.maxWeightKb !== null ? { weight: { maxKb: args.maxWeightKb } } : {}) } }
          : {}),
        ...(i18n ? { i18n } : {}),
        extra,
        now: deps.now(),
      });
    } else {
      const strings = i18n ? [buildRouteAudit('strings', null, stringChecks(i18n.en, i18n.fr))] : [];
      report = makeReport([...strings, ...extra], deps.now());
    }
    if (args.only.length > 0 || args.skip.length > 0) report = selectChecks(report, { only: args.only, skip: args.skip });
    let waivedText = '';
    if (args.waiversFile !== null) {
      const parsedWaivers = parseWaivers(await deps.readText(args.waiversFile));
      const applied = applyWaivers(report, parsedWaivers.waivers, deps.now(), parsedWaivers.problems);
      report = applied.waived.length > 0 ? { ...applied.report, waived: applied.waived } : applied.report;
      waivedText = describeWaived(applied.waived, args.lang);
    }
    let budget: Budget | null = null;
    if (args.budgetFile !== null) {
      const parsedBudget = parseBudget(await deps.readText(args.budgetFile));
      if (!parsedBudget.ok) {
        deps.log(`${parsedBudget.error.en} / ${parsedBudget.error.fr}`);
        return 2;
      }
      budget = parsedBudget.value;
    }
    const beforeBudget = report;
    if (budget) report = applyBudget(report, budget);
    deps.log(renderText(report, args.lang));
    if (waivedText) deps.log(waivedText);
    if (report.skipped) deps.log(describeSkipped(report.skipped, args.lang));
    if (budget) deps.log(describeBudget(beforeBudget, budget, args.lang));
    if (args.writeBudgetFile !== null) await deps.writeText(args.writeBudgetFile, JSON.stringify(ratchet(beforeBudget, budget), null, 2) + '\n');
    if (args.historyFile !== null) {
      const existing = await readOptional(deps, args.historyFile);
      let history = EMPTY_HISTORY;
      if (existing !== null) {
        const parsedHistory = parseHistory(existing);
        if (!parsedHistory.ok) {
          deps.log(`${parsedHistory.error.en} / ${parsedHistory.error.fr}`);
          return 2;
        }
        history = parsedHistory.value;
      }
      history = appendRun(history, report, args.historyMax ?? DEFAULT_HISTORY_MAX);
      await deps.writeText(args.historyFile, JSON.stringify(history, null, 2) + '\n');
      deps.log(describeTrend(trend(history), args.lang));
    }
    if (args.outDir !== null) {
      const dir = args.outDir.replace(/\/+$/, '');
      await deps.writeText(`${dir}/narrow-audit.json`, renderJson(report));
      await deps.writeText(`${dir}/narrow-audit.${args.lang}.html`, renderHtml(report, args.lang));
      if (args.formats.includes('sarif')) await deps.writeText(`${dir}/narrow-audit.sarif`, renderSarif(report));
      if (args.formats.includes('junit')) await deps.writeText(`${dir}/narrow-audit.junit.xml`, renderJunit(report, args.lang));
    }
    if (args.writeBaselineFile !== null) await deps.writeText(args.writeBaselineFile, JSON.stringify(makeBaseline(report), null, 2) + '\n');
    if (args.baselineFile !== null) {
      const base = parseBaseline(await deps.readText(args.baselineFile));
      if (!base.ok) {
        deps.log(`${base.error.en} / ${base.error.fr}`);
        return 2;
      }
      const diff = diffAgainstBaseline(report, base.value);
      deps.log(describeDiff(diff, args.lang));
      for (const item of diff.added) deps.log(`  + ${item.route} ${item.entry.check}${item.entry.rule ? '/' + item.entry.rule : ''} ${item.entry.id}`);
      const unknownFails = args.strictUnknown && totals(report.routes).unknown > 0;
      return diff.added.length > 0 || unknownFails ? 1 : 0;
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

/** Reads a file that may not exist yet. Only a missing file gives null. Other errors are raised. */
async function readOptional(deps: CliDeps, path: string): Promise<string | null> {
  try {
    return await deps.readText(path);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/ENOENT|no such file/i.test(msg)) return null;
    throw err;
  }
}

function stringChecks(en: Record<string, string>, fr: Record<string, string>): Parameters<typeof buildRouteAudit>[2] {
  const tag = (p: string, d: Record<string, string>): Record<string, string> =>
    Object.fromEntries(Object.entries(d).map(([k, v]) => [`${p}:${k}`, v]));
  const a = auditCopyDict(tag('en', en));
  const b = auditCopyDict(tag('fr', fr));
  return { i18n: auditI18n(en, fr), copy: { checked: a.checked + b.checked, entries: [...a.entries, ...b.entries] } };
}
