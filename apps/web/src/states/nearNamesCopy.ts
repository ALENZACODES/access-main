/** Words and files for names that are one slip apart. A pair is only a pair to look at. */
import { csvCell } from "./exportData";
import type { NearNamePair, NearNameResult, NearRelation } from "./nearNames";
import { placesCount } from "./sameNameCopy";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

export const NEAR_NAMES_CSV_FILENAMES: Readonly<Record<Locale, string>> = { en: "names-one-letter-apart.csv", fr: "noms-a-une-lettre-pres.csv" };

export function nearNamesCaveat(locale: Locale): string {
  return t(
    locale,
    "These names are one letter apart. They may be one name spelled two ways, or two different places. Only a look at the places can tell.",
    "Ces noms diffèrent d’une lettre. Ils peuvent être un même nom écrit de deux façons, ou deux lieux différents. Seul un coup d’œil aux lieux peut le dire.",
  );
}

export function nearRelationText(r: NearRelation, locale: Locale): string {
  switch (r) {
    case "missing":
      return t(locale, "one letter more", "une lettre de plus");
    case "different":
      return t(locale, "one letter different", "une lettre différente");
    case "swapped":
      return t(locale, "two letters swapped", "deux lettres permutées");
  }
}

/** "Tim Hortons (3 places) and Tim Horton (1 place): one letter more in the first." */
export function nearPairText(p: NearNamePair, locale: Locale): string {
  const a = `${p.a.label} (${placesCount(p.a.count, locale)})`;
  const b = `${p.b.label} (${placesCount(p.b.count, locale)})`;
  const where = p.relation === "missing" ? t(locale, " in the first", " dans le premier") : "";
  return t(locale, `${a} and ${b}: ${nearRelationText(p.relation, locale)}${where}.`, `${a} et ${b}\u00a0: ${nearRelationText(p.relation, locale)}${where}.`);
}

export function nearNamesSummary(r: NearNameResult, locale: Locale): string {
  if (r.pairs.length === 0) return t(locale, "No two names on screen are one letter apart.", "Aucun nom affiché ne diffère d’une seule lettre d’un autre.");
  const n = r.pairs.length + r.leftOut;
  const head = n === 1 ? t(locale, "1 pair of names is one letter apart.", "1 paire de noms diffère d’une lettre.") : t(locale, `${n} pairs of names are one letter apart.`, `${n} paires de noms diffèrent d’une lettre.`);
  return r.leftOut > 0 ? t(locale, `${head} The first ${r.pairs.length} are listed.`, `${head} Les ${r.pairs.length} premières sont affichées.`) : head;
}

export function nearNamesToText(r: NearNameResult, locale: Locale): string {
  const out = [t(locale, "Names that are one letter apart", "Noms qui diffèrent d’une lettre"), "", nearNamesCaveat(locale), nearNamesSummary(r, locale), ""];
  for (const p of r.pairs) out.push(`- ${nearPairText(p, locale)}`);
  return `${out.join("\n").replace(/\n+$/, "")}\n`;
}

/** One row per pair, with the ids of the places behind each name. */
export function nearNamesToCsv(r: NearNameResult, locale: Locale): string {
  const header = [t(locale, "First name", "Premier nom"), t(locale, "Places with the first name", "Lieux du premier nom"), t(locale, "First ids", "Identifiants du premier"), t(locale, "Second name", "Deuxième nom"), t(locale, "Places with the second name", "Lieux du deuxième nom"), t(locale, "Second ids", "Identifiants du deuxième"), t(locale, "How they differ", "Différence")].map(csvCell).join(",");
  const rows = r.pairs.map((p) => [p.a.label, String(p.a.count), p.a.ids.join(" "), p.b.label, String(p.b.count), p.b.ids.join(" "), nearRelationText(p.relation, locale)].map(csvCell).join(","));
  return `\uFEFF${[header, ...rows].join("\r\n")}\r\n`;
}
