import { known, type Finding, type Locale } from "./p20ai-trace-model.ts";
/** Bilingual instructions and keyboard-facing diagnostics for journey audits. */
export type Intent = "search" | "clear" | "retry" | "back" | "forward" | "close" | "open" |
  "offline" | "online" | "UNKNOWN" | "loading" | "ready" | "empty" | "error" |
  "source" | "licence" | "date" | "tier" | "download" | "focus" | "cache";
export const COPY: Readonly<Record<Locale, Readonly<Record<Intent, string>>>> = {
  en: {
    search: "Search", clear: "Clear search", retry: "Try again", back: "Go back",
    forward: "Go forward", close: "Close dialog", open: "Open dialog",
    offline: "Offline. Some saved details may be unavailable.", online: "Connection available.",
    UNKNOWN: "UNKNOWN", loading: "Loading results…", ready: "Results are ready.",
    empty: "No results found.", error: "Something went wrong. Try again.",
    source: "Source", licence: "Licence", date: "Retrieved on", tier: "Evidence tier",
    download: "Download a copy", focus: "Keyboard focus", cache: "Saved information",
  },
  fr: {
    search: "Rechercher", clear: "Effacer la recherche", retry: "Réessayer", back: "Retour",
    forward: "Suivant", close: "Fermer la fenêtre de dialogue", open: "Ouvrir la fenêtre de dialogue",
    offline: "Hors ligne. Certains renseignements enregistrés peuvent être indisponibles.",
    online: "Connexion disponible.", UNKNOWN: "UNKNOWN", loading: "Chargement des résultats…",
    ready: "Les résultats sont prêts.", empty: "Aucun résultat trouvé.",
    error: "Une erreur s’est produite. Réessayez.", source: "Source", licence: "Licence",
    date: "Date de consultation", tier: "Niveau de preuve", download: "Télécharger une copie",
    focus: "Focus du clavier", cache: "Informations enregistrées",
  },
};
export type Direction = "forward" | "backward";
export interface KeyEvent {
  readonly key: string;
  readonly beforeId: string | null;
  readonly afterId: string | null;
  readonly defaultPrevented: boolean | null;
  readonly focusVisible: boolean | null;
  readonly scrollBefore: number | null;
  readonly scrollAfter: number | null;
}
export interface Focusable {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly tabIndex: number;
  readonly visible: boolean;
  readonly disabled: boolean;
  readonly inert: boolean;
  readonly width: number | null;
  readonly height: number | null;
  readonly insideDialog: boolean;
}
export interface FocusJourney {
  readonly locale: Locale;
  readonly items: readonly Focusable[];
  readonly strokes: readonly KeyEvent[];
  readonly openDialogId: string | null;
  readonly startingId: string | null;
}
const issue = (code: string, step: number, detail: string): Finding => ({ code, step, detail, severity: "error" });
export function localeCopy(locale: Locale, intent: Intent): string { return COPY[locale][intent]; }
export function localeLabelPattern(locale: Locale, intent: Intent): RegExp {
  const escaped = localeCopy(locale, intent).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}$`, "i");
}
export function languageTag(input: string | null): Locale | null {
  if (!input) return null;
  const match = /^(en|fr)(?:-[a-z0-9]{2,8})*$/i.exec(input.trim());
  const first = match?.[1];
  return first ? first.toLowerCase() as Locale : null;
}
export function typographyProblems(value: string): string[] {
  const problems: string[] = [];
  for (let index = 0; index < value.length; index++) {
    const c = value[index];
    if (c === "'") problems.push("apostrophe");
    if (c === ":" && index > 0 && value[index - 1] !== "\u00a0") problems.push("colon-space");
    if ((c === ";" || c === "?" || c === "!") && index > 0 && value[index - 1] !== "\u202f")
      problems.push("thin-space");
    if (c === "«" && value[index + 1] !== "\u202f") problems.push("opening-guillemet");
    if (c === "»" && value[index - 1] !== "\u202f") problems.push("closing-guillemet");
  }
  return problems;
}
export function copyProblems(): string[] {
  const result: string[] = [];
  const keys = Object.keys(COPY.en) as Intent[];
  for (const key of keys) {
    if (key !== "UNKNOWN" && !known(COPY.en[key])) result.push(`en/${key}:empty`);
    if (key !== "UNKNOWN" && !known(COPY.fr[key])) result.push(`fr/${key}:empty`);
    if (key !== "UNKNOWN" && COPY.en[key] === COPY.fr[key] && key !== "source" && key !== "licence")
      result.push(`pair/${key}:unchanged`);
    result.push(...typographyProblems(COPY.fr[key]).map((problem) => `fr/${key}:${problem}`));
  }
  if (Object.keys(COPY.fr).length !== keys.length) result.push("keys:missing");
  return result;
}
export function eligible(item: Focusable): boolean {
  return item.visible && !item.disabled && !item.inert && item.tabIndex >= 0;
}
export function focusableFindings(item: Focusable, step: number): Finding[] {
  const result: Finding[] = [];
  if (!known(item.id)) result.push(issue("control-id-UNKNOWN", step, item.role));
  if (item.visible && !item.disabled && !known(item.name)) result.push(issue("control-name-UNKNOWN", step, item.id));
  if (!Number.isInteger(item.tabIndex) || item.tabIndex < -1) result.push(issue("control-tabindex", step, item.id));
  if (eligible(item)) {
    if (item.width !== null && (!Number.isFinite(item.width) || item.width < 44))
      result.push(issue("control-width", step, item.id));
    if (item.height !== null && (!Number.isFinite(item.height) || item.height < 44))
      result.push(issue("control-height", step, item.id));
  }
  if (item.inert && item.tabIndex >= 0 && item.visible) result.push(issue("inert-tab-stop", step, item.id));
  return result;
}
export function orderedFocus(items: readonly Focusable[]): Focusable[] {
  const candidates = items.map((item, index) => ({ item, index })).filter(({ item }) => eligible(item));
  const positives = candidates.filter(({ item }) => item.tabIndex > 0)
    .sort((a, b) => a.item.tabIndex - b.item.tabIndex || a.index - b.index);
  const zeros = candidates.filter(({ item }) => item.tabIndex === 0);
  return [...positives, ...zeros].map(({ item }) => item);
}
export function nextFocus(items: readonly Focusable[], current: string | null, direction: Direction): string | null {
  const sequence = orderedFocus(items);
  if (!sequence.length) return null;
  if (current === null) return direction === "forward" ? sequence[0]!.id : sequence[sequence.length - 1]!.id;
  const index = sequence.findIndex((item) => item.id === current);
  if (index < 0) return direction === "forward" ? sequence[0]!.id : sequence[sequence.length - 1]!.id;
  return sequence[(index + (direction === "forward" ? 1 : -1) + sequence.length) % sequence.length]!.id;
}
export function strokeFindings(items: readonly Focusable[], stroke: KeyEvent, step: number): Finding[] {
  const issues: Finding[] = [];
  if (stroke.key === "Tab" || stroke.key === "Shift+Tab") {
    const direction = stroke.key === "Tab" ? "forward" : "backward";
    const destination = nextFocus(items, stroke.beforeId, direction);
    if (destination !== null && stroke.afterId !== destination)
      issues.push(issue("tab-sequence", step, `${stroke.beforeId} -> ${stroke.afterId}; expected ${destination}`));
    if (stroke.focusVisible === false) issues.push(issue("focus-indicator-invisible", step, stroke.afterId ?? "UNKNOWN"));
  }
  if (stroke.key === "Escape" && stroke.afterId === null)
    issues.push(issue("escape-focus-lost", step, stroke.beforeId ?? "UNKNOWN"));
  if (stroke.key.startsWith("Arrow") && stroke.beforeId !== stroke.afterId &&
    stroke.scrollBefore !== null && stroke.scrollAfter !== null && stroke.scrollBefore !== stroke.scrollAfter)
    issues.push(issue("arrow-scroll-leak", step, stroke.key));
  return issues;
}
export function focusJourneyFindings(journey: FocusJourney): Finding[] {
  const issues: Finding[] = [];
  const seen = new Set<string>();
  for (const [index, item] of journey.items.entries()) {
    issues.push(...focusableFindings(item, index));
    if (seen.has(item.id)) issues.push(issue("duplicate-control-id", index, item.id));
    seen.add(item.id);
    if (journey.openDialogId !== null && eligible(item) && !item.insideDialog)
      issues.push(issue("dialog-background-focusable", index, item.id));
  }
  let cursor = journey.startingId;
  for (const [index, stroke] of journey.strokes.entries()) {
    if (cursor !== stroke.beforeId) issues.push(issue("keyboard-trace-disconnected", index, stroke.key));
    issues.push(...strokeFindings(journey.items, stroke, index));
    cursor = stroke.afterId;
  }
  return issues;
}
export interface Announcement {
  readonly text: string;
  readonly locale: Locale;
  readonly priority: "polite" | "assertive" | "off";
  readonly busy: boolean;
  readonly actionAt: number;
  readonly announcedAt: number;
  readonly outcome: "loading" | "ready" | "empty" | "error" | "offline" | "UNKNOWN";
}
export function announcementFindings(items: readonly Announcement[], maxDelayMs = 1500): Finding[] {
  if (!Number.isInteger(maxDelayMs) || maxDelayMs < 1) throw new RangeError("Invalid announcement limit");
  const issues: Finding[] = [];
  for (const [step, record] of items.entries()) {
    if (!known(record.text)) issues.push(issue("announcement-UNKNOWN", step, record.outcome));
    if (!Number.isFinite(record.actionAt) || !Number.isFinite(record.announcedAt))
      issues.push(issue("announcement-invalid-time", step, record.outcome));
    else if (record.announcedAt < record.actionAt) issues.push(issue("announcement-too-early", step, record.outcome));
    else if (record.announcedAt - record.actionAt > maxDelayMs)
      issues.push(issue("announcement-too-late", step, record.outcome));
    if (record.outcome === "error" && record.priority === "off") issues.push(issue("error-silenced", step, record.text));
    if (record.outcome === "loading" && !record.busy) issues.push(issue("loading-not-busy", step, record.text));
    if (record.locale === "fr") issues.push(...typographyProblems(record.text).map((code) => issue(`fr-${code}`, step, record.text)));
  }
  return issues;
}
export function localizedStatus(locale: Locale, outcome: Announcement["outcome"]): string {
  return localeCopy(locale, outcome);
}
