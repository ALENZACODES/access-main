/**
 * Message catalogue for the search and saved routes, with plural and placeholder
 * handling. French strings are normalised with frTypography at format time, so
 * placeholders such as {n} and {name} are filled with raw values afterwards.
 */
import type { Locale } from "./stateCopy";
import { frTypography } from "./typography";
import { lintCopy, type CopyIssue } from "./copyLint";

export interface PluralForms {
  readonly one: string;
  readonly other: string;
}
export interface Entry {
  readonly en: string | PluralForms;
  readonly fr: string | PluralForms;
}

const DEFS = {
  "search.heading": { en: "Search results", fr: "Résultats de la recherche" },
  "search.matches": {
    en: { one: "{n} place matches your filters.", other: "{n} places match your filters." },
    fr: { one: "{n} lieu correspond à vos filtres.", other: "{n} lieux correspondent à vos filtres." },
  },
  "search.unknownHidden": {
    en: {
      one: "{n} more place has UNKNOWN details for your filters and is not shown.",
      other: "{n} more places have UNKNOWN details for your filters and are not shown.",
    },
    fr: {
      one: "{n} autre lieu a des détails INCONNUS pour vos filtres et n'est pas affiché.",
      other: "{n} autres lieux ont des détails INCONNUS pour vos filtres et ne sont pas affichés.",
    },
  },
  "search.unknownShown": {
    en: { one: "Includes {n} place with UNKNOWN details.", other: "Includes {n} places with UNKNOWN details." },
    fr: { one: "Comprend {n} lieu aux détails INCONNUS.", other: "Comprend {n} lieux aux détails INCONNUS." },
  },
  "search.showUnknown": { en: "Show places with UNKNOWN details", fr: "Afficher les lieux aux détails INCONNUS" },
  "search.hideUnknown": { en: "Hide places with UNKNOWN details", fr: "Masquer les lieux aux détails INCONNUS" },
  "saved.heading": { en: "Saved places", fr: "Lieux enregistrés" },
  "saved.count": {
    en: { one: "{n} saved place.", other: "{n} saved places." },
    fr: { one: "{n} lieu enregistré.", other: "{n} lieux enregistrés." },
  },
  "saved.remove": { en: "Remove {name} from saved places", fr: "Retirer {name} des lieux enregistrés" },
  "place.unknownFor": { en: "UNKNOWN: {features}", fr: "INCONNU : {features}" },
  "place.matchedFor": { en: "Reported yes: {features}", fr: "Signalé oui : {features}" },
  "place.showSource": { en: "Show source", fr: "Afficher la source" },
} as const satisfies Record<string, Entry>;

export type MessageId = keyof typeof DEFS;
export const CATALOG: Readonly<Record<MessageId, Entry>> = DEFS;

export type Params = Readonly<Record<string, string | number>>;

/** English: only 1 is singular. French: 0 and 1 are singular. */
export function pluralCategory(locale: Locale, n: number): "one" | "other" {
  if (locale === "fr") return n >= 0 && n < 2 ? "one" : "other";
  return n === 1 ? "one" : "other";
}

function fill(template: string, params: Params): string {
  return template.replace(/\{([a-zA-Z]+)\}/g, (_, key: string) => {
    const v = params[key];
    if (v === undefined) throw new Error(`Missing message parameter "${key}"`);
    return String(v);
  });
}

function pickTemplate(entry: string | PluralForms, locale: Locale, params: Params): string {
  if (typeof entry === "string") return entry;
  const n = params.n;
  if (typeof n !== "number") throw new Error('Plural message needs a numeric "n" parameter');
  return entry[pluralCategory(locale, n)];
}

export function message(id: MessageId, locale: Locale, params: Params = {}): string {
  const template = pickTemplate(CATALOG[id][locale], locale, params);
  return fill(locale === "fr" ? frTypography(template) : template, params);
}

/** "a", "a and b", "a, b and c" (French: "et"). */
export function listJoin(locale: Locale, items: readonly string[]): string {
  const and = locale === "fr" ? "et" : "and";
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]!} ${and} ${items[1]!}`;
  return `${items.slice(0, -1).join(", ")} ${and} ${items[items.length - 1]!}`;
}

export type CatalogIssue =
  | { readonly id: string; readonly locale: Locale; readonly issue: "empty" | "shape-mismatch" | "placeholder-mismatch" }
  | { readonly id: string; readonly locale: Locale; readonly issue: CopyIssue };

function templatesOf(entry: string | PluralForms): string[] {
  return typeof entry === "string" ? [entry] : [entry.one, entry.other];
}
function placeholdersOf(templates: readonly string[]): string {
  const set = new Set<string>();
  for (const t of templates) for (const m of t.matchAll(/\{([a-zA-Z]+)\}/g)) set.add(m[1]!);
  return [...set].sort().join(",");
}

/** Check a catalogue for empty strings, EN/FR drift, overclaims and French typography. */
export function auditCatalog(catalog: Readonly<Record<string, Entry>>): CatalogIssue[] {
  const issues: CatalogIssue[] = [];
  for (const [id, entry] of Object.entries(catalog)) {
    if (typeof entry.en !== typeof entry.fr) issues.push({ id, locale: "fr", issue: "shape-mismatch" });
    if (placeholdersOf(templatesOf(entry.en)) !== placeholdersOf(templatesOf(entry.fr))) {
      issues.push({ id, locale: "fr", issue: "placeholder-mismatch" });
    }
    for (const locale of ["en", "fr"] as const) {
      for (const raw of templatesOf(entry[locale])) {
        if (raw.trim() === "") issues.push({ id, locale, issue: "empty" });
        const shown = locale === "fr" ? frTypography(raw) : raw;
        for (const i of lintCopy(shown, locale)) issues.push({ id, locale, issue: i });
      }
    }
  }
  return issues;
}
