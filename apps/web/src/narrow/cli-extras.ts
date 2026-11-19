import { renderAnnotations } from './annotations.js';
import { describeShared } from './cluster.js';
import { describeFiltered, filterReport, isEmptyFilter, parseFilter, type Filter } from './filter.js';
import { renderNextSteps } from './guidance.js';
import { describeAges, EMPTY_LEDGER, parseLedger, updateLedger } from './ledger.js';
import { describeClashes, mergeReports } from './merge.js';
import { describeByOwner, parseOwners, unusedOwnerLines } from './owners.js';
import { countRedactions, describeRedaction, redactReport } from './redact.js';
import type { AuditReport } from './report.js';
import { parseReport } from './reportio.js';
import { applyReview, describeReview, parseReview, worksheet } from './review.js';
import type { Lang } from './types.js';

/**
 * Options of the command line that work on the finished report: joining
 * earlier reports, the ledger of open failures, owners, notes from people who
 * looked, repeated findings, next steps, workflow annotations, a filter and
 * redaction. They live here so `cli.ts` only has to call three functions.
 *
 * None of them changes the exit code. A filter and redaction change what is
 * printed and written for people; the files that keep state between runs
 * (ledger, history, baseline, budget) always get the full report.
 */

export interface ExtraArgs {
  /** Earlier narrow-audit.json files to join with this run. */
  readonly mergeFiles: readonly string[];
  readonly ledgerFile: string | null;
  readonly ownersFile: string | null;
  readonly reviewFile: string | null;
  /** Filter text, as given. */
  readonly filterText: string | null;
  readonly redact: boolean;
  readonly annotations: boolean;
  readonly nextSteps: boolean;
  readonly shared: boolean;
}

export const NO_EXTRAS: ExtraArgs = {
  mergeFiles: [],
  ledgerFile: null,
  ownersFile: null,
  reviewFile: null,
  filterText: null,
  redact: false,
  annotations: false,
  nextSteps: false,
  shared: false,
};

type Text = { readonly en: string; readonly fr: string };

const VALUE_FLAGS: Readonly<Record<string, { readonly what: string; readonly quoi: string }>> = {
  '--merge': { what: 'a report file', quoi: 'un fichier de rapport' },
  '--ledger': { what: 'a file', quoi: 'un fichier' },
  '--owners': { what: 'a file', quoi: 'un fichier' },
  '--review': { what: 'a file', quoi: 'un fichier' },
  '--filter': { what: 'a filter such as "status:fail route:/help*"', quoi: 'un filtre tel que "status:fail route:/help*"' },
};
const SWITCHES: readonly string[] = ['--redact', '--annotations', '--next-steps', '--shared'];

export const EXTRA_FLAGS: readonly string[] = [...Object.keys(VALUE_FLAGS), ...SWITCHES];

export type ExtraParse =
  | { readonly kind: 'other' }
  | { readonly kind: 'ok'; readonly extras: ExtraArgs; readonly usedValue: boolean }
  | { readonly kind: 'error'; readonly error: Text };

/** Reads one option. `value` is the next argument, if any. `other` means the option is not one of these. */
export function parseExtraFlag(flag: string, value: string | undefined, extras: ExtraArgs): ExtraParse {
  if (SWITCHES.includes(flag)) {
    const next: ExtraArgs =
      flag === '--redact' ? { ...extras, redact: true } : flag === '--annotations' ? { ...extras, annotations: true } : flag === '--next-steps' ? { ...extras, nextSteps: true } : { ...extras, shared: true };
    return { kind: 'ok', extras: next, usedValue: false };
  }
  const spec = VALUE_FLAGS[flag];
  if (!spec) return { kind: 'other' };
  if (!value) return { kind: 'error', error: { en: `${flag} needs ${spec.what}.`, fr: `${flag} demande ${spec.quoi}.` } };
  if (flag === '--filter') {
    const parsed = parseFilter(value);
    if (!parsed.ok) return { kind: 'error', error: parsed.error };
    return { kind: 'ok', extras: { ...extras, filterText: value }, usedValue: true };
  }
  const next: ExtraArgs =
    flag === '--merge'
      ? { ...extras, mergeFiles: extras.mergeFiles.includes(value) ? extras.mergeFiles : [...extras.mergeFiles, value] }
      : flag === '--ledger'
        ? { ...extras, ledgerFile: value }
        : flag === '--owners'
          ? { ...extras, ownersFile: value }
          : { ...extras, reviewFile: value };
  return { kind: 'ok', extras: next, usedValue: true };
}

export const EXTRA_HELP_EN =
  '                    [--merge REPORT.json ...] [--ledger FILE] [--owners FILE] [--review FILE]\n' +
  '                    [--filter "status:fail route:/help*"] [--redact] [--shared] [--next-steps] [--annotations]\n';

export const EXTRA_HELP_FR =
  '                    [--merge RAPPORT.json ...] [--ledger FICHIER] [--owners FICHIER] [--review FICHIER]\n' +
  '                    [--filter "status:fail route:/help*"] [--redact] [--shared] [--next-steps] [--annotations]\n';

/** The part of the command line's outside world these options need. */
export interface ExtraDeps {
  readText(path: string): Promise<string>;
  writeText(path: string, text: string): Promise<void>;
  log(line: string): void;
  now(): Date;
}

export type Step<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: Text };

/** Joins the earlier reports named by `--merge` with this run. A newer result replaces an older one for the same route and check, and each replacement is logged. */
export async function mergeEarlier(report: AuditReport, extras: ExtraArgs, deps: ExtraDeps, lang: Lang): Promise<Step<AuditReport>> {
  if (extras.mergeFiles.length === 0) return { ok: true, value: report };
  const earlier: AuditReport[] = [];
  for (const file of extras.mergeFiles) {
    const parsed = parseReport(await deps.readText(file));
    if (!parsed.ok) return { ok: false, error: { en: `${file}: ${parsed.error.en}`, fr: `${file}\u00A0: ${parsed.error.fr}` } };
    earlier.push(parsed.value);
  }
  const merged = mergeReports([...earlier, report], deps.now());
  for (const line of describeClashes(merged.clashes)) deps.log(line[lang]);
  return { ok: true, value: merged.report };
}

/** The report as people will read it: filtered, then redacted. With neither option it is the report itself. */
export function shownReport(report: AuditReport, extras: ExtraArgs): AuditReport {
  let shown = report;
  const filter = filterOf(extras);
  if (filter) shown = filterReport(shown, filter);
  if (extras.redact) shown = redactReport(shown);
  return shown;
}

/** The report to write as narrow-audit.json: never filtered, so it can be compared and merged later, and redacted when asked. */
export function storedReport(report: AuditReport, extras: ExtraArgs): AuditReport {
  return extras.redact ? redactReport(report) : report;
}

function filterOf(extras: ExtraArgs): Filter | null {
  if (extras.filterText === null) return null;
  const parsed = parseFilter(extras.filterText);
  return parsed.ok && !isEmptyFilter(parsed.value) ? parsed.value : null;
}

/** Reads a file that may not exist yet. Only a missing file gives null. */
async function readOptional(deps: ExtraDeps, path: string): Promise<string | null> {
  try {
    return await deps.readText(path);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/ENOENT|no such file/i.test(msg)) return null;
    throw err;
  }
}

/**
 * Runs the options that add to the output of a finished run. `report` is the
 * full report. Gives the reason, in both languages, when a file given could
 * not be read as what it should be.
 */
export async function runExtras(report: AuditReport, extras: ExtraArgs, deps: ExtraDeps, lang: Lang, outDir: string | null): Promise<Step<null>> {
  const dir = outDir === null ? null : outDir.replace(/\/+$/, '');
  const filter = filterOf(extras);
  if (filter) deps.log(describeFiltered(report, filter)[lang]);
  if (extras.redact) deps.log(describeRedaction(countRedactions(report))[lang]);

  if (extras.ledgerFile !== null) {
    const existing = await readOptional(deps, extras.ledgerFile);
    let ledger = EMPTY_LEDGER;
    if (existing !== null) {
      const parsed = parseLedger(existing);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      ledger = parsed.value;
    }
    ledger = updateLedger(ledger, report);
    await deps.writeText(extras.ledgerFile, JSON.stringify(ledger, null, 2) + '\n');
    deps.log(describeAges(ledger, deps.now(), lang).trimEnd());
  }

  if (extras.ownersFile !== null) {
    const parsed = parseOwners(await deps.readText(extras.ownersFile));
    if (!parsed.ok) return { ok: false, error: parsed.error };
    deps.log(describeByOwner(report, parsed.value, lang).trimEnd());
    const unused = unusedOwnerLines(report, parsed.value);
    if (unused.length > 0) {
      deps.log(
        lang === 'fr'
          ? `${unused.length} ligne(s) du fichier des responsables ne correspondent à aucune anomalie de ce rapport\u00A0: ligne(s) ${unused.map((u) => u.line).join(', ')}.`
          : `${unused.length} line(s) of the owners file match no finding of this report: line(s) ${unused.map((u) => u.line).join(', ')}.`,
      );
    }
  }

  if (extras.reviewFile !== null) {
    const parsed = parseReview(await deps.readText(extras.reviewFile));
    if (!parsed.ok) return { ok: false, error: parsed.error };
    deps.log(describeReview(applyReview(report, parsed.value, deps.now()), lang).trimEnd());
    if (dir !== null) await deps.writeText(`${dir}/narrow-audit.review.${lang}.txt`, worksheet(storedReport(report, extras), parsed.value, deps.now(), lang));
  }

  const shown = shownReport(report, extras);
  if (extras.shared) deps.log(describeShared(shown, lang).trimEnd());
  if (extras.nextSteps) {
    const steps = renderNextSteps(shown, lang);
    if (steps !== '') deps.log(steps.trimEnd());
  }
  if (extras.annotations) {
    const lines = renderAnnotations(shown, lang);
    if (lines !== '') deps.log(lines.trimEnd());
  }
  return { ok: true, value: null };
}
