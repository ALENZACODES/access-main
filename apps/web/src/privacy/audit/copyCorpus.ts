// Gathers every string the privacy code ships to a person, in one language,
// so the audits can run over all of it instead of a hand-picked sample.

import { STRINGS as NOTICE } from "../onDeviceNotice";
import type { Locale } from "../panel/copyLint";
import { EXTRA_STRINGS } from "../panel/copyExtra";
import { MORE_STRINGS, type MoreStatus } from "../panel/copyMore";
import { IMPORT_PROBLEM_CODES } from "../panel/importData";
import { PANEL_STRINGS, type Status } from "../panel/strings";

export interface CopyItem {
  source: string;
  text: string;
}

function leaves(prefix: string, v: unknown, out: CopyItem[]): void {
  if (typeof v === "string") out.push({ source: prefix, text: v });
  else if (Array.isArray(v)) v.forEach((x, i) => leaves(`${prefix}.${i}`, x, out));
  else if (v !== null && typeof v === "object") {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) leaves(`${prefix}.${k}`, x, out);
  }
}

const STATUSES: readonly Status[] = [
  { kind: "exported", count: 3 },
  { kind: "erased", count: 3 },
  { kind: "erase-partial", failed: 2 },
  { kind: "nothing" },
  { kind: "unavailable" },
  { kind: "consent-saved", value: "granted", label: "Saved places" },
  { kind: "consent-saved", value: "declined", label: "Saved places" },
  { kind: "save-failed" },
  { kind: "expired-removed", count: 2 },
  { kind: "list-exported", format: "csv" },
  { kind: "list-exported", format: "text" },
  { kind: "seen-saved" },
  { kind: "import-ready", additions: 2, overwrites: 1, unchanged: 3 },
  { kind: "import-done", count: 4 },
  { kind: "import-rolled-back" },
  { kind: "import-stuck", failed: 2 },
  { kind: "import-cancelled" },
  { kind: "support-prepared" },
  { kind: "printable-prepared" },
  ...IMPORT_PROBLEM_CODES.map((code): MoreStatus => ({ kind: "import-problem", code })),
];

export function collectCopy(locale: Locale): CopyItem[] {
  const out: CopyItem[] = [];
  leaves("notice", NOTICE[locale], out);
  const { status: _s, consent: c, ...panel } = PANEL_STRINGS[locale];
  leaves("panel", panel, out);
  const { granted: _g, declined: _d, ariaAllow: _a, ariaDecline: _ad, ...consent } = c;
  leaves("panel.consent", consent, out);
  const { activity, stored, changes, list, csvHeader } = EXTRA_STRINGS[locale];
  leaves("extra.activity", activity, out);
  leaves("extra.stored", stored, out);
  const { none: _n, since: _si, ...changeText } = changes;
  leaves("extra.changes", changeText, out);
  leaves("extra.list", list, out);
  leaves("extra.csvHeader", csvHeader, out);
  const { status: _ms, printable, network, ...more } = MORE_STRINGS[locale];
  leaves("more", more, out);
  leaves("more.printable.static", { title: printable.title, heading: printable.heading, storedHeading: printable.storedHeading }, out);
  const { summary: _sum, ...networkText } = network;
  leaves("more.network", networkText, out);
  STATUSES.forEach((s, i) => out.push({ source: `status.${s.kind}.${i}`, text: PANEL_STRINGS[locale].status(s) }));
  out.push({ source: "more.network.summary", text: network.summary(3, 2) });
  out.push({ source: "more.network.summary.one", text: network.summary(1, 1) });
  out.push({ source: "more.printable.generated", text: printable.generated("2026-11-15") });
  out.push({ source: "more.printable.reviewed", text: printable.reviewed("2026-11-15") });
  return out;
}
