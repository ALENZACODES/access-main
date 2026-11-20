/** Reproducible offline journey state-machine for keyboard-first export QA. */
import {
  canonical, dateIsValid, handoffDiagnostics, provenanceKey, routeIsSafe, transferDiagnostics,
  type Diagnostic, type EvidenceItem, type Handoff, type LinkState, type Locale,
  type Snapshot, type Transfer,
} from "./p20ah-handoff-policy.ts";

export type ReplayAction =
  | { readonly kind: "navigate"; readonly route: string }
  | { readonly kind: "language"; readonly locale: Locale }
  | { readonly kind: "disconnect" }
  | { readonly kind: "reconnect" }
  | { readonly kind: "retry" }
  | { readonly kind: "focus"; readonly target: string | null }
  | { readonly kind: "search"; readonly query: string }
  | { readonly kind: "clear" }
  | { readonly kind: "save"; readonly items: readonly EvidenceItem[] }
  | { readonly kind: "export"; readonly packet: Handoff | null }
  | { readonly kind: "back" }
  | { readonly kind: "forward" };
export interface ReplayState {
  readonly screen: Snapshot;
  readonly query: string;
  readonly pages: readonly string[];
  readonly cursor: number;
  readonly lastPacket: Handoff | null;
  readonly busy: boolean;
  readonly observed: readonly string[];
}
export interface ReplayStep {
  readonly action: ReplayAction;
  readonly before: ReplayState;
  readonly after: ReplayState;
  readonly diagnostics: readonly Diagnostic[];
}
export interface ReplayResult {
  readonly initial: ReplayState;
  readonly final: ReplayState;
  readonly steps: readonly ReplayStep[];
  readonly diagnostics: readonly Diagnostic[];
}

export const initialReplay = (route = "/", locale: Locale = "en"): ReplayState => ({
  screen: { route, locale, connection: "UNKNOWN", activeId: null, heading: "The App",
    status: "idle", records: [] },
  query: "", pages: [route], cursor: 0, lastPacket: null, busy: false, observed: [],
});
const replayIssue = (code: string, field: string, detail: string): Diagnostic => ({
  code, field, detail, severity: "block",
});
function updateScreen(state: ReplayState, changes: Partial<Snapshot>): ReplayState {
  return { ...state, screen: { ...state.screen, ...changes } };
}
export function replayOne(state: ReplayState, action: ReplayAction): ReplayStep {
  const diagnostics: Diagnostic[] = [];
  let after = state;
  switch (action.kind) {
    case "navigate": {
      if (!routeIsSafe(action.route)) {
        diagnostics.push(replayIssue("navigate-unsafe", "route", action.route));
        break;
      }
      const pages = [...state.pages.slice(0, state.cursor + 1), action.route];
      after = { ...updateScreen(state, { route: action.route, activeId: null }), pages,
        cursor: pages.length - 1 };
      break;
    }
    case "language": {
      if (action.locale === state.screen.locale) diagnostics.push(replayIssue("language-unchanged", "locale", action.locale));
      after = updateScreen(state, { locale: action.locale });
      break;
    }
    case "disconnect": {
      if (state.screen.connection === "offline") diagnostics.push(replayIssue("already-offline", "connection", "offline"));
      after = updateScreen(state, { connection: "offline", status: state.screen.status === "loading" ? "UNKNOWN" : state.screen.status });
      break;
    }
    case "reconnect": {
      if (state.screen.connection === "online") diagnostics.push(replayIssue("already-online", "connection", "online"));
      after = updateScreen(state, { connection: "online" });
      break;
    }
    case "retry": {
      if (state.screen.status !== "error") diagnostics.push(replayIssue("retry-without-error", "status", state.screen.status));
      after = updateScreen(state, { status: state.screen.connection === "online" ? "loading" : "UNKNOWN" });
      break;
    }
    case "focus": {
      if (action.target !== null && !action.target.trim()) diagnostics.push(replayIssue("focus-empty", "target", "Empty target"));
      else after = updateScreen(state, { activeId: action.target });
      break;
    }
    case "search": {
      if (state.screen.connection === "offline") {
        diagnostics.push(replayIssue("search-offline", "connection", "Offline searches require a local index"));
        after = { ...updateScreen(state, { status: "UNKNOWN" }), query: action.query, busy: false };
      } else if (state.screen.connection === "UNKNOWN") {
        diagnostics.push(replayIssue("search-connection-unknown", "connection", "UNKNOWN"));
        after = { ...updateScreen(state, { status: "UNKNOWN" }), query: action.query, busy: false };
      } else {
        after = { ...updateScreen(state, { status: "loading" }), query: action.query, busy: true };
      }
      break;
    }
    case "clear": {
      after = { ...updateScreen(state, { status: "idle" }), query: "", busy: false };
      break;
    }
    case "save": {
      const ids = new Set<string>();
      for (const item of action.items) {
        if (ids.has(item.id)) diagnostics.push(replayIssue("save-duplicate", "records", item.id));
        ids.add(item.id);
      }
      after = updateScreen(state, { records: [...action.items] });
      break;
    }
    case "export": {
      if (action.packet === null) diagnostics.push(replayIssue("export-empty", "packet", "UNKNOWN"));
      else {
        diagnostics.push(...handoffDiagnostics(action.packet).filter((entry) => entry.severity === "block"));
        const source = new Map(state.screen.records.map((item) => [item.id, item]));
        for (const item of action.packet.records) {
          const previous = source.get(item.id);
          if (!previous) diagnostics.push(replayIssue("export-unseen-record", "records", item.id));
          else if (provenanceKey(item) !== provenanceKey(previous)) diagnostics.push(replayIssue("export-changed-source", "records", item.id));
        }
        if (action.packet.locale !== state.screen.locale) diagnostics.push(replayIssue("export-locale", "locale", action.packet.locale));
        if (action.packet.originRoute !== state.screen.route) diagnostics.push(replayIssue("export-route", "originRoute", action.packet.originRoute));
      }
      after = { ...state, lastPacket: action.packet };
      break;
    }
    case "back": {
      if (state.cursor <= 0) diagnostics.push(replayIssue("history-back-end", "cursor", String(state.cursor)));
      else {
        const cursor = state.cursor - 1;
        after = { ...updateScreen(state, { route: state.pages[cursor] ?? state.screen.route }), cursor };
      }
      break;
    }
    case "forward": {
      if (state.cursor + 1 >= state.pages.length) diagnostics.push(replayIssue("history-forward-end", "cursor", String(state.cursor)));
      else {
        const cursor = state.cursor + 1;
        after = { ...updateScreen(state, { route: state.pages[cursor] ?? state.screen.route }), cursor };
      }
      break;
    }
  }
  const transitionKind = action.kind === "language" ? "locale" :
    action.kind === "search" || action.kind === "save" || action.kind === "clear" || action.kind === "focus" ? null : action.kind;
  if (transitionKind !== null) {
    const trans: Transfer = { kind: transitionKind, before: state.screen, after: after.screen,
      handoff: action.kind === "export" ? action.packet : null,
      focusShouldRemain: ["language", "disconnect", "reconnect", "export"].includes(action.kind),
      recordsShouldRemain: !["save", "search", "clear"].includes(action.kind) };
    diagnostics.push(...transferDiagnostics(trans).filter((entry) => entry.severity === "block"));
  }
  return { action, before: state, after, diagnostics };
}
export function replay(initial: ReplayState, actions: readonly ReplayAction[]): ReplayResult {
  const steps: ReplayStep[] = [];
  let cursor = initial;
  for (const action of actions) {
    const step = replayOne(cursor, action);
    steps.push(step);
    cursor = step.after;
  }
  return { initial, final: cursor, steps, diagnostics: steps.flatMap((step) => step.diagnostics) };
}
export function replayCompleteness(result: ReplayResult): Diagnostic[] {
  const diagnostics: Diagnostic[] = [...result.diagnostics];
  for (const [index, step] of result.steps.entries()) {
    if (index > 0 && result.steps[index - 1]?.after !== step.before) {
      diagnostics.push(replayIssue("replay-chain-disconnected", String(index), "Previous step mismatch"));
    }
    if (step.after.cursor < 0 || step.after.cursor >= step.after.pages.length) {
      diagnostics.push(replayIssue("replay-cursor-invalid", String(index), String(step.after.cursor)));
    }
    if (step.after.pages[step.after.cursor] !== step.after.screen.route) {
      diagnostics.push(replayIssue("replay-route-history-drift", String(index), step.after.screen.route));
    }
    if (step.after.screen.connection === "UNKNOWN" && step.after.screen.status === "loading") {
      diagnostics.push(replayIssue("replay-loading-unknown-link", String(index), "UNKNOWN"));
    }
    if (step.after.lastPacket && !dateIsValid(step.after.lastPacket.createdOn)) {
      diagnostics.push({ code: "replay-handoff-date-unknown", field: String(index), detail: "UNKNOWN", severity: "information" });
    }
  }
  return diagnostics;
}
export function replayStatistics(result: ReplayResult): Readonly<Record<string, number>> {
  const counts: Record<string, number> = Object.create(null) as Record<string, number>;
  for (const step of result.steps) counts[step.action.kind] = (counts[step.action.kind] ?? 0) + 1;
  return counts;
}
export function sameReplayIdentity(a: ReplayState, b: ReplayState): boolean {
  return a.screen.route === b.screen.route && a.screen.locale === b.screen.locale &&
    a.screen.connection === b.screen.connection && a.cursor === b.cursor &&
    a.pages.join("\u0000") === b.pages.join("\u0000");
}
export function fallbackOutcome(connection: LinkState, localRecords: readonly EvidenceItem[]): "ready" | "empty" | "UNKNOWN" {
  if (connection === "online") return "UNKNOWN";
  if (connection === "UNKNOWN") return "UNKNOWN";
  return localRecords.length > 0 ? "ready" : "empty";
}
export function localRecordLabel(item: EvidenceItem, locale: Locale): string {
  const label = canonical(item.label);
  return label === "UNKNOWN" ? "UNKNOWN" : `${locale === "fr" ? "Fiche" : "Record"} ${label}`;
}
