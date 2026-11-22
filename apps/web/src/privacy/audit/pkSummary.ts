// What a pack leaves unknown, counted, so a person who reads the audit can see that UNKNOWN has stayed UNKNOWN. It
// counts what is written; it does not say a value is right.

import { isRecord } from "./pkWalk";

export interface PkSummary {
  places: number;
  /** How many places say UNKNOWN for wheelchair access. */
  wheelchairUnknown: number;
  wheelchairYes: number;
  wheelchairNo: number;
  /** Other values: limited, designated, and anything the rules reject. */
  wheelchairOther: number;
  /** Records in any list whose licence is UNKNOWN. */
  licenceUnknown: number;
  /** Help numbers with no link (null), which stay without one. */
  helpWithoutLink: number;
  helpNumbers: number;
  /** Elevator records, each with the time it was last checked. */
  elevators: number;
  /** Elevator records with no checked_at. */
  elevatorsUnchecked: number;
}

export const EMPTY_SUMMARY: PkSummary = { places: 0, wheelchairUnknown: 0, wheelchairYes: 0, wheelchairNo: 0, wheelchairOther: 0, licenceUnknown: 0, helpWithoutLink: 0, helpNumbers: 0, elevators: 0, elevatorsUnchecked: 0 };

const rows = (content: Record<string, unknown>, key: string): Array<Record<string, unknown>> => (Array.isArray(content[key]) ? content[key].filter(isRecord) : []);
const licenceOf = (r: Record<string, unknown>): unknown => (isRecord(r["provenance"]) ? r["provenance"]["licence"] : r["licence"]);

export function summarise(content: unknown): PkSummary {
  if (!isRecord(content)) return { ...EMPTY_SUMMARY };
  const s: PkSummary = { ...EMPTY_SUMMARY };
  const places = rows(content, "places");
  const help = rows(content, "help_numbers");
  const lifts = rows(content, "elevator_status");
  s.places = places.length;
  for (const p of places) {
    const w = p["wheelchair"];
    if (w === "UNKNOWN") s.wheelchairUnknown += 1;
    else if (w === "yes") s.wheelchairYes += 1;
    else if (w === "no") s.wheelchairNo += 1;
    else s.wheelchairOther += 1;
  }
  s.helpNumbers = help.length;
  s.helpWithoutLink = help.filter((h) => h["url"] === null || h["url"] === undefined || h["url"] === "").length;
  s.elevators = lifts.length;
  s.elevatorsUnchecked = lifts.filter((l) => typeof l["checked_at"] !== "string" || l["checked_at"] === "").length;
  for (const r of [...places, ...help, ...lifts]) if (licenceOf(r) === "UNKNOWN") s.licenceUnknown += 1;
  return s;
}

/** The summary as plain lines for the report. */
export function summaryLines(s: PkSummary): string[] {
  return [
    `Places: ${s.places}; wheelchair access yes ${s.wheelchairYes}, no ${s.wheelchairNo}, UNKNOWN ${s.wheelchairUnknown}, other ${s.wheelchairOther}.`,
    `Records with the licence UNKNOWN: ${s.licenceUnknown}.`,
    `Help numbers: ${s.helpNumbers}, ${s.helpWithoutLink} without a link.`,
    `Elevator records: ${s.elevators}, ${s.elevatorsUnchecked} without a time of last check.`,
  ];
}
