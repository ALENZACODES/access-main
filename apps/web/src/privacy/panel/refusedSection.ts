// The "not saved" part of the panel: what the consent gate stopped, grouped by feature and
// by the reason. It shows feature names and counts only, never keys or values. The list
// lives in memory for this visit, so it starts empty after a reload.

import type { Locale } from "./copyLint";
import { esc, isSingular } from "./html";
import type { Purpose } from "./consent";
import type { RefusedWrite } from "./consentGate";

const NBSP = " ";

export interface RefusedGroup {
  purposeId: string;
  reason: RefusedWrite["reason"];
  count: number;
}

/** Groups refused writes by purpose and reason, in the order each pair first appeared. */
export function groupRefused(list: readonly RefusedWrite[]): RefusedGroup[] {
  const out: RefusedGroup[] = [];
  for (const r of list) {
    const found = out.find((g) => g.purposeId === r.purposeId && g.reason === r.reason);
    if (found) found.count += 1;
    else out.push({ purposeId: r.purposeId, reason: r.reason, count: 1 });
  }
  return out;
}

export const REFUSED_STRINGS = {
  en: {
    heading: "Not saved",
    note: "These were not saved on this device because of the choices above. This list is cleared when you reload the page.",
    reason: { "no-choice": "you have not decided yet", declined: "you chose not to allow it" },
    line: (feature: string, n: number, why: string) => `${feature}: ${n} ${n === 1 ? "save was" : "saves were"} stopped because ${why}.`,
    unknownFeature: "A feature that is not listed",
  },
  fr: {
    heading: "Non enregistré",
    note: "Ces éléments n’ont pas été enregistrés sur cet appareil, à cause des choix ci-dessus. Cette liste est vidée quand vous rechargez la page.",
    reason: { "no-choice": "vous n’avez pas encore décidé", declined: "vous avez choisi de ne pas l’autoriser" },
    line: (feature: string, n: number, why: string) =>
      `${feature}${NBSP}: ${n} ${isSingular("fr", n) ? "enregistrement a été arrêté" : "enregistrements ont été arrêtés"} parce que ${why}.`,
    unknownFeature: "Une fonction qui n’est pas listée",
  },
} as const;

export function refusedLines(locale: Locale, list: readonly RefusedWrite[], purposes: readonly Purpose[]): string[] {
  const s = REFUSED_STRINGS[locale];
  return groupRefused(list).map((g) => {
    const label = purposes.find((p) => p.id === g.purposeId)?.label[locale] ?? s.unknownFeature;
    return s.line(label, g.count, s.reason[g.reason]);
  });
}

/** Empty string when nothing was refused, so the section only appears when it has something to say. */
export function renderRefusedHtml(locale: Locale, list: readonly RefusedWrite[], purposes: readonly Purpose[]): string {
  const lines = refusedLines(locale, list, purposes);
  if (lines.length === 0) return "";
  const s = REFUSED_STRINGS[locale];
  return (
    `<div data-privacy-refused role="group" aria-labelledby="privacy-refused-title"><h3 id="privacy-refused-title">${esc(s.heading)}</h3>` +
    `<p>${esc(s.note)}</p><ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></div>`
  );
}
