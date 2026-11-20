/** The search tips: examples to try, and the words around them, in English and French. */
import { searchQuoted } from "./packSearchExplain";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

export interface SearchExample {
  /** The search text to put in the box. */
  readonly text: string;
  /** What it asks for, in a sentence. */
  readonly meaning: string;
}

export function searchExamples(locale: Locale): SearchExample[] {
  if (locale === "fr") {
    return [
      { text: "cafe OU bar", meaning: "Le nom, l’adresse ou le genre contient cafe, ou bar." },
      { text: "\"main street\"", meaning: "Les mots dans cet ordre, comme une seule expression." },
      { text: "genre:restaurant -fast", meaning: "Le genre contient restaurant, et on écarte ce qui contient fast." },
      { text: "indication:oui avec:note", meaning: "L’indication est Oui et le lieu a une note." },
      { text: "note:washroom", meaning: "La note contient washroom\u00a0: les notes sont cherchées dans la langue où elles ont été écrites." },
      { text: "rue:dundas", meaning: "L’adresse contient dundas." },
      { text: "sans:adresse", meaning: "Les lieux sans adresse." },
    ];
  }
  return [
    { text: "cafe OR bar", meaning: "Name, address or kind contains cafe, or bar." },
    { text: "\"main street\"", meaning: "The words in that order, as one phrase." },
    { text: "kind:restaurant -fast", meaning: "Kind contains restaurant, and anything containing fast is left out." },
    { text: "tag:yes has:note", meaning: "Wheelchair tag is Yes and the place has a note." },
    { text: "note:washroom", meaning: "The note contains washroom." },
    { text: "street:dundas", meaning: "The address contains dundas." },
    { text: "no:address", meaning: "Places with no address." },
  ];
}

export function searchHelpHeading(locale: Locale): string {
  return t(locale, "Search tips", "Conseils de recherche");
}

export function searchHelpToggle(open: boolean, locale: Locale): string {
  return open ? t(locale, "Hide the search tips", "Masquer les conseils de recherche") : t(locale, "Show the search tips", "Afficher les conseils de recherche");
}

export function searchHelpIntro(locale: Locale): string {
  return t(
    locale,
    "Words work as before: every word has to be in the name, address or kind. You can also use quotation marks for a phrase, a minus sign to leave something out, OR for either, and a word with a colon to look at one detail only. The line under the search box says how your search was read.",
    "Les mots fonctionnent comme avant\u00a0: chacun doit se trouver dans le nom, l’adresse ou le genre. Vous pouvez aussi mettre des guillemets pour une expression, un signe moins pour écarter quelque chose, OU pour l’un ou l’autre, et un mot suivi de deux-points pour ne regarder qu’un détail. La ligne sous la zone de recherche indique comment votre recherche a été comprise.",
  );
}

export function searchTryLabel(locale: Locale): string {
  return t(locale, "Try this search", "Essayer cette recherche");
}

export function searchExampleCount(n: number, locale: Locale): string {
  return t(locale, `${n} ${n === 1 ? "place" : "places"} in the pack`, `${n} ${n === 1 ? "lieu" : "lieux"} dans le pack`);
}

export function searchEchoHeading(locale: Locale): string {
  return t(locale, "How your search is read", "Comment votre recherche est comprise");
}

export function searchProblemsHeading(locale: Locale): string {
  return t(locale, "Left out or changed", "Ignoré ou modifié");
}

export function searchWhyHeading(locale: Locale): string {
  return t(locale, "Why nothing matched", "Pourquoi rien ne correspond");
}

export function searchWhyIntro(locale: Locale): string {
  return t(
    locale,
    "Each part of your search is counted on its own. This only counts places in the pack; it does not say which part is wrong.",
    "Chaque partie de votre recherche est comptée séparément. Cela ne fait que compter les lieux du pack\u00a0: cela ne dit pas quelle partie est fautive.",
  );
}

/** "“tag:no” finds 1 place on its own. Without it, the search finds 2 places." What was typed is added as it is, outside `t`. */
export function searchWhyLine(typed: string, alone: number, without: number, locale: Locale): string {
  const q = searchQuoted(typed, locale);
  const place = (n: number) => t(locale, n === 1 ? "place" : "places", n === 1 ? "lieu" : "lieux");
  return `${q} ${t(locale, `finds ${alone} ${place(alone)} on its own. Without it, the search finds ${without} ${place(without)}.`, `trouve ${alone} ${place(alone)} à lui seul. Sans lui, la recherche trouve ${without} ${place(without)}.`)}`;
}

export function searchWhyTakeOut(typed: string, locale: Locale): string {
  return `${t(locale, "Take out", "Retirer")} ${searchQuoted(typed, locale)}`;
}

export function searchWhyNoSingle(locale: Locale): string {
  return t(locale, "Taking out any one part still finds nothing.", "Retirer une seule partie ne trouve toujours rien.");
}
