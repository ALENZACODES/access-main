/**
 * Says, in plain words, how a search was read, so a mistake shows before it costs a search. It describes
 * the search only. It never says what the places found are like.
 */
import { nearestTagLabel } from "./packNearest";
import { type ParsedSearch, type SearchHasKey, type SearchProblem, type SearchTerm } from "./packSearchParse";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

/** A value the person typed, in quotation marks of the language. */
export function searchQuoted(value: string, locale: Locale): string {
  return locale === "fr" ? `«\u202f${value}\u202f»` : `“${value}”`;
}

function subject(term: Extract<SearchTerm, { type: "text" }>, locale: Locale): string {
  switch (term.field) {
    case "any":
      return t(locale, "Name, address or kind", "Le nom, l’adresse ou le genre");
    case "name":
      return t(locale, "Name", "Le nom");
    case "address":
      return t(locale, "Address", "L’adresse");
    case "kind":
      return t(locale, "Kind", "Le genre");
    case "note":
      return t(locale, "Note", "La note");
  }
}

const HAS_EN: Readonly<Record<SearchHasKey, string>> = {
  note: "a note", address: "an address", name: "a name", kind: "a kind", tag: "a wheelchair tag other than UNKNOWN", source: "a source", location: "a map point",
};
const HAS_FR: Readonly<Record<SearchHasKey, string>> = {
  note: "une note", address: "une adresse", name: "un nom", kind: "un genre", tag: "une indication pour fauteuil roulant autre que UNKNOWN", source: "une source", location: "un point sur la carte",
};

/**
 * One term as a fragment: "name, address or kind contains “cafe”". What was typed is added as it is: it is
 * never passed through `t`, whose French typography would change colons, apostrophes and question marks in it.
 */
export function describeSearchTerm(term: SearchTerm, locale: Locale): string {
  if (term.type === "tag") {
    const word = nearestTagLabel(term.value, locale);
    return term.negated
      ? `${t(locale, "wheelchair tag is not", "l’indication pour fauteuil roulant n’est pas")} ${word}`
      : `${t(locale, "wheelchair tag is", "l’indication pour fauteuil roulant est")} ${word}`;
  }
  if (term.type === "has") {
    return term.negated ? t(locale, `has no ${HAS_EN[term.key].replace(/^an? /, "")}`, `n’a pas ${HAS_FR[term.key]}`) : t(locale, `has ${HAS_EN[term.key]}`, `a ${HAS_FR[term.key]}`);
  }
  const s = subject(term, locale);
  const lower = s.charAt(0).toLowerCase() + s.slice(1);
  const verb = term.negated ? t(locale, "does not contain", "ne contient pas") : t(locale, "contains", "contient");
  return `${lower} ${verb} ${searchQuoted(term.value, locale)}`;
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** One line per required clause. Alternatives are joined with "or". */
export function explainSearchClauses(parsed: ParsedSearch, locale: Locale): string[] {
  return parsed.clauses.map((c) => capital(c.alternatives.map((a) => describeSearchTerm(a, locale)).join(t(locale, ", or ", ", ou "))));
}

const FIELD_HINT_EN = "Search words with a colon are: name, address, street, kind, tag, note, has, no.";
const FIELD_HINT_FR = "Les mots de recherche avec deux-points sont\u00a0: nom, adresse, rue, genre, indication, note, avec, sans.";

const askMark = (locale: Locale): string => (locale === "fr" ? "\u202f?" : "?");

export function describeSearchProblem(p: SearchProblem, locale: Locale): string {
  const typed = searchQuoted(p.text, locale);
  const maybe = p.suggestion === null ? "" : ` ${t(locale, "Did you mean", "Vouliez-vous dire")} ${searchQuoted(p.suggestion, locale)}${askMark(locale)}`;
  switch (p.kind) {
    case "unknown-field":
      return `${typed} ${t(locale, "is not a search word here, so it was searched for as plain text.", "n’est pas un mot de recherche ici\u00a0: il a été cherché comme du texte.")}${maybe} ${t(locale, FIELD_HINT_EN, FIELD_HINT_FR)}`;
    case "bad-tag-value":
      return `${typed} ${t(locale, "was left out: that is not a wheelchair tag. Use yes, limited, no, designated or unknown.", "a été ignoré\u00a0: ce n’est pas une indication pour fauteuil roulant. Utilisez oui, limite, non, designe ou unknown.")}${maybe}`;
    case "bad-has-value":
      return `${typed} ${t(locale, "was left out: it does not name a detail. Use note, address, name, kind, tag, source or location.", "a été ignoré\u00a0: il ne désigne aucun détail. Utilisez note, adresse, nom, genre, indication, source ou position.")}${maybe}`;
    case "empty-value":
      return `${typed} ${t(locale, "was left out because nothing follows the colon.", "a été ignoré, car rien ne suit les deux-points.")}`;
    case "open-quote":
      return t(locale, "A quotation mark was not closed, so the rest of the search is read as one phrase.", "Un guillemet n’est pas fermé\u00a0: la suite de la recherche est lue comme une seule expression.");
    case "dangling-or":
      return t(locale, "An OR at the start or the end joins nothing, so it was left out.", "Un OU au début ou à la fin ne relie rien\u00a0: il a été ignoré.");
    case "too-many-terms":
      return t(locale, "The search has too many parts. The first ones were used and the rest were left out.", "La recherche compte trop d’éléments\u00a0: les premiers ont servi, les autres ont été ignorés.");
    case "too-long":
      return t(locale, "The search is too long. Only its first part was used.", "La recherche est trop longue\u00a0: seul le début a servi.");
  }
}

export interface SearchExplanation {
  /** What the search asks for, one line per required part. */
  readonly lines: readonly string[];
  /** What went wrong, one line per mistake. */
  readonly problems: readonly string[];
}

/** Nothing to say for an empty search or one made of plain words only. */
export function explainPackSearch(parsed: ParsedSearch, locale: Locale): SearchExplanation | null {
  if (!parsed.usesOperators) return null;
  return { lines: explainSearchClauses(parsed, locale), problems: parsed.problems.map((p) => describeSearchProblem(p, locale)) };
}
