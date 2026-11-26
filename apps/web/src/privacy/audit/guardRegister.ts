// What the strictness settings are written to be: the compiler flags of each TypeScript configuration, every
// suppression comment in the code, the test and lint lists, the package.json files read, and the findings that are
// accepted as they stand. A change to any of them without a change here fails the test until it has been looked at.
// The list says what is written; it does not say the code is correct. Node only (tests and CI), never shipped.

import type { GuardCode } from "./guardRules";

export interface GuardSuppressRow {
  path: string;
  kind: string;
  /** The rules joined with ", ", or "" for none. */
  rules: string;
  count: number;
}

export interface GuardAcceptRow {
  path: string;
  code: GuardCode;
  count: number;
  reason: string;
}

export interface GuardRegister {
  /** What each configuration comes to, once `extends` is followed: name=state for each flag that is written. */
  tsFlags: Readonly<Record<string, string>>;
  suppressions: readonly GuardSuppressRow[];
  /** The lists read from the test and lint configuration, by file and key. */
  lists: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>>;
  packages: readonly string[];
}

/** Findings that may be accepted. The others (a check switched off for a whole file, a retry, a failure turned into success) never may. */
export const GUARD_ACCEPTABLE: readonly GuardCode[] = ["suppress-no-reason", "suppress-any", "ts-no-unchecked-index", "script-install-lifecycle", "config-lint-warn"];

const ALL = "strict=true,noUncheckedIndexedAccess=true";
const FLAGS = (extra: string): string => `${ALL},${extra}`;

export const GUARD_REGISTER: GuardRegister = {
  tsFlags: {
    "apps/web/e2e/axe-sweep/portable-shortlist/tsconfig.json": FLAGS("noFallthroughCasesInSwitch=true,skipLibCheck=true,noEmit=true,isolatedModules=true,verbatimModuleSyntax=true"),
    "apps/web/e2e/contribution-journeys/tsconfig.json": FLAGS("noFallthroughCasesInSwitch=true,skipLibCheck=true,noEmit=true,isolatedModules=true,verbatimModuleSyntax=true"),
    "apps/web/tsconfig.json": FLAGS("noFallthroughCasesInSwitch=true,skipLibCheck=true,noEmit=true,isolatedModules=true,verbatimModuleSyntax=true"),
    "apps/web/tsconfig.node.json": FLAGS("noFallthroughCasesInSwitch=true,skipLibCheck=true,noEmit=true,isolatedModules=true,verbatimModuleSyntax=true"),
    "apps/web/tsconfig.scripts.json": FLAGS("skipLibCheck=true,noEmit=true,verbatimModuleSyntax=true"),
    "packages/advocacy/tsconfig.e2e.json": FLAGS("noFallthroughCasesInSwitch=true,skipLibCheck=true,noEmit=true,verbatimModuleSyntax=true"),
    "packages/advocacy/tsconfig.json": FLAGS("noFallthroughCasesInSwitch=true,skipLibCheck=true,noEmit=true,verbatimModuleSyntax=true"),
    "packages/budgets/tsconfig.json": FLAGS("skipLibCheck=true,noEmit=true,verbatimModuleSyntax=true"),
    "packages/caregiver/tsconfig.json": FLAGS("noFallthroughCasesInSwitch=true,skipLibCheck=true,noEmit=true,verbatimModuleSyntax=true"),
    "packages/consent/tsconfig.json": FLAGS("noFallthroughCasesInSwitch=true,skipLibCheck=true,noEmit=true,verbatimModuleSyntax=true"),
    "packages/contribute/tsconfig.json": FLAGS("noFallthroughCasesInSwitch=true,skipLibCheck=true,noEmit=true,verbatimModuleSyntax=true"),
    "packages/controls/tsconfig.json": FLAGS("noFallthroughCasesInSwitch=true,skipLibCheck=true,noEmit=true,verbatimModuleSyntax=true"),
    "packages/data-client/tsconfig.json": FLAGS("noFallthroughCasesInSwitch=true,skipLibCheck=true,noEmit=true,verbatimModuleSyntax=true"),
    "packages/freshness/tsconfig.json": FLAGS("noFallthroughCasesInSwitch=true,skipLibCheck=true,noEmit=true,isolatedModules=true,verbatimModuleSyntax=true"),
    "packages/proposals/tsconfig.json": FLAGS("skipLibCheck=true,noEmit=true"),
    "packages/schema/tsconfig.json": "strict=true,skipLibCheck=true",
    "packages/shared/tsconfig.json": FLAGS("noFallthroughCasesInSwitch=true,skipLibCheck=true,noEmit=true,verbatimModuleSyntax=true"),
    "packages/source-status/tsconfig.json": FLAGS("skipLibCheck=true,noEmit=true,verbatimModuleSyntax=true"),
    "packages/sr-switch/tsconfig.json": "strict=true,skipLibCheck=true,noEmit=true",
    "packages/sync/tsconfig.json": FLAGS("noFallthroughCasesInSwitch=true,skipLibCheck=true,noEmit=true,verbatimModuleSyntax=true"),
    "packages/trip-check/tsconfig.json": FLAGS("skipLibCheck=true,noEmit=true"),
  },
  suppressions: [
    { path: "apps/web/src/design/ConfirmDialog.tsx", kind: "eslint-disable-next-line", rules: "jsx-a11y/no-autofocus", count: 1 },
    { path: "apps/web/src/perf/routeChunks.ts", kind: "eslint-disable-next-line", rules: "@typescript-eslint/no-explicit-any", count: 1 },
    { path: "apps/web/src/states/MeetUp.tsx", kind: "eslint-disable-next-line", rules: "jsx-a11y/no-noninteractive-tabindex", count: 1 },
    { path: "apps/web/src/states/OutingPlanner.tsx", kind: "eslint-disable-next-line", rules: "jsx-a11y/no-noninteractive-tabindex", count: 1 },
    { path: "apps/web/src/states/Shortlist.tsx", kind: "eslint-disable-next-line", rules: "jsx-a11y/no-noninteractive-tabindex", count: 1 },
    { path: "apps/web/src/states/correction.ts", kind: "eslint-disable-next-line", rules: "no-control-regex", count: 1 },
    { path: "apps/web/src/states/downloadFile.ts", kind: "eslint-disable-next-line", rules: "no-control-regex", count: 1 },
    { path: "apps/web/src/states/handoutHtml.ts", kind: "eslint-disable-next-line", rules: "no-control-regex", count: 1 },
    { path: "apps/web/src/states/listTransfer.ts", kind: "eslint-disable-next-line", rules: "no-control-regex", count: 1 },
    { path: "apps/web/src/states/packAudit.ts", kind: "eslint-disable-next-line", rules: "no-control-regex", count: 1 },
    { path: "apps/web/src/states/packEarlierId.ts", kind: "eslint-disable-next-line", rules: "no-control-regex", count: 1 },
    { path: "apps/web/src/states/packExport.test.ts", kind: "eslint-disable-next-line", rules: "no-control-regex", count: 1 },
    { path: "apps/web/src/states/packPlaces.ts", kind: "eslint-disable-next-line", rules: "no-control-regex", count: 2 },
    { path: "apps/web/src/states/placeSheetExport.ts", kind: "eslint-disable-next-line", rules: "no-control-regex", count: 1 },
    { path: "apps/web/src/states/shortlist.ts", kind: "eslint-disable-next-line", rules: "no-control-regex", count: 1 },
    { path: "apps/web/src/states/urlState.ts", kind: "eslint-disable-next-line", rules: "no-control-regex", count: 1 },
  ],
  lists: {
    "vitest.config.ts": {
      include: [
        "packages/shared/src/**/*.test.ts",
        "packages/shared/test/**/*.test.ts",
        "packages/*/test/**/*.test.ts",
        "packages/*/test/**/*.test.tsx",
        "apps/web/src/**/*.test.ts",
        "apps/web/src/**/*.test.tsx",
        "apps/web/scripts/**/*.test.ts",
        "scripts/**/*.test.mjs",
      ],
      exclude: ["**/*.spec.tsx", "**/node_modules/**", "**/.git/**", "scripts/release/**"],
    },
    "eslint.config.js": {
      ignores: ["**/dist/**", "**/dev-dist/**", "**/node_modules/**", "playwright-report/**", "test-results/**", "**/.lanes/**", "**/.lanes-tmp/**"],
    },
  },
  packages: [
    "apps/web/package.json",
    "package.json",
    "packages/advocacy/package.json",
    "packages/budgets/package.json",
    "packages/caregiver/package.json",
    "packages/consent/package.json",
    "packages/contribute/package.json",
    "packages/controls/package.json",
    "packages/data-client/package.json",
    "packages/freshness/package.json",
    "packages/proposals/package.json",
    "packages/schema/package.json",
    "packages/shared/package.json",
    "packages/source-status/package.json",
    "packages/sr-switch/package.json",
    "packages/sync/package.json",
    "packages/trip-check/package.json",
    "scripts/release/package.json",
  ],
};

const NO_REASON = "The directive has no reason after --. The line before it, or the code under it, says why (read for the control-character patterns and the scrolling regions; the generic default in routeChunks.ts is a type parameter's default). The file belongs to another lane, so it is reported here and not edited.";
const NO_UNCHECKED = "The configuration does not turn noUncheckedIndexedAccess on. The file belongs to another lane, so it is reported here and not edited.";
const LIFECYCLE = "prepare builds the schema package when dependencies are installed. It runs the TypeScript compiler on a file in this repository and fetches nothing.";

export const GUARD_ACCEPTED: readonly GuardAcceptRow[] = [
  { path: "apps/web/src/perf/routeChunks.ts", code: "suppress-no-reason", count: 1, reason: NO_REASON },
  { path: "apps/web/src/states/MeetUp.tsx", code: "suppress-no-reason", count: 1, reason: NO_REASON },
  { path: "apps/web/src/states/OutingPlanner.tsx", code: "suppress-no-reason", count: 1, reason: NO_REASON },
  { path: "apps/web/src/states/Shortlist.tsx", code: "suppress-no-reason", count: 1, reason: NO_REASON },
  { path: "apps/web/src/states/correction.ts", code: "suppress-no-reason", count: 1, reason: NO_REASON },
  { path: "apps/web/src/states/urlState.ts", code: "suppress-no-reason", count: 1, reason: NO_REASON },
  { path: "package.json", code: "script-install-lifecycle", count: 1, reason: LIFECYCLE },
  { path: "packages/schema/package.json", code: "script-install-lifecycle", count: 1, reason: LIFECYCLE },
  { path: "packages/schema/tsconfig.json", code: "ts-no-unchecked-index", count: 1, reason: NO_UNCHECKED },
  { path: "packages/sr-switch/tsconfig.json", code: "ts-no-unchecked-index", count: 1, reason: NO_UNCHECKED },
];

export interface GuardRegisterProblem {
  message: string;
}

/** Checks the register itself: sorted and unique rows, real reasons, codes that may be accepted. */
export function validateGuardRegister(reg: GuardRegister = GUARD_REGISTER, accepted: readonly GuardAcceptRow[] = GUARD_ACCEPTED): GuardRegisterProblem[] {
  const out: GuardRegisterProblem[] = [];
  const keys = Object.keys(reg.tsFlags);
  if (keys.some((k, i) => k !== [...keys].sort()[i])) out.push({ message: "the configurations are not in sorted order" });
  for (const [k, v] of Object.entries(reg.tsFlags)) if (v === "") out.push({ message: `${k} has no flags` });
  const ids = reg.suppressions.map((r) => `${r.path}\u0000${r.kind}\u0000${r.rules}`);
  if (new Set(ids).size !== ids.length) out.push({ message: "a suppression is listed twice" });
  if (ids.some((x, i) => x !== [...ids].sort()[i])) out.push({ message: "the suppressions are not in sorted order" });
  for (const r of reg.suppressions) if (!Number.isInteger(r.count) || r.count < 1) out.push({ message: `${r.path} ${r.kind} has a count of ${r.count}` });
  if (new Set(reg.packages).size !== reg.packages.length) out.push({ message: "a package file is listed twice" });
  const seen = new Set<string>();
  for (const a of accepted) {
    const id = `${a.path}\u0000${a.code}`;
    if (seen.has(id)) out.push({ message: `${a.path} accepts ${a.code} twice` });
    seen.add(id);
    if (!GUARD_ACCEPTABLE.includes(a.code)) out.push({ message: `${a.code} may not be accepted (${a.path})` });
    if (!Number.isInteger(a.count) || a.count < 1) out.push({ message: `${a.path} ${a.code} has a count of ${a.count}` });
    if (a.reason.trim().length < 20) out.push({ message: `${a.path} ${a.code} has no real reason` });
  }
  return out;
}

export function assertGuardRegister(): void {
  const p = validateGuardRegister();
  if (p.length > 0) throw new Error(`The strictness register is wrong:\n${p.map((x) => `  ${x.message}`).join("\n")}`);
}
