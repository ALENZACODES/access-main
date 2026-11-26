// The writes of markup that the code may make, one row for each file with the number of writes. The reasons say only
// what was read at the lines; the audit tools in privacy/audit are not scanned, because they name the sinks in patterns; the escape audit named in a reason covers the notice and the error line of a panel and
// nothing else in it.

import type { Sink } from "./dgSink";

export interface SinkRow {
  path: string;
  count: number;
  reason: string;
}

const R_NARROW = "The panel writes the string its own render function returns. dg.escape.audit.test.ts renders the notice with ten hostile texts and finds them escaped; the other fields of the panel were not checked there.";
const R_DATA = "The write passes a string built by a render function of the data status page. Not checked: how each field in that string is escaped.";

export const SINK_ROWS: readonly SinkRow[] = [
  { path: "apps/web/src/data-status/panel.ts", count: 5, reason: R_DATA },
  { path: "apps/web/src/data-status/standalone/bootstrap.ts", count: 1, reason: "The write is a template that holds one translated string and no value from outside." },
  { path: "apps/web/src/narrow/fit-panel.ts", count: 1, reason: R_NARROW },
  { path: "apps/web/src/narrow/gestures-panel.ts", count: 1, reason: R_NARROW },
  { path: "apps/web/src/narrow/hand-panel.ts", count: 1, reason: "The panel writes the string renderHandPanel returns. dg.escape.audit.test.ts checks its notice, its earlier log field and that field's error line; the other fields of the panel were not checked." },
  { path: "apps/web/src/narrow/hit-panel.ts", count: 1, reason: R_NARROW },
  { path: "apps/web/src/narrow/hover-panel.ts", count: 1, reason: R_NARROW },
  { path: "apps/web/src/narrow/moving-panel.ts", count: 1, reason: R_NARROW },
  { path: "apps/web/src/narrow/panel.ts", count: 1, reason: "The panel writes the string renderPanel returns. dg.escape.audit.test.ts checks its error message; the notice of a finished audit and the report body was not checked there." },
  { path: "apps/web/src/narrow/press-panel.ts", count: 1, reason: R_NARROW },
  { path: "apps/web/src/narrow/reach-panel.ts", count: 1, reason: R_NARROW },
  { path: "apps/web/src/narrow/scan-panel.ts", count: 1, reason: R_NARROW },
  { path: "apps/web/src/narrow/scroll-panel.ts", count: 1, reason: R_NARROW },
  { path: "apps/web/src/narrow/slip-panel.ts", count: 1, reason: R_NARROW },
  { path: "apps/web/src/narrow/start-panel.ts", count: 1, reason: R_NARROW },
  { path: "apps/web/src/narrow/summary-panel.ts", count: 1, reason: R_NARROW },
  { path: "apps/web/src/narrow/tap-panel.ts", count: 1, reason: R_NARROW },
  { path: "apps/web/src/narrow/travel-panel.ts", count: 1, reason: R_NARROW },
  { path: "apps/web/src/narrow/twice-panel.ts", count: 1, reason: R_NARROW },
  { path: "apps/web/src/narrow/typing-panel.ts", count: 1, reason: R_NARROW },
  { path: "apps/web/src/narrow/voice-panel.ts", count: 1, reason: R_NARROW },
  { path: "apps/web/src/narrow/zones-panel.ts", count: 1, reason: R_NARROW },
  { path: "apps/web/src/pages/DataStatusPage.tsx", count: 1, reason: "dangerouslySetInnerHTML takes sourceListHtml. Not checked: how that string is built." },
  { path: "apps/web/src/privacy/panel/mount.ts", count: 2, reason: "The mount writes the controller's html() and forwards a setter to the element. Not checked: the escape inside html() beyond the privacy panel tests." },
];

export interface SinkProblem {
  code: "sink-not-listed" | "listed-gone" | "count-changed" | "empty-reason";
  path: string;
  detail: string;
}

export function compareSinks(sinks: readonly Sink[], rows: readonly SinkRow[]): SinkProblem[] {
  const found = new Map<string, number>();
  for (const s of sinks) found.set(s.path, (found.get(s.path) ?? 0) + 1);
  const listed = new Map(rows.map((r) => [r.path, r] as const));
  const out: SinkProblem[] = [];
  for (const [path, n] of found) {
    const row = listed.get(path);
    if (row === undefined) out.push({ code: "sink-not-listed", path, detail: `${n} write(s) of markup, none listed` });
    else if (row.count !== n) out.push({ code: "count-changed", path, detail: `listed ${row.count}, found ${n}` });
  }
  for (const r of rows) {
    if (!found.has(r.path)) out.push({ code: "listed-gone", path: r.path, detail: `listed ${r.count}, found none` });
    if (r.reason.trim().length < 20) out.push({ code: "empty-reason", path: r.path, detail: "the reason is missing or too short to say anything" });
  }
  return out.sort((a, b) => (a.path + a.code < b.path + b.code ? -1 : 1));
}

export function formatSinkProblem(p: SinkProblem): string {
  return `${p.path}: ${p.code}: ${p.detail}`;
}
