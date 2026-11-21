/**
 * Minimum walking times for the two people, from paces they type. A pace is never stored or sent.
 * The times are "at least": they follow a straight line and ignore streets, crossings, slopes,
 * waiting and rests, so a real trip takes longer.
 */
import type { MeetUpRow } from "./meetUp";
import { formatMinutes, minutesAt, parsePace } from "./outingPace";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

/** A pace in km/h for each person, or null when none was given. */
export interface MeetUpPaces {
  readonly a: number | null;
  readonly b: number | null;
}

export const NO_PACES: MeetUpPaces = { a: null, b: null };

export interface MeetUpMinutes {
  readonly a: number | null;
  readonly b: number | null;
  /** The later of the two, only when both are known. */
  readonly later: number | null;
  /** How much sooner the earlier person could be there, only when both are known. */
  readonly spread: number | null;
}

/** Whole minutes, rounded up, for each person who gave a pace. */
export function meetUpMinutes(row: Pick<MeetUpRow, "metresA" | "metresB">, paces: MeetUpPaces): MeetUpMinutes {
  const a = paces.a === null ? null : minutesAt(row.metresA, paces.a);
  const b = paces.b === null ? null : minutesAt(row.metresB, paces.b);
  const both = a !== null && b !== null;
  return { a, b, later: both ? Math.max(a, b) : null, spread: both ? Math.abs(a - b) : null };
}

/** Parses the two typed paces. `error` names which one is wrong; a good one beside a bad one is not used. */
export function readPaces(textA: string, textB: string): { readonly paces: MeetUpPaces; readonly errorA: boolean; readonly errorB: boolean } {
  const a = parsePace(textA);
  const b = parsePace(textB);
  return {
    paces: { a: a.status === "ok" ? a.kmh : null, b: b.status === "ok" ? b.kmh : null },
    errorA: a.status === "invalid",
    errorB: b.status === "invalid",
  };
}

export const hasPace = (p: MeetUpPaces): boolean => p.a !== null || p.b !== null;

const dash = "–";

/** "7 min" or "–" for one person. */
export function meetUpMinutesCell(minutes: number | null): string {
  return minutes === null ? dash : formatMinutes(minutes);
}

/** "At least 4 min for the first person and 7 min for the second." Empty when no pace was given. */
export function meetUpTimeText(m: MeetUpMinutes, locale: Locale): string {
  if (m.a === null && m.b === null) return "";
  const parts: string[] = [];
  if (m.a !== null) parts.push(t(locale, `${formatMinutes(m.a)} for the first person`, `${formatMinutes(m.a)} pour la première personne`));
  if (m.b !== null) parts.push(t(locale, `${formatMinutes(m.b)} for the second person`, `${formatMinutes(m.b)} pour la deuxième personne`));
  const joined = parts.join(t(locale, " and ", " et "));
  return t(locale, `At least ${joined}.`, `Au moins ${joined}.`);
}

/** Said under the table when paces were typed. */
export function meetUpPaceNote(locale: Locale): string {
  return t(
    locale,
    "Times are the least a straight line would take at the pace typed. Streets, crossings, slopes and waiting make a real trip longer. Paces are not saved.",
    "Les durées sont le minimum d’une ligne droite au rythme saisi. Les rues, les traverses, les pentes et l’attente allongent un vrai trajet. Les rythmes ne sont pas enregistrés.",
  );
}
