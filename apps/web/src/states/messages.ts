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
  "map.heading": { en: "Places", fr: "Lieux" },
  "map.note": {
    en: "Shown as a list. The App loads no map tiles.",
    fr: "Affichage sous forme de liste. L'App ne charge aucune tuile de carte.",
  },
  "map.locationUnknown": { en: "Location UNKNOWN", fr: "Emplacement INCONNU" },
  "map.coordinates": { en: "Coordinates: {lat}, {lon}", fr: "Coordonnées : {lat}, {lon}" },
  "map.distance": { en: "{d} away", fr: "à {d}" },
  "map.openInMaps": { en: "Open {name} in your maps app", fr: "Ouvrir {name} dans votre application de cartes" },
  "map.unlocated": {
    en: { one: "{n} place has no recorded location.", other: "{n} places have no recorded location." },
    fr: { one: "{n} lieu n'a aucun emplacement enregistré.", other: "{n} lieux n'ont aucun emplacement enregistré." },
  },
  "compare.heading": { en: "Compare places", fr: "Comparer des lieux" },
  "compare.detail": { en: "Detail", fr: "Détail" },
  "compare.caption": { en: "Reported details for {names}", fr: "Détails signalés pour {names}" },
  "compare.differs": { en: "Not the same for every place", fr: "Pas identique pour tous les lieux" },
  "compare.needTwo": { en: "Choose at least two places to compare.", fr: "Choisissez au moins deux lieux à comparer." },
  "compare.max": {
    en: "You can compare up to {n} places. Extra places are not shown.",
    fr: "Vous pouvez comparer jusqu'à {n} lieux. Les lieux en trop ne sont pas affichés.",
  },
  "compare.missing": {
    en: { one: "{n} place could not be found and is not shown.", other: "{n} places could not be found and are not shown." },
    fr: { one: "{n} lieu est introuvable et n'est pas affiché.", other: "{n} lieux sont introuvables et ne sont pas affichés." },
  },
  "sources.heading": { en: "Sources and licences", fr: "Sources et licences" },
  "sources.intro": {
    en: "Each detail shown in the App has a recorded source, open licence and retrieval date.",
    fr: "Chaque détail affiché dans l'App a une source, une licence ouverte et une date de consultation enregistrées.",
  },
  "sources.caption": { en: "Sources of the details in the App", fr: "Sources des détails de l'App" },
  "sources.colSource": { en: "Source", fr: "Source" },
  "sources.colLicence": { en: "Licence", fr: "Licence" },
  "sources.colDetails": { en: "Details", fr: "Détails" },
  "sources.colLatest": { en: "Latest retrieval", fr: "Dernière consultation" },
  "sources.empty": { en: "No sources are recorded yet.", fr: "Aucune source n'est encore enregistrée." },
  "report.heading": { en: "Suggest a correction", fr: "Proposer une correction" },
  "report.intro": {
    en: "Your suggestion is saved on this device and sent when you are online. It does not change the details shown.",
    fr: "Votre suggestion est enregistrée sur cet appareil et envoyée lorsque vous êtes en ligne. Elle ne modifie pas les détails affichés.",
  },
  "report.place": { en: "Place: {name}", fr: "Lieu : {name}" },
  "report.feature": { en: "Detail", fr: "Détail" },
  "report.suggested": { en: "What should it say?", fr: "Que devrait-il indiquer ?" },
  "report.note": { en: "Note (optional)", fr: "Remarque (facultative)" },
  "report.contact": { en: "Email for follow-up (optional)", fr: "Courriel pour un suivi (facultatif)" },
  "report.consent": { en: "You may email me about this suggestion", fr: "Vous pouvez m'écrire au sujet de cette suggestion" },
  "report.submit": { en: "Save suggestion", fr: "Enregistrer la suggestion" },
  "report.choose": { en: "Choose", fr: "Choisir" },
  "report.errorSummary": {
    en: { one: "There is {n} problem with the form.", other: "There are {n} problems with the form." },
    fr: { one: "Le formulaire contient {n} problème.", other: "Le formulaire contient {n} problèmes." },
  },
  "report.err.place": { en: "This place could not be found.", fr: "Ce lieu est introuvable." },
  "report.err.feature": { en: "Choose a detail.", fr: "Choisissez un détail." },
  "report.err.suggested": { en: "Choose what it should say.", fr: "Choisissez ce qu'il devrait indiquer." },
  "report.err.note": { en: "The note is too long.", fr: "La remarque est trop longue." },
  "report.err.contact": { en: "Enter a valid email address.", fr: "Saisissez une adresse courriel valide." },
  "report.err.consent": {
    en: "Tick the box if you want to be contacted, or remove the email.",
    fr: "Cochez la case si vous souhaitez être joint, ou retirez le courriel.",
  },
  "report.saved": { en: "Suggestion saved on this device.", fr: "Suggestion enregistrée sur cet appareil." },
  "report.queueFull": {
    en: "Too many suggestions are waiting to be sent. Try again later.",
    fr: "Trop de suggestions attendent d'être envoyées. Réessayez plus tard.",
  },
  "report.opt.yes": { en: "Yes", fr: "Oui" },
  "report.opt.no": { en: "No", fr: "Non" },
  "report.opt.partial": { en: "Partly", fr: "En partie" },
  "report.opt.unknown": { en: "UNKNOWN", fr: "INCONNU" },
  "settings.heading": { en: "Display settings", fr: "Paramètres d'affichage" },
  "settings.language": { en: "Language", fr: "Langue" },
  "settings.language.auto": { en: "Match my browser", fr: "Selon mon navigateur" },
  "settings.theme": { en: "Colour theme", fr: "Thème de couleurs" },
  "settings.theme.light": { en: "Light", fr: "Clair" },
  "settings.theme.dark": { en: "Dark", fr: "Sombre" },
  "settings.theme.system": { en: "Match my device", fr: "Selon mon appareil" },
  "settings.textSize": { en: "Text size", fr: "Taille du texte" },
  "settings.motion": { en: "Reduce motion", fr: "Réduire les animations" },
  "settings.save": { en: "Save settings", fr: "Enregistrer les paramètres" },
  "settings.saved": { en: "Settings saved on this device.", fr: "Paramètres enregistrés sur cet appareil." },
  "settings.err": { en: "Some settings were not valid and were reset.", fr: "Certains paramètres n'étaient pas valides et ont été réinitialisés." },
  "nav.main": { en: "Main", fr: "Principale" },
  "nav.skip": { en: "Skip to main content", fr: "Passer au contenu principal" },
  "nav.search": { en: "Search", fr: "Recherche" },
  "nav.map": { en: "Map", fr: "Carte" },
  "nav.saved": { en: "Saved", fr: "Enregistrés" },
  "nav.compare": { en: "Compare", fr: "Comparer" },
  "nav.sources": { en: "Sources", fr: "Sources" },
  "nav.settings": { en: "Settings", fr: "Paramètres" },
  "app.name": { en: "the App", fr: "l'App" },
  "footer.note": {
    en: "Details are reported by their sources and may be incomplete or out of date. UNKNOWN means no detail is recorded.",
    fr: "Les détails sont signalés par leurs sources et peuvent être incomplets ou périmés. INCONNU signifie qu'aucun détail n'est enregistré.",
  },
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
