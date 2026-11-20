/**
 * A large-print handout of the listed places, for reading on paper or a big screen and for
 * handing to someone who does not use the App. It says what the pack reports, place by place, in
 * the list's own order. It does not rank, recommend or promise anything: a detail the pack does
 * not give is UNKNOWN, and the foot of the page says it is not a check of the place.
 */
import { OSM_CREDIT } from "./dataCredits";
import type { PackPlaceRecord } from "./packPlaces";
import { buildPlaceSheet, UNKNOWN, type SheetField } from "./placeSheet";
import { formatDate, isStale } from "./provenance";
import { questionsFor } from "./visitQuestions";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

export const HANDOUT_SIZES = ["standard", "large", "xlarge"] as const;
export type HandoutSize = (typeof HANDOUT_SIZES)[number];
/** Body text size in points. Standard is the common minimum for comfortable reading; large and extra large are for low vision. */
export const SIZE_POINTS: Readonly<Record<HandoutSize, number>> = { standard: 14, large: 18, xlarge: 24 };

export interface HandoutOptions {
  readonly size: HandoutSize;
  /** The pack's own note for a place, when it has one. */
  readonly notes: boolean;
  /** The map point as numbers, for a person who will type it into a maps app. */
  readonly mapPoints: boolean;
  /** Where each detail came from, its licence and when it was retrieved. */
  readonly sources: boolean;
  /** Questions to put to the place before going, each with room to write the answer. Off by default: they are prompts, not findings. */
  readonly questions: boolean;
}

export const DEFAULT_HANDOUT: HandoutOptions = { size: "large", notes: true, mapPoints: true, sources: true, questions: false };

export const HANDOUT_FILENAMES: Readonly<Record<Locale, string>> = { en: "large-print-list.html", fr: "liste-en-gros-caracteres.html" };

/** Options from untrusted input (a saved value, a query). Each bad or missing field falls back to its default, on its own. */
export function parseHandoutOptions(raw: unknown): HandoutOptions {
  const src = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  // Own properties only: a value inherited from a prototype is not something the caller chose.
  const o: Record<string, unknown> = {};
  for (const k of ["size", "notes", "mapPoints", "sources", "questions"]) if (Object.hasOwn(src, k)) o[k] = src[k];
  const size = HANDOUT_SIZES.find((s) => s === o["size"]) ?? DEFAULT_HANDOUT.size;
  const flag = (k: "notes" | "mapPoints" | "sources" | "questions"): boolean => (typeof o[k] === "boolean" ? (o[k] as boolean) : DEFAULT_HANDOUT[k]);
  return { size, notes: flag("notes"), mapPoints: flag("mapPoints"), sources: flag("sources"), questions: flag("questions") };
}

export interface HandoutLine {
  readonly label: string;
  readonly value: string;
  readonly known: boolean;
}

export interface HandoutEntry {
  readonly id: string;
  readonly heading: string;
  readonly lines: readonly HandoutLine[];
  readonly note: string | null;
  /** The question texts, in the order the visit plan gives them; empty unless the option is on. */
  readonly questions: readonly string[];
}

export interface Handout {
  readonly locale: Locale;
  readonly size: HandoutSize;
  readonly title: string;
  readonly intro: string;
  readonly entries: readonly HandoutEntry[];
  /** Closing lines, each its own paragraph. */
  readonly footer: readonly string[];
  readonly madeOn: string;
}

const LINE_FIELDS: readonly SheetField[] = ["tag", "kind", "address"];

export function handoutTitle(count: number, locale: Locale): string {
  return t(locale, count === 1 ? "My place" : `My ${count} places`, count === 1 ? "Mon lieu" : `Mes ${count} lieux`);
}

export function buildHandout(places: readonly PackPlaceRecord[], locale: Locale, today: string, options: HandoutOptions = DEFAULT_HANDOUT): Handout {
  const entries: HandoutEntry[] = places.map((p) => {
    const sheet = buildPlaceSheet(p, locale, today);
    const row = (f: SheetField) => sheet.rows.find((r) => r.field === f)!;
    const lines: HandoutLine[] = LINE_FIELDS.map((f) => ({ label: row(f).label, value: row(f).value, known: row(f).known }));
    if (options.mapPoints) lines.push({ label: row("position").label, value: row("position").value, known: row("position").known });
    if (options.sources) {
      const parts = [row("source"), row("licence"), row("retrieved")];
      const known = parts.every((r) => r.known);
      lines.push({
        label: t(locale, "Where it comes from", "D’où cela vient"),
        value: parts.every((r) => !r.known) ? UNKNOWN : parts.map((r) => r.value).join("; "),
        known,
      });
    }
    const note = options.notes && p.note ? p.note : null;
    const questions = options.questions ? questionsFor(p, locale, today).map((q) => q.text) : [];
    return { id: p.id, heading: sheet.title, lines, note, questions };
  });

  const stale = places.filter((p) => p.provenance !== null && isStale(p.provenance.retrievedOn, today)).length;
  const footer = [
    t(locale, `Made on ${formatDate(today, locale)} from the offline pack on this device.`, `Créé le ${formatDate(today, locale)} à partir du pack hors ligne sur cet appareil.`),
    t(locale, "This is what the pack reports and not a check of the place. Details may have changed since they were retrieved.", "Ceci est ce que le pack indique, pas un contrôle du lieu. Les détails ont pu changer depuis leur récupération."),
  ];
  if (stale > 0) footer.push(t(locale, `${stale} of these places have details retrieved over a year ago.`, `${stale} de ces lieux ont des détails récupérés il y a plus d’un an.`));
  if (places.some((p) => p.provenance !== null && /openstreetmap/i.test(p.provenance.source))) footer.push(OSM_CREDIT);

  return {
    locale,
    size: options.size,
    title: handoutTitle(places.length, locale),
    intro: t(locale, "Wheelchair details from the offline pack, in the order I listed them. UNKNOWN means the pack does not say.", "Détails sur l’accès en fauteuil roulant tirés du pack hors ligne, dans l’ordre de ma liste. UNKNOWN signifie que le pack ne le dit pas."),
    entries,
    footer,
    madeOn: today,
  };
}

/** The handout as plain text with LF line ends: heading, then `Label: value` lines, a blank line between places. */
export function handoutToText(h: Handout): string {
  const colon = h.locale === "fr" ? "\u00a0:" : ":";
  const out: string[] = [h.title, "", h.intro, ""];
  h.entries.forEach((e, i) => {
    out.push(`${i + 1}. ${e.heading}`);
    for (const l of e.lines) out.push(`${l.label}${colon} ${l.value}`);
    if (e.note) out.push(`Note${colon} ${e.note}`);
    if (e.questions.length > 0) {
      out.push(t(h.locale, "Questions to ask:", "Questions à poser\u00a0:"));
      e.questions.forEach((q, n) => out.push(`${n + 1}) ${q}`, `   ${t(h.locale, "Answer", "Réponse")}${colon} ________________`));
    }
    out.push("");
  });
  out.push(...h.footer);
  return `${out.join("\n")}\n`;
}
