/**
 * Move the shortlist from one device to another without an account: the list becomes a short block
 * of text (a "list code") that can be pasted into a message, and a pasted code becomes a plan of
 * what would be added. The code holds place ids and names only, nothing about the person. A code
 * is checked against the pack on this device before anything is added: ids the pack does not
 * hold, places already listed and places past the limit are counted and left out, never guessed.
 */
import { MAX_SHORTLIST, isShortlistId } from "./shortlist";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

export const LIST_CODE_HEADER = "LIST v1";
/** A pasted code is cut here, so a very large paste cannot make the page slow. */
export const MAX_CODE_CHARS = 20_000;
export const MAX_CODE_LINES = 200;

const UNKNOWN = "UNKNOWN";
// eslint-disable-next-line no-control-regex -- control characters are exactly what is removed
const CONTROL = /[\u0000-\u001F\u007F\u2028\u2029\u202A-\u202E\u2066-\u2069]/g;
const LINE = /^\s*(?:[-*\u2022]|\d{1,3}[.)])?\s*([^\s|]+)\s*\|/;

export interface CodePlace {
  readonly id: string;
  readonly name: string | null;
}

/** One line per place: `- id | name`. The name is for the reader; only the id is used when the code is read back. */
export function listToCode(places: readonly CodePlace[]): string {
  const lines = places.filter((p) => isShortlistId(p.id)).map((p) => `- ${p.id} | ${(p.name ?? UNKNOWN).replace(CONTROL, " ").replace(/\|/g, "/").replace(/\s+/g, " ").trim() || UNKNOWN}`);
  return `${[LIST_CODE_HEADER, ...lines].join("\n")}\n`;
}

export interface ParsedCode {
  /** Valid ids in the order written, each once. */
  readonly ids: readonly string[];
  /** Non-empty lines that were not a header or a place line, plus place lines with an invalid id. */
  readonly ignored: number;
  readonly hadHeader: boolean;
  /** True when the paste was longer than the limits and was cut. */
  readonly cut: boolean;
}

export function parseListCode(text: string): ParsedCode {
  const cut = text.length > MAX_CODE_CHARS;
  const rawLines = text.slice(0, MAX_CODE_CHARS).split(/\r\n|\r|\n/);
  const tooManyLines = rawLines.length > MAX_CODE_LINES;
  const lines = rawLines.slice(0, MAX_CODE_LINES);
  const seen = new Set<string>();
  const ids: string[] = [];
  let ignored = 0;
  let hadHeader = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") continue;
    if (line === LIST_CODE_HEADER) {
      hadHeader = true;
      continue;
    }
    const m = LINE.exec(line);
    if (m === null || !isShortlistId(m[1])) {
      ignored += 1;
      continue;
    }
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      ids.push(m[1]);
    }
  }
  return { ids, ignored, hadHeader, cut: cut || tooManyLines };
}

export interface ImportPlan {
  /** In the order of the code, up to the room left in the list. */
  readonly toAdd: readonly string[];
  readonly alreadyListed: readonly string[];
  readonly notInPack: readonly string[];
  /** Ids the pack holds that would not fit; they are left out, not swapped for others. */
  readonly overCapacity: readonly string[];
}

export function planImport(ids: readonly string[], listedIds: readonly string[], packIds: ReadonlySet<string>, limit = MAX_SHORTLIST): ImportPlan {
  const listed = new Set(listedIds);
  const alreadyListed: string[] = [];
  const notInPack: string[] = [];
  const fits: string[] = [];
  for (const id of ids) {
    if (listed.has(id)) alreadyListed.push(id);
    else if (!packIds.has(id)) notInPack.push(id);
    else fits.push(id);
  }
  const room = Math.max(0, limit - listed.size);
  return { toAdd: fits.slice(0, room), alreadyListed, notInPack, overCapacity: fits.slice(room) };
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** What reading the code found, as sentences. Counts only: nothing here says a place is good to add. */
export function importSummary(plan: ImportPlan, parsed: ParsedCode, locale: Locale): string {
  if (parsed.ids.length === 0) {
    return t(locale, "No places found in this text. A list code starts with LIST v1 and has one line for each place.", "Aucun lieu trouvé dans ce texte. Un code de liste commence par LIST v1 et compte une ligne par lieu.");
  }
  const parts = [t(locale, `${plural(plan.toAdd.length, "place", "places")} would be added.`, `${plural(plan.toAdd.length, "lieu serait ajouté", "lieux seraient ajoutés")}.`)];
  if (plan.alreadyListed.length > 0) parts.push(t(locale, `${plural(plan.alreadyListed.length, "is", "are")} already on your list.`, `${plural(plan.alreadyListed.length, "est déjà", "sont déjà")} dans votre liste.`));
  if (plan.notInPack.length > 0) parts.push(t(locale, `${plural(plan.notInPack.length, "is", "are")} not in the pack on this device.`, `${plural(plan.notInPack.length, "n’est pas", "ne sont pas")} dans le pack de cet appareil.`));
  if (plan.overCapacity.length > 0) parts.push(t(locale, `${plural(plan.overCapacity.length, "does", "do")} not fit: a list holds at most ${MAX_SHORTLIST} places.`, `${plural(plan.overCapacity.length, "ne tient pas", "ne tiennent pas")}\u00a0: une liste compte au plus ${MAX_SHORTLIST} lieux.`));
  if (parsed.ignored > 0) parts.push(t(locale, `${plural(parsed.ignored, "line was", "lines were")} not understood and left out.`, `${plural(parsed.ignored, "ligne n’a pas été comprise", "lignes n’ont pas été comprises")} et ${parsed.ignored === 1 ? "a été laissée" : "ont été laissées"} de côté.`));
  if (parsed.cut) parts.push(t(locale, "The text was long, so only the start was read.", "Le texte était long\u00a0: seul le début a été lu."));
  return parts.join(" ");
}
