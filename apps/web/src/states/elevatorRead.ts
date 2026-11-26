/**
 * Reads an operator's notice for the few things it states plainly: which elevator, that it is out of
 * service (or back in service), the reason given and the places it is "between". Nothing is guessed.
 * A part the words do not state is null, and the notice is always shown in full beside what was read.
 *
 * The "between" phrase is kept whole. Station notices join places with commas and "and" in ways that
 * cannot be told apart from a place whose name holds "and" ("GO and YRT bus platform"), so it is
 * never split into a list.
 */
import type { ElevatorNotice } from "./packElevators";

export type NoticeState = "out-of-service" | "back-in-service";
export type NoticeCause = "maintenance";

export interface NoticeReading {
  /** The elevator's own label such as ELV02-B, when the notice gives one. */
  readonly elevator: string | null;
  readonly state: NoticeState | null;
  readonly cause: NoticeCause | null;
  /** The phrase after "between", as written, without a closing full stop. */
  readonly between: string | null;
}

const NOTHING: NoticeReading = { elevator: null, state: null, cause: null, between: null };

/** A label has a digit, so "ALL" and "THE" are never taken for one. */
const LABEL = String.raw`([A-Za-z0-9][A-Za-z0-9-]{0,18})`;

const EN_OUT = new RegExp(String.raw`^elevator(?:\s+${LABEL})?\s+(?:is\s+)?out of service(?:\s+between\s+(.+?))?(?:\s+while we perform (maintenance))?\s*\.?$`, "i");
const EN_BACK = new RegExp(String.raw`^elevator(?:\s+${LABEL})?\s+(?:is\s+)?(?:back in service|returned to service|in service again)\s*\.?$`, "i");
const FR_OUT = new RegExp(String.raw`^ascenseur(?:\s+${LABEL})?\s+(?:est\s+)?hors service(?:\s+entre\s+(.+?))?(?:\s+(?:pour|pendant|en raison d['’]un|lors d['’]un) (entretien|maintenance|travaux d['’]entretien))?\s*\.?$`, "i");
const FR_BACK = new RegExp(String.raw`^ascenseur(?:\s+${LABEL})?\s+(?:est\s+)?(?:de nouveau|à nouveau|remis) (?:en service)\s*\.?$`, "i");

const hasDigit = (s: string): boolean => /\d/.test(s);

/** The notice's words without the station prefix the operator adds ("Pape: ..."). */
export function withoutStationPrefix(text: string, station: string | null): string {
  const s = text.trim();
  if (station) {
    const prefix = `${station}:`;
    if (s.toLowerCase().startsWith(prefix.toLowerCase())) return s.slice(prefix.length).trim();
  }
  return s;
}

function label(raw: string | undefined): string | null {
  return raw !== undefined && hasDigit(raw) ? raw.toUpperCase() : null;
}

function fromMatch(m: RegExpExecArray, state: NoticeState, cause: boolean): NoticeReading {
  const [, rawLabel, between, why] = m;
  return {
    elevator: label(rawLabel),
    state,
    cause: cause && why ? "maintenance" : null,
    between: between ? between.replace(/\s*\.\s*$/, "").trim() || null : null,
  };
}

/**
 * Reads `notice.text`. A label with no digit is not a label ("Elevator out of service" has none, and
 * "Elevator ELV02-B out of service" has ELV02-B). When the words fit none of the known forms the
 * reading is empty and the words stand on their own.
 */
export function readNotice(notice: Pick<ElevatorNotice, "text" | "station" | "textLanguage">): NoticeReading {
  if (notice.text === null) return NOTHING;
  const body = withoutStationPrefix(notice.text, notice.station);
  if (body === "") return NOTHING;
  const order = notice.textLanguage === "fr" ? [FR_OUT, FR_BACK, EN_OUT, EN_BACK] : [EN_OUT, EN_BACK, FR_OUT, FR_BACK];
  for (const re of order) {
    const m = re.exec(body);
    if (!m) continue;
    const isBack = re === EN_BACK || re === FR_BACK;
    return fromMatch(m, isBack ? "back-in-service" : "out-of-service", !isBack);
  }
  return NOTHING;
}

/** True when anything at all was read. */
export function hasReading(r: NoticeReading): boolean {
  return r.elevator !== null || r.state !== null || r.cause !== null || r.between !== null;
}
