// What the code may do with error text and the console, and which findings are accepted as they stand. The reasons say
// only what was read in the lines named; where something was not checked the reason says so.

import type { DgCode } from "./dgRules";

export interface DgAcceptRow {
  path: string;
  code: DgCode;
  count: number;
  reason: string;
}

/** Codes that may be accepted. A debugger statement, a browser dialog and the stack of an error never may. */
export const DG_ACCEPTABLE: readonly DgCode[] = ["dg-console", "dg-error-hook", "dg-boundary", "dg-error-text", "dg-error-string", "dg-throw-user-name"];

const R_CAUGHT_TEXT = "The catch puts the message of the caught error into a notice or a line that the person reads. Not checked: what every call inside the try can throw.";
const R_CAUGHT_STRING = "The same catch turns an error that is not an Error into text with String(), for the same notice or line.";
const R_TOOL_TEXT = "Test tooling inside src: describes a caught error for a failure message in a test log. It is not part of a screen.";
const R_CANARY_TEXT = "Test tooling inside src: reads the message of a caught error to look for the canary in it. The text is not shown or kept.";
const R_TOOL_NAME = "The thrown text writes spec.name, the name a test gives its own property. It is not a value a person typed.";
const R_FIELD_NAME = "The thrown text writes a parameter that holds the name of a field. The calls in this folder that were found by search pass quoted names, not values.";
const R_QUERY_NAME = "The thrown text lists the problems of the web address register, where name is the name of a query parameter, not a value.";
const R_BOUNDARY = "getDerivedStateFromError returns only { failed: true } and the class keeps no error text.";
const R_MAP_ERROR = "map.on(\"error\") sets an error flag and does not read the event.";
const R_CLI_LOG = "The command-line entry writes a line the command built with console.log. It runs in Node, not in the page.";

export const DG_ACCEPTED: readonly DgAcceptRow[] = [
  { path: "apps/web/src/contribute/ContributePage.tsx", code: "dg-error-string", count: 1, reason: R_CAUGHT_STRING },
  { path: "apps/web/src/contribute/ContributePage.tsx", code: "dg-error-text", count: 1, reason: R_CAUGHT_TEXT },
  { path: "apps/web/src/hub/PackageView.tsx", code: "dg-boundary", count: 1, reason: R_BOUNDARY },
  { path: "apps/web/src/map/MapPage.tsx", code: "dg-error-hook", count: 1, reason: R_MAP_ERROR },
  { path: "apps/web/src/modules/Section.tsx", code: "dg-boundary", count: 1, reason: R_BOUNDARY },
  { path: "apps/web/src/narrow/bin.mjs", code: "dg-console", count: 1, reason: R_CLI_LOG },
  { path: "apps/web/src/narrow/cli-extras.ts", code: "dg-error-string", count: 1, reason: R_CAUGHT_STRING },
  { path: "apps/web/src/narrow/cli-extras.ts", code: "dg-error-text", count: 1, reason: R_CAUGHT_TEXT },
  { path: "apps/web/src/narrow/cli.ts", code: "dg-error-string", count: 3, reason: R_CAUGHT_STRING },
  { path: "apps/web/src/narrow/cli.ts", code: "dg-error-text", count: 3, reason: R_CAUGHT_TEXT },
  { path: "apps/web/src/narrow/doctor.ts", code: "dg-error-string", count: 2, reason: R_CAUGHT_STRING },
  { path: "apps/web/src/narrow/doctor.ts", code: "dg-error-text", count: 2, reason: R_CAUGHT_TEXT },
  { path: "apps/web/src/narrow/fit-panel.ts", code: "dg-error-string", count: 1, reason: R_CAUGHT_STRING },
  { path: "apps/web/src/narrow/fit-panel.ts", code: "dg-error-text", count: 1, reason: R_CAUGHT_TEXT },
  { path: "apps/web/src/narrow/gestures-panel.ts", code: "dg-error-string", count: 1, reason: R_CAUGHT_STRING },
  { path: "apps/web/src/narrow/gestures-panel.ts", code: "dg-error-text", count: 1, reason: R_CAUGHT_TEXT },
  { path: "apps/web/src/narrow/init.ts", code: "dg-error-string", count: 2, reason: R_CAUGHT_STRING },
  { path: "apps/web/src/narrow/init.ts", code: "dg-error-text", count: 2, reason: R_CAUGHT_TEXT },
  { path: "apps/web/src/narrow/panel.ts", code: "dg-error-string", count: 1, reason: R_CAUGHT_STRING },
  { path: "apps/web/src/narrow/panel.ts", code: "dg-error-text", count: 1, reason: R_CAUGHT_TEXT },
  { path: "apps/web/src/narrow/plan-cli.ts", code: "dg-error-string", count: 1, reason: R_CAUGHT_STRING },
  { path: "apps/web/src/narrow/plan-cli.ts", code: "dg-error-text", count: 1, reason: R_CAUGHT_TEXT },
  { path: "apps/web/src/narrow/reach-panel.ts", code: "dg-error-string", count: 1, reason: R_CAUGHT_STRING },
  { path: "apps/web/src/narrow/reach-panel.ts", code: "dg-error-text", count: 1, reason: R_CAUGHT_TEXT },
  { path: "apps/web/src/narrow/scroll-panel.ts", code: "dg-error-string", count: 1, reason: R_CAUGHT_STRING },
  { path: "apps/web/src/narrow/scroll-panel.ts", code: "dg-error-text", count: 1, reason: R_CAUGHT_TEXT },
  { path: "apps/web/src/narrow/slip-panel.ts", code: "dg-error-string", count: 1, reason: R_CAUGHT_STRING },
  { path: "apps/web/src/narrow/slip-panel.ts", code: "dg-error-text", count: 1, reason: R_CAUGHT_TEXT },
  { path: "apps/web/src/narrow/summary-panel.ts", code: "dg-error-string", count: 1, reason: R_CAUGHT_STRING },
  { path: "apps/web/src/narrow/summary-panel.ts", code: "dg-error-text", count: 1, reason: R_CAUGHT_TEXT },
  { path: "apps/web/src/narrow/travel-panel.ts", code: "dg-error-string", count: 1, reason: R_CAUGHT_STRING },
  { path: "apps/web/src/narrow/travel-panel.ts", code: "dg-error-text", count: 1, reason: R_CAUGHT_TEXT },
  { path: "apps/web/src/narrow/triage-cli.ts", code: "dg-error-string", count: 1, reason: R_CAUGHT_STRING },
  { path: "apps/web/src/narrow/triage-cli.ts", code: "dg-error-text", count: 1, reason: R_CAUGHT_TEXT },
  { path: "apps/web/src/narrow/typing-panel.ts", code: "dg-error-string", count: 1, reason: R_CAUGHT_STRING },
  { path: "apps/web/src/narrow/typing-panel.ts", code: "dg-error-text", count: 1, reason: R_CAUGHT_TEXT },
  { path: "apps/web/src/narrow/voice-panel.ts", code: "dg-error-string", count: 1, reason: R_CAUGHT_STRING },
  { path: "apps/web/src/narrow/voice-panel.ts", code: "dg-error-text", count: 1, reason: R_CAUGHT_TEXT },
  { path: "apps/web/src/narrow/zones-panel.ts", code: "dg-error-string", count: 1, reason: R_CAUGHT_STRING },
  { path: "apps/web/src/narrow/zones-panel.ts", code: "dg-error-text", count: 1, reason: R_CAUGHT_TEXT },
  { path: "apps/web/src/offline/robust/accessInquiry.ts", code: "dg-throw-user-name", count: 4, reason: R_FIELD_NAME },
  { path: "apps/web/src/offline/robust/accessPreparation.ts", code: "dg-throw-user-name", count: 3, reason: R_FIELD_NAME },
  { path: "apps/web/src/offline/robust/handoffRehearsal.ts", code: "dg-throw-user-name", count: 1, reason: R_FIELD_NAME },
  { path: "apps/web/src/offline/robust/reconciliationWorkbook.ts", code: "dg-throw-user-name", count: 1, reason: R_FIELD_NAME },
  { path: "apps/web/src/privacy/audit/dgCanary.ts", code: "dg-error-text", count: 2, reason: R_CANARY_TEXT },
  { path: "apps/web/src/privacy/audit/fuzz/property.ts", code: "dg-error-string", count: 1, reason: R_TOOL_TEXT },
  { path: "apps/web/src/privacy/audit/fuzz/property.ts", code: "dg-error-text", count: 1, reason: R_TOOL_TEXT },
  { path: "apps/web/src/privacy/audit/fuzz/property.ts", code: "dg-throw-user-name", count: 1, reason: R_TOOL_NAME },
  { path: "apps/web/src/privacy/audit/parity.ts", code: "dg-error-string", count: 1, reason: R_TOOL_TEXT },
  { path: "apps/web/src/privacy/panel/queryRegister.ts", code: "dg-throw-user-name", count: 1, reason: R_QUERY_NAME },
  { path: "apps/web/src/shell/AppShell.tsx", code: "dg-boundary", count: 1, reason: R_BOUNDARY },
];

export interface DgRegisterProblem {
  message: string;
}

/** Checks the accepted list itself. Returns the problems, none when it is well formed. */
export function validateDgRegister(accepted: readonly DgAcceptRow[] = DG_ACCEPTED): DgRegisterProblem[] {
  const out: DgRegisterProblem[] = [];
  const add = (message: string): void => void out.push({ message });
  const seen = new Set<string>();
  let last = "";
  for (const a of accepted) {
    const key = `${a.path} ${a.code}`;
    if (seen.has(key)) add(`${key} is accepted twice`);
    seen.add(key);
    if (key < last) add("the accepted rows are not in sorted order");
    last = key;
    if (!DG_ACCEPTABLE.includes(a.code)) add(`${a.code} may not be accepted (${a.path})`);
    if (!Number.isInteger(a.count) || a.count < 1) add(`${key} has a count of ${a.count}`);
    if (a.reason.trim().length < 40) add(`${key} has no real reason`);
    if (!/^apps\/web\/src\//.test(a.path)) add(`${a.path} is not under apps/web/src`);
  }
  return out;
}

export function assertDgRegister(): void {
  const p = validateDgRegister();
  if (p.length > 0) throw new Error(`The diagnostics register is not well formed:\n${p.map((x) => `  ${x.message}`).join("\n")}`);
}
