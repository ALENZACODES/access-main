// The identifiers and device reads that the code may make, one row for each file and code with its count. The reasons
// say only what was read in the lines named; where something was not checked the reason says so.

import type { IdCode, IdFinding } from "./idRules";
import { ID_ACCEPTABLE } from "./idRules";

export interface IdAcceptRow {
  path: string;
  code: IdCode;
  count: number;
  reason: string;
}

const R_RECORD_ID = "The value is the id of a record that is kept on the device. Not checked: whether any later code sends that id off the device.";

export const ID_ACCEPTED: readonly IdAcceptRow[] = [
  { path: "apps/web/src/contribute/useDraftPhotos.ts", code: "id-uuid", count: 1, reason: "The value is the id of a photo in a draft that is kept on the device, made by the browser's own randomUUID. Not checked: the export of the draft." },
  { path: "apps/web/src/data-status/standalone/main.ts", code: "id-device-low", count: 1, reason: "navigator.language is passed as the browser language that the page uses to pick French or English. Not checked: that it is not logged." },
  { path: "apps/web/src/hub/RouteReportsPage.tsx", code: "id-math-random", count: 1, reason: "Math.random is the fallback for the id of a report when randomUUID does not exist, in a template on one line with Date.now. The line does not store or send anything." },
  { path: "apps/web/src/hub/RouteReportsPage.tsx", code: "id-time-id", count: 1, reason: "Date.now is part of the fallback id of a report, in a template next to Math.random, used only when randomUUID does not exist. The line does not store or send anything." },
  { path: "apps/web/src/hub/RouteReportsPage.tsx", code: "id-uuid", count: 1, reason: R_RECORD_ID },
  { path: "apps/web/src/i18n/index.ts", code: "id-device-low", count: 1, reason: "navigator.language is lower-cased and tested with startsWith(\"fr\") to choose French or English, and only when no language was chosen. The value is not kept." },
  { path: "apps/web/src/map/camera.ts", code: "id-device-low", count: 1, reason: "matchMedia reads the reduced motion setting and returns a yes or no. The value is not kept." },
  { path: "apps/web/src/narrow/hover-inpage.ts", code: "id-device-low", count: 2, reason: "matchMedia reads whether the device can hover, as yes, no or unknown, for the hover audit report of the narrow audit page. Not checked: where the report is saved." },
  { path: "apps/web/src/narrow/moving-inpage.ts", code: "id-device-low", count: 2, reason: "matchMedia reads the reduced motion setting as yes, no or unknown for the moving-content audit report of the narrow audit page. Not checked: where the report is saved." },
  { path: "apps/web/src/offline/robust/contingencyPanel.ts", code: "id-time-id", count: 1, reason: "Date.now is part of the id of an element of the page, made with a counter, in a template on one line. It is not kept or sent." },
  { path: "apps/web/src/offline/robust/offlineDiagnosticsPanel.ts", code: "id-math-random", count: 1, reason: "Math.random makes the id of an element of the page so that aria-controls points at it. It is not kept or sent." },
  { path: "apps/web/src/offline/robust/recoveryBatchesPanel.ts", code: "id-math-random", count: 1, reason: "Math.random makes the id of an element of the page so that aria-controls points at it. It is not kept or sent." },
  { path: "apps/web/src/privacy/panel/browserLive.ts", code: "id-device-low", count: 2, reason: "matchMedia reads one setting at a time for the browser signals panel and returns a yes or no. nav.language, read through the alias nav of env.navigator, is cleaned and shown as the language. Not checked: what the host does with the shown value after the panel." },
  { path: "apps/web/src/privacy/panel/protectedBackup.ts", code: "id-random-bytes", count: 2, reason: "getRandomValues makes the salt (16 bytes) and the nonce (12 bytes) of a protected copy. Each is written into the copy and is not an identifier of the person." },
  { path: "apps/web/src/privacy/panel/signals.ts", code: "id-device-low", count: 3, reason: "readSignals reads globalPrivacyControl, doNotTrack and cookieEnabled from the host navigator and turns each into yes, no or unknown, which is what the signals panel is for. Not checked: what the host does with the three values beyond the panel." },
  { path: "apps/web/src/shell/useApplyPreferences.ts", code: "id-device-low", count: 2, reason: "matchMedia reads the contrast setting and returns a yes or no, used to set a data attribute on the page." },
  { path: "apps/web/src/storage/repository.ts", code: "id-uuid", count: 1, reason: "The value is the id of a queued report on the device. The id is made before the note is read and does not use it." },
];

export interface IdRegisterProblem {
  code: "duplicate-row" | "unacceptable-code" | "bad-count" | "empty-reason" | "unsorted" | "outside-src";
  path: string;
  detail: string;
}

export function validateIdRegister(rows: readonly IdAcceptRow[] = ID_ACCEPTED): IdRegisterProblem[] {
  const out: IdRegisterProblem[] = [];
  const seen = new Set<string>();
  let last = "";
  for (const r of rows) {
    const key = `${r.path}\u0000${r.code}`;
    if (seen.has(key)) out.push({ code: "duplicate-row", path: r.path, detail: r.code });
    seen.add(key);
    if (!ID_ACCEPTABLE.includes(r.code)) out.push({ code: "unacceptable-code", path: r.path, detail: r.code });
    if (!Number.isInteger(r.count) || r.count < 1) out.push({ code: "bad-count", path: r.path, detail: String(r.count) });
    if (r.reason.trim().length < 30) out.push({ code: "empty-reason", path: r.path, detail: r.code });
    if (!r.path.startsWith("apps/web/src/")) out.push({ code: "outside-src", path: r.path, detail: r.code });
    if (key < last) out.push({ code: "unsorted", path: r.path, detail: r.code });
    last = key;
  }
  return out;
}

export function assertIdRegister(rows: readonly IdAcceptRow[] = ID_ACCEPTED): void {
  const p = validateIdRegister(rows);
  if (p.length > 0) throw new Error(`The identifier register is not valid: ${p.map((x) => `${x.path} ${x.code} ${x.detail}`).join("; ")}`);
}

/** The accepted count for a path and code, or 0. */
export function acceptedCount(path: string, code: IdCode, rows: readonly IdAcceptRow[] = ID_ACCEPTED): number {
  return rows.find((r) => r.path === path && r.code === code)?.count ?? 0;
}

export function sumAccepted(findings: readonly IdFinding[], rows: readonly IdAcceptRow[] = ID_ACCEPTED): number {
  let n = 0;
  for (const f of findings) if (acceptedCount(f.path, f.code, rows) > 0) n++;
  return n;
}
