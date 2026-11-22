// What the audit of time accepts, and why. A row says what was read in the lines named and nothing more: it does not
// say where a time goes afterwards, whether another part of the App compares it with a time of its own, or what a
// person's device answers. Where something was not checked the reason says so.

import { TM_ACCEPTABLE, TM_CODES, type TmCode } from "./tmRules";

export interface TmAcceptRow {
  path: string;
  code: TmCode;
  count: number;
  reason: string;
}

const R_DATE_NAME = "A function that writes today's date as YYYY-MM-DD from the getters of a Date, so in the time zone of the device. It is used for a file name or a line the person reads. Not checked: whether the date is compared anywhere with a UTC time.";
const R_DATE_NAME_3 = "The same three getters (year, month, day) written as one expression for a date of the form YYYY-MM-DD, in the time zone of the device. Not checked: what the date is used for beyond the line read.";
const R_ACTIVITY_TIME = "formatActivityTime writes the stored time as YYYY-MM-DD HH:MM in the time zone of the device, for the line the person reads in the activity list. The stored value is UTC text; only the display is local.";
const R_PACK_TIME = "Writes a date and a time (to the minute) from the getters of a Date, in the time zone of the device, for the offline pack page. Not checked: where the text is shown.";
const R_PACK_FORMAT = "A format of a date and a time written with Intl.DateTimeFormat and no time zone, so in the time zone of the device, for a line the person reads.";
const R_MONTH_NAME = "Writes the day, a month name and the year from the getters of a Date, in the time zone of the device, for a line of the access summary.";
const R_TIMER = "A timer read with performance.now, falling back to Date.now, to time what the person does in the panel. Not checked: whether any reading leaves the page or is kept.";
const R_ID_TIME = "The time of the call is written into an identifier or a key built in a template. The time is in the text of the identifier, to the millisecond. Not checked: where the identifier is kept or shown.";
const R_PRIVACY_STAMP = "Writes the time of the call as a full ISO text (date, time, milliseconds, Z) into the value this file builds. The value is in UTC; it has no offset. Not checked: every place that value is read.";
const R_PRIVACY_CLOCK = "Reads the clock where the caller gives none, so the real time of the call is used. The tests pass their own time.";

/** Rows are in path order, then code order. */
export const TM_ACCEPTED: readonly TmAcceptRow[] = [
  { path: "apps/web/src/hub/EventOrganiserPage.tsx", code: "tm-local-getter", count: 3, reason: R_DATE_NAME },
  { path: "apps/web/src/hub/RouteReportsPage.tsx", code: "tm-clock-in-text", count: 1, reason: R_ID_TIME },
  { path: "apps/web/src/input/rehearsal/AccessRehearsalPage.tsx", code: "tm-local-getter", count: 3, reason: R_DATE_NAME_3 },
  { path: "apps/web/src/input/switch-workbench/WorkbenchPage.tsx", code: "tm-local-getter", count: 3, reason: R_DATE_NAME_3 },
  { path: "apps/web/src/narrow/access-summary.ts", code: "tm-local-getter", count: 3, reason: R_MONTH_NAME },
  { path: "apps/web/src/narrow/gestures-panel.ts", code: "tm-hires-timer", count: 1, reason: R_TIMER },
  { path: "apps/web/src/narrow/press-panel.ts", code: "tm-hires-timer", count: 1, reason: R_TIMER },
  { path: "apps/web/src/narrow/typing-panel.ts", code: "tm-hires-timer", count: 1, reason: R_TIMER },
  { path: "apps/web/src/offline/robust/contingencyPanel.ts", code: "tm-clock-in-text", count: 1, reason: R_ID_TIME },
  { path: "apps/web/src/offline/robust/localEvidenceTimelinePanel.ts", code: "tm-clock-in-text", count: 1, reason: R_ID_TIME },
  { path: "apps/web/src/pages/DataStatusPage.tsx", code: "tm-local-format", count: 1, reason: R_PACK_FORMAT },
  { path: "apps/web/src/pages/OfflinePackPage.tsx", code: "tm-local-format", count: 1, reason: R_PACK_FORMAT },
  { path: "apps/web/src/pages/OfflinePackPage.tsx", code: "tm-local-getter", count: 5, reason: R_PACK_TIME },
  { path: "apps/web/src/privacy/panel/activityLog.ts", code: "tm-local-getter", count: 5, reason: R_ACTIVITY_TIME },
  { path: "apps/web/src/privacy/panel/activityLog.ts", code: "tm-privacy-clock", count: 1, reason: R_PRIVACY_STAMP },
  { path: "apps/web/src/privacy/panel/addressExport.ts", code: "tm-local-getter", count: 3, reason: R_DATE_NAME },
  { path: "apps/web/src/privacy/panel/autoSection.ts", code: "tm-local-getter", count: 3, reason: R_DATE_NAME },
  { path: "apps/web/src/privacy/panel/browserSection.ts", code: "tm-local-getter", count: 3, reason: R_DATE_NAME },
  { path: "apps/web/src/privacy/panel/consent.ts", code: "tm-local-getter", count: 3, reason: R_DATE_NAME },
  { path: "apps/web/src/privacy/panel/controller.ts", code: "tm-local-getter", count: 3, reason: R_DATE_NAME },
  { path: "apps/web/src/privacy/panel/deviceStorage.ts", code: "tm-privacy-clock", count: 1, reason: R_PRIVACY_STAMP },
  { path: "apps/web/src/privacy/panel/egress.ts", code: "tm-privacy-clock", count: 1, reason: R_PRIVACY_CLOCK },
  { path: "apps/web/src/privacy/panel/egress.ts", code: "tm-privacy-clock", count: 1, reason: R_PRIVACY_STAMP },
  { path: "apps/web/src/privacy/panel/egressLog.ts", code: "tm-privacy-clock", count: 1, reason: R_PRIVACY_CLOCK },
  { path: "apps/web/src/privacy/panel/expiry.ts", code: "tm-privacy-clock", count: 2, reason: R_PRIVACY_STAMP },
  { path: "apps/web/src/privacy/panel/featureExport.ts", code: "tm-local-getter", count: 3, reason: R_DATE_NAME },
  { path: "apps/web/src/privacy/panel/glanceSection.ts", code: "tm-local-getter", count: 3, reason: R_DATE_NAME },
  { path: "apps/web/src/privacy/panel/handoffSection.ts", code: "tm-local-getter", count: 3, reason: R_DATE_NAME },
  { path: "apps/web/src/privacy/panel/inventoryExport.ts", code: "tm-local-getter", count: 3, reason: R_DATE_NAME },
  { path: "apps/web/src/privacy/panel/keptExport.ts", code: "tm-local-getter", count: 3, reason: R_DATE_NAME },
  { path: "apps/web/src/privacy/panel/localData.ts", code: "tm-local-getter", count: 3, reason: R_DATE_NAME },
  { path: "apps/web/src/privacy/panel/localData.ts", code: "tm-privacy-clock", count: 1, reason: R_PRIVACY_STAMP },
  { path: "apps/web/src/privacy/panel/permissions.ts", code: "tm-privacy-clock", count: 1, reason: R_PRIVACY_STAMP },
  { path: "apps/web/src/privacy/panel/pickSection.ts", code: "tm-local-getter", count: 3, reason: R_DATE_NAME },
  { path: "apps/web/src/privacy/panel/printable.ts", code: "tm-local-getter", count: 3, reason: R_DATE_NAME },
  { path: "apps/web/src/privacy/panel/querySection.ts", code: "tm-local-getter", count: 3, reason: R_DATE_NAME },
  { path: "apps/web/src/privacy/panel/receiptSection.ts", code: "tm-local-getter", count: 3, reason: R_DATE_NAME },
  { path: "apps/web/src/privacy/panel/registerExport.ts", code: "tm-local-getter", count: 3, reason: R_DATE_NAME },
  { path: "apps/web/src/privacy/panel/retentionSection.ts", code: "tm-local-getter", count: 3, reason: R_DATE_NAME },
  { path: "apps/web/src/privacy/panel/saveSection.ts", code: "tm-local-getter", count: 3, reason: R_DATE_NAME },
  { path: "apps/web/src/privacy/panel/statementSection.ts", code: "tm-local-getter", count: 3, reason: R_DATE_NAME },
  { path: "apps/web/src/privacy/panel/supportSummary.ts", code: "tm-local-getter", count: 3, reason: R_DATE_NAME },
  { path: "apps/web/src/privacy/panel/wordingSection.ts", code: "tm-local-getter", count: 3, reason: R_DATE_NAME },
  { path: "apps/web/src/states/DataCredits.tsx", code: "tm-local-getter", count: 3, reason: R_DATE_NAME_3 },
  { path: "apps/web/src/states/PackFreshness.tsx", code: "tm-local-getter", count: 3, reason: R_DATE_NAME_3 },
  { path: "apps/web/src/states/PackReport.tsx", code: "tm-local-getter", count: 3, reason: R_DATE_NAME_3 },
];

/**
 * The folders under apps/web/src, other than the privacy folder, whose code reads the clock or writes a time. A new
 * folder that does is a finding until it is added here, which is the moment to look at what it writes.
 */
export const TM_FOLDERS: readonly string[] = ["contribute", "data-status", "hub", "input", "map", "narrow", "offline", "pages", "profile", "recovery", "states", "storage"];

export function validateTmRegister(rows: readonly TmAcceptRow[] = TM_ACCEPTED, folders: readonly string[] = TM_FOLDERS): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let prev = "";
  for (const r of rows) {
    const where = `${r.path} ${r.code}`;
    if (!TM_CODES.includes(r.code)) out.push(`${where}: not a code of this audit`);
    else if (!TM_ACCEPTABLE.includes(r.code)) out.push(`${where}: this code may not be accepted by a row`);
    if (!Number.isInteger(r.count) || r.count < 1) out.push(`${where}: count must be a whole number from 1`);
    if (r.reason.trim().length < 40) out.push(`${where}: the reason is too short to say what was read`);
    if (/\b(verified|safe|secure|private)\b/i.test(r.reason)) out.push(`${where}: the reason claims more than a reading of the lines`);
    const key = `${r.path}\u0000${r.code}\u0000${r.reason}`;
    if (seen.has(key)) out.push(`${where}: the same row twice`);
    seen.add(key);
    const order = `${r.path}\u0000${r.code}`;
    if (order < prev) out.push(`${where}: out of order`);
    prev = order;
  }
  const f = new Set<string>();
  for (const name of folders) {
    if (f.has(name)) out.push(`folder ${name}: listed twice`);
    f.add(name);
    if (name === "privacy") out.push("folder privacy: the privacy folder is policed by rows, not by the list");
    if (!/^[a-z][a-z-]*$/.test(name)) out.push(`folder ${name}: not a folder name`);
  }
  return out;
}
