import { ruleIdOf } from './ci.js';
import type { AuditReport } from './report.js';
import type { Entry, Lang } from './types.js';

/**
 * Findings as workflow commands, the lines a CI job prints so that the host
 * shows them next to the code: `::error file=…,line=…,title=…::message`. A
 * failure becomes an error. An UNKNOWN becomes a notice and never a warning
 * or an error, because nothing was measured. Only a finding from an HTML file
 * has a file and a line; a finding from a live route carries the route in its
 * title. Hosts show a limited number of annotations per step, so the list is
 * cut, failures first, and a last line says how many were left out.
 */

export const DEFAULT_MAX_ANNOTATIONS = 10;

export interface Annotation {
  readonly level: 'error' | 'notice';
  readonly title: string;
  readonly message: string;
  readonly file?: string;
  readonly line?: number;
}

/** Escapes the message part of a workflow command. */
export function escapeData(text: string): string {
  return text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

/** Escapes a property value of a workflow command, where a colon and a comma also have a meaning. */
export function escapeProperty(text: string): string {
  return escapeData(text).replace(/:/g, '%3A').replace(/,/g, '%2C');
}

/** The file and line a finding points at, for a route made from an HTML file (`html:path`) and an element id that ends in `@L12`. */
export function sourceOf(route: string, e: Entry): { file: string; line?: number } | null {
  if (!route.startsWith('html:')) return null;
  const file = route.slice(5);
  if (file === '') return null;
  const m = /@L(\d+)(?::|$)/.exec(e.id);
  const line = m ? Number(m[1]) : 0;
  return line > 0 ? { file, line } : { file };
}

export function toAnnotations(report: AuditReport, lang: Lang): Annotation[] {
  const out: Annotation[] = [];
  for (const r of report.routes) {
    for (const e of r.entries) {
      const source = sourceOf(r.route, e);
      out.push({
        level: e.status === 'fail' ? 'error' : 'notice',
        title: source ? `${ruleIdOf(e)} ${e.id}` : `${ruleIdOf(e)} ${r.route} ${e.id}`,
        message: e.message[lang],
        ...(source ? { file: source.file, ...(source.line !== undefined ? { line: source.line } : {}) } : {}),
      });
    }
  }
  // Failures first. The sort is stable, so the order of the report is kept inside each level.
  return out.sort((a, b) => Number(b.level === 'error') - Number(a.level === 'error'));
}

export function formatAnnotation(a: Annotation): string {
  const props = [
    ...(a.file !== undefined ? [`file=${escapeProperty(a.file)}`] : []),
    ...(a.line !== undefined ? [`line=${a.line}`] : []),
    `title=${escapeProperty(a.title)}`,
  ];
  return `::${a.level} ${props.join(',')}::${escapeData(a.message)}`;
}

/** The workflow command lines for a report, cut at `max`, with a closing notice when findings were left out. Empty for a report with no finding. */
export function renderAnnotations(report: AuditReport, lang: Lang, max = DEFAULT_MAX_ANNOTATIONS): string {
  const all = toAnnotations(report, lang);
  if (all.length === 0) return '';
  const limit = Math.max(1, Math.floor(max));
  const lines = all.slice(0, limit).map(formatAnnotation);
  const left = all.length - limit;
  if (left > 0) {
    const errorsLeft = all.slice(limit).filter((a) => a.level === 'error').length;
    lines.push(
      formatAnnotation({
        level: 'notice',
        title: 'narrow-audit',
        message:
          lang === 'fr'
            ? `${left} ${left < 2 ? 'autre anomalie n’est pas annotée' : 'autres anomalies ne sont pas annotées'} ici, dont ${errorsLeft} à corriger. Le rapport complet les contient toutes.`
            : `${left} more ${left === 1 ? 'finding is' : 'findings are'} not annotated here, ${errorsLeft} of them to fix. The full report holds all of them.`,
      }),
    );
  }
  return lines.join('\n') + '\n';
}
