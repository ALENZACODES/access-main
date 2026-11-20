import { coverageForReport } from './coverage.js';
import { parseLedger, type Ledger } from './ledger.js';
import { applyManualLog, describeManualLog, parseManualLog, type ManualRow } from './manual-log.js';
import { parseOwners, type Owners } from './owners.js';
import { describePolicy, evaluatePolicy, parsePolicy, policyMet, type Policy } from './policy.js';
import { describePriorities, prioritise, renderPrioritiesMarkdown } from './priority.js';
import { totals } from './report.js';
import { parseReport } from './reportio.js';
import { draftManualTickets, draftTickets, renderTicketFile, renderTicketIndex, ticketFileName } from './tickets.js';
import type { Lang } from './types.js';

/**
 * `narrow-audit triage REPORT.json`: works on a report that was already
 * written. It audits nothing and opens no browser. It prints where to start,
 * can compare the report with a policy, and can write ticket drafts.
 *
 * Exit code 0 when the triage ran and any policy given is kept, 1 when a
 * policy is not kept, 2 on a usage or read error. Without a policy the exit
 * code says nothing about the findings: the audit run already gave that.
 */

export interface TriageArgs {
  readonly reportFile: string;
  readonly ledgerFile: string | null;
  readonly ownersFile: string | null;
  readonly policyFile: string | null;
  /** The log of by-hand looks. Problems in it get a ticket draft too. */
  readonly manualLogFile: string | null;
  /** Folder to write ticket drafts into. */
  readonly ticketsDir: string | null;
  /** `fail` drafts tickets for failures only. */
  readonly ticketsFor: 'fail' | 'all';
  /** File to write the full order to, as Markdown. */
  readonly outFile: string | null;
  readonly max: number | null;
  readonly lang: Lang;
  readonly help: boolean;
}

type Text = { readonly en: string; readonly fr: string };
export type ParsedTriageArgs = { readonly ok: true; readonly args: TriageArgs } | { readonly ok: false; readonly error: Text };

export const TRIAGE_HELP_TEXT =
  'Usage: narrow-audit triage REPORT.json [--ledger FILE] [--owners FILE] [--policy FILE] [--manual-log FILE]\n' +
  '                           [--tickets DIR] [--tickets-for fail|all] [--out FILE.md] [--max N] [--lang en|fr]\n' +
  'Reads a report that was already written. Prints where to start, compares the report with a policy,\n' +
  'and writes ticket drafts as Markdown files. It audits nothing and sends nothing anywhere.\n' +
  'Exit code 0 when any policy given is kept, 1 when it is not, 2 on a usage or read error.\n' +
  '\n' +
  'Utilisation\u00A0: narrow-audit triage RAPPORT.json [--ledger FICHIER] [--owners FICHIER] [--policy FICHIER] [--manual-log FICHIER]\n' +
  '                           [--tickets DOSSIER] [--tickets-for fail|all] [--out FICHIER.md] [--max N] [--lang en|fr]\n' +
  'Lit un rapport déjà écrit. Affiche par où commencer, compare le rapport à une politique\n' +
  'et écrit des brouillons de tickets en Markdown. N’audite rien et n’envoie rien nulle part.\n' +
  'Code de sortie 0 quand la politique indiquée est tenue, 1 sinon, 2 en cas d’erreur d’utilisation ou de lecture.\n';

const VALUE_FLAGS: readonly string[] = ['--ledger', '--owners', '--policy', '--manual-log', '--tickets', '--tickets-for', '--out', '--max', '--lang'];

export function parseTriageArgs(argv: readonly string[]): ParsedTriageArgs {
  const fail = (en: string, fr: string): ParsedTriageArgs => ({ ok: false, error: { en, fr } });
  let reportFile = '';
  let ledgerFile: string | null = null;
  let ownersFile: string | null = null;
  let policyFile: string | null = null;
  let manualLogFile: string | null = null;
  let ticketsDir: string | null = null;
  let ticketsFor: 'fail' | 'all' = 'all';
  let outFile: string | null = null;
  let max: number | null = null;
  let lang: Lang = 'en';
  let help = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? '';
    if (a === '--help') {
      help = true;
      continue;
    }
    if (!a.startsWith('--')) {
      if (reportFile !== '') return fail(`Give one report file. Found a second one: ${a}`, `Indiquez un seul fichier de rapport. Un deuxième a été trouvé\u00A0: ${a}`);
      reportFile = a;
      continue;
    }
    if (!VALUE_FLAGS.includes(a)) return fail(`Unknown option ${a}.`, `Option non reconnue ${a}.`);
    const v = argv[++i];
    if (!v || v.startsWith('--')) return fail(`${a} needs a value.`, `${a} demande une valeur.`);
    switch (a) {
      case '--ledger':
        ledgerFile = v;
        break;
      case '--owners':
        ownersFile = v;
        break;
      case '--policy':
        policyFile = v;
        break;
      case '--manual-log':
        manualLogFile = v;
        break;
      case '--tickets':
        ticketsDir = v;
        break;
      case '--tickets-for':
        if (v !== 'fail' && v !== 'all') return fail('--tickets-for must be fail or all.', '--tickets-for doit valoir fail ou all.');
        ticketsFor = v;
        break;
      case '--out':
        outFile = v;
        break;
      case '--max': {
        const n = Number(v);
        if (!Number.isInteger(n) || n < 1) return fail('--max needs a whole number, 1 or more.', '--max demande un nombre entier, 1 ou plus.');
        max = n;
        break;
      }
      default:
        if (v !== 'en' && v !== 'fr') return fail('--lang must be en or fr.', '--lang doit être en ou fr.');
        lang = v;
    }
  }
  if (!help && reportFile === '') return fail('Give the report to read, such as audit/narrow-audit.json.', 'Indiquez le rapport à lire, par exemple audit/narrow-audit.json.');
  return { ok: true, args: { reportFile, ledgerFile, ownersFile, policyFile, manualLogFile, ticketsDir, ticketsFor, outFile, max, lang, help } };
}

export interface TriageDeps {
  readText(path: string): Promise<string>;
  writeText(path: string, text: string): Promise<void>;
  log(line: string): void;
  now(): Date;
}

export async function runTriage(argv: readonly string[], deps: TriageDeps): Promise<number> {
  const parsed = parseTriageArgs(argv);
  if (!parsed.ok) {
    deps.log(`${parsed.error.en} / ${parsed.error.fr}`);
    deps.log(TRIAGE_HELP_TEXT);
    return 2;
  }
  const { args } = parsed;
  if (args.help) {
    deps.log(TRIAGE_HELP_TEXT);
    return 0;
  }
  const fr = args.lang === 'fr';
  const stop = (file: string, error: Text): number => {
    deps.log(`${file}: ${error.en} / ${file}\u00A0: ${error.fr}`);
    return 2;
  };
  try {
    const report = parseReport(await deps.readText(args.reportFile));
    if (!report.ok) return stop(args.reportFile, report.error);

    let ledger: Ledger | undefined;
    if (args.ledgerFile !== null) {
      const p = parseLedger(await deps.readText(args.ledgerFile));
      if (!p.ok) return stop(args.ledgerFile, p.error);
      ledger = p.value;
    }
    let owners: Owners | undefined;
    if (args.ownersFile !== null) {
      const p = parseOwners(await deps.readText(args.ownersFile));
      if (!p.ok) return stop(args.ownersFile, p.error);
      owners = p.value;
    }
    let policy: Policy | undefined;
    if (args.policyFile !== null) {
      const p = parsePolicy(await deps.readText(args.policyFile));
      if (!p.ok) return stop(args.policyFile, p.error);
      policy = p.value;
    }

    const now = deps.now();
    let looks: ManualRow[] | undefined;
    if (args.manualLogFile !== null) {
      const p = parseManualLog(await deps.readText(args.manualLogFile), now);
      if (!p.ok) return stop(args.manualLogFile, p.error);
      looks = applyManualLog(coverageForReport(report.value), p.value, now);
    }
    const t = totals(report.value.routes);
    deps.log(
      fr
        ? `Rapport du ${report.value.generatedAt}\u00A0: ${t.failed} à corriger, ${t.unknown} UNKNOWN, ${report.value.routes.length} routes.`
        : `Report of ${report.value.generatedAt}: ${t.failed} to fix, ${t.unknown} UNKNOWN, ${report.value.routes.length} routes.`,
    );
    const items = prioritise(report.value, { now, ...(ledger ? { ledger } : {}), ...(owners ? { owners } : {}) });
    deps.log(describePriorities(items, args.lang, args.max ?? 10).trimEnd());
    if (args.outFile !== null) await deps.writeText(args.outFile, renderPrioritiesMarkdown(items, args.lang));
    if (looks) deps.log(describeManualLog(looks, args.lang).trimEnd());

    if (args.ticketsDir !== null) {
      const dir = args.ticketsDir.replace(/\/+$/, '');
      const candidates = args.ticketsFor === 'fail' ? items.filter((i) => i.cluster.entry.status === 'fail') : items;
      // Problems seen by hand come first: the audit cannot count them, so nothing else will bring them up.
      const tickets = [...(looks ? draftManualTickets(looks, args.lang) : []), ...draftTickets(items, args.lang, { only: args.ticketsFor, ...(args.max !== null ? { max: args.max } : {}) })];
      for (let i = 0; i < tickets.length; i++) {
        const ticket = tickets[i];
        if (ticket) await deps.writeText(`${dir}/${ticketFileName(ticket, i)}`, renderTicketFile(ticket, args.lang));
      }
      await deps.writeText(`${dir}/README.md`, renderTicketIndex(tickets, args.lang, Math.max(0, candidates.length - tickets.filter((x) => !x.key.startsWith('by-hand|')).length)));
      deps.log(
        fr
          ? `${tickets.length} brouillon(s) de ticket écrit(s) dans ${dir}. Rien n’a été envoyé à un outil de suivi.`
          : `${tickets.length} ticket draft(s) written to ${dir}. Nothing was sent to a tracker.`,
      );
    }

    if (policy) {
      const results = evaluatePolicy(report.value, policy, { now, ...(ledger ? { ledger } : {}) });
      deps.log(describePolicy(results, args.lang).trimEnd());
      return policyMet(results) ? 0 : 1;
    }
    return 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    deps.log(`Triage failed / Échec du tri${fr ? '\u00A0' : ''}: ${msg}`);
    return 2;
  }
}
