/** The help numbers a person sees for a search and an order. Worked out from the saved records only. */
import { type ContactReading, readContact } from "./helpContact";
import { type PickedText, pickText } from "./helpText";
import type { HelpNumber } from "./packHelp";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

export type HelpSort = "pack" | "name";
export const HELP_SORTS: readonly HelpSort[] = ["pack", "name"];
export function isHelpSort(v: unknown): v is HelpSort {
  return typeof v === "string" && (HELP_SORTS as readonly string[]).includes(v);
}

export interface HelpQuery {
  readonly text: string;
  readonly sort: HelpSort;
}
export const EMPTY_HELP_QUERY: HelpQuery = { text: "", sort: "pack" };

export interface HelpRow {
  readonly item: HelpNumber;
  readonly name: PickedText | null;
  readonly how: PickedText | null;
  readonly reading: ContactReading | null;
}

export interface HelpView {
  readonly rows: readonly HelpRow[];
  readonly shown: number;
  readonly total: number;
  readonly announcement: string;
}

/** Lower case, no accents, single spaces. */
export function foldHelpText(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function rowFor(item: HelpNumber, locale: Locale): HelpRow {
  return { item, name: pickText(item.name, locale), how: pickText(item.how, locale), reading: item.contact === null ? null : readContact(item.contact) };
}

/** Both languages and the digits are searched, so a French name is found from an English page. */
function haystack(r: HelpRow): string {
  const i = r.item;
  return foldHelpText([i.name.en ?? "", i.name.fr ?? "", i.how.en ?? "", i.how.fr ?? "", i.contact ?? "", r.reading?.digits ?? "", i.id].join(" "));
}

export function matchesHelp(row: HelpRow, text: string): boolean {
  const words = foldHelpText(text).split(" ").filter((w) => w !== "");
  if (words.length === 0) return true;
  const h = haystack(row);
  return words.every((w) => h.includes(w));
}

export function viewHelp(items: readonly HelpNumber[], query: HelpQuery, locale: Locale): HelpView {
  const all = items.map((i) => rowFor(i, locale));
  const kept = all.filter((r) => matchesHelp(r, query.text));
  if (query.sort === "name") {
    const c = new Intl.Collator(locale === "fr" ? "fr-CA" : "en-CA", { numeric: true, sensitivity: "base" });
    kept.sort((a, b) => {
      if ((a.name === null) !== (b.name === null)) return a.name === null ? 1 : -1;
      return c.compare(a.name?.text ?? "", b.name?.text ?? "") || c.compare(a.item.id, b.item.id);
    });
  }
  return { rows: kept, shown: kept.length, total: all.length, announcement: announceHelp(kept.length, all.length, locale) };
}

export function announceHelp(shown: number, total: number, locale: Locale): string {
  if (total === 0) return t(locale, "No help numbers are saved.", "Aucun numéro d’aide n’est enregistré.");
  if (shown === 0) return t(locale, `No help numbers match. ${total} saved.`, `Aucun numéro d’aide ne correspond. ${total} enregistré${total === 1 ? "" : "s"}.`);
  if (shown === total) return t(locale, `${total} help ${total === 1 ? "number" : "numbers"} shown.`, `${total} ${total === 1 ? "numéro d’aide affiché" : "numéros d’aide affichés"}.`);
  return t(locale, `${shown} of ${total} help numbers shown.`, `${shown} numéros d’aide affichés sur ${total}.`);
}
