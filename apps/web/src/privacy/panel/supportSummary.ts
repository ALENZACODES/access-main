// A plain-text summary a person can send to whoever helps them. It lists
// counts, names, sizes and consent choices, never the stored contents and never
// the labels the person typed anywhere.

import type { ActivityEntry } from "./activityLog";
import type { BlockedView } from "./egressLog";
import { consentStatus, type ConsentState, type Purpose } from "./consent";
import { MORE_STRINGS } from "./copyMore";
import type { Locale } from "./copyLint";
import { formatBytes } from "./copyExtra";
import type { ExportFile } from "./localData";
import type { Reconciled } from "./reconcile";

export interface SupportInput {
  locale: Locale;
  now: Date;
  stored: Reconciled;
  inventoryCount: number;
  purposes: readonly Purpose[];
  consent: ConsentState;
  activity: readonly ActivityEntry[];
  blocked: BlockedView;
}

function localDate(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function buildSupportSummary(i: SupportInput): ExportFile {
  const s = MORE_STRINGS[i.locale].support;
  const colon = i.locale === "fr" ? "\u00a0:" : ":";
  const line = (k: string, v: string | number): string => `${k}${colon} ${v}`;
  const fr = i.locale === "fr";
  const consent = i.purposes.map((p) => {
    const st = consentStatus(i.consent, p);
    const word = st.value === "granted" ? (fr ? "Autorisé" : "Allowed") : st.value === "declined" ? (fr ? "Refusé" : "Not allowed") : fr ? "Inconnu" : "Unknown";
    return `- ${p.id}${colon} ${word}${st.value === "unknown" || st.decidedOn === undefined ? "" : ` (${st.decidedOn})`}`;
  });
  const names = i.stored.items.map((x) => `- ${x.key} (${formatBytes(i.locale, x.bytes)})`);
  const lines = [
    s.title,
    "",
    s.note,
    "",
    line(s.date, localDate(i.now)),
    line(s.language, s.langName),
    line(s.entriesInList, i.inventoryCount),
    line(s.storedCount, i.stored.items.length),
    line(s.storedBytes, i.stored.totalBytes),
    line(s.activityCount, i.activity.length),
    line(s.blockedHosts, i.blocked.hosts.length),
    "",
    `${s.names}${colon}`,
    ...(names.length === 0 ? [`- ${s.none}`] : names),
    "",
    `${s.consentHeading}${colon}`,
    ...(consent.length === 0 ? [`- ${s.none}`] : consent),
  ];
  return {
    filename: `${i.locale === "fr" ? "l-app-aide" : "the-app-support"}-${localDate(i.now)}.txt`,
    mime: "text/plain",
    text: `${lines.join("\n")}\n`,
    count: i.stored.items.length,
  };
}
