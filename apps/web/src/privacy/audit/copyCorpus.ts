// Gathers every string the privacy code ships to a person, in one language,
// so the audits can run over all of it instead of a hand-picked sample.

import { STRINGS as NOTICE } from "../onDeviceNotice";
import type { Locale } from "../panel/copyLint";
import { DEVICE_STRINGS, type DeviceStatus, type ProtectedProblem } from "../panel/copyDevice";
import { EXTRA_STRINGS } from "../panel/copyExtra";
import { MORE_STRINGS, type MoreStatus } from "../panel/copyMore";
import { IMPORT_PROBLEM_CODES } from "../panel/importData";
import { PANEL_STRINGS, type Status } from "../panel/strings";
import { omit } from "../panel/omit";

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
  { kind: "kept-exported", format: "csv" },
  { kind: "kept-exported", format: "text" },
  { kind: "features-exported", format: "csv" },
  { kind: "features-exported", format: "text" },
  { kind: "handoff-exported", format: "csv" },
  { kind: "handoff-exported", format: "text" },
  { kind: "query-exported", format: "csv" },
  { kind: "query-exported", format: "text" },
  { kind: "picks-exported", format: "csv" },
  { kind: "picks-exported", format: "text" },
  { kind: "browser-exported", format: "csv" },
  { kind: "browser-exported", format: "text" },
  { kind: "browser-checked", answered: 6, asked: 6 },
  { kind: "browser-checked", answered: 0, asked: 6 },
  { kind: "query-checked", params: 0, findings: 0 },
  { kind: "query-checked", params: 3, findings: 1 },
  { kind: "query-unreadable" },
  { kind: "auto-exported", format: "csv" },
  { kind: "auto-exported", format: "text" },
  { kind: "workers-checked", registered: 1, differences: 0 },
  { kind: "workers-checked", registered: null, differences: 1 },
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

export const PROTECTED_PROBLEMS: readonly ProtectedProblem[] = [
  "empty", "too-short", "repeated", "common", "mismatch", "not-json", "wrong-format", "wrong-version",
  "bad-fields", "wrong-prefix", "too-large", "cannot-open", "unsupported",
];

const DEVICE_STATUSES: readonly DeviceStatus[] = [
  { kind: "scan-done" },
  { kind: "features-checked" },
  { kind: "device-cleared", caches: 2, databases: 1 },
  { kind: "device-clear-partial", failed: 2 },
  { kind: "device-nothing" },
  { kind: "protected-prepared", count: 3 },
  ...PROTECTED_PROBLEMS.map((code): DeviceStatus => ({ kind: "protected-problem", code })),
];

export function collectCopy(locale: Locale): CopyItem[] {
  const out: CopyItem[] = [];
  leaves("notice", NOTICE[locale], out);
  const panelStrings = PANEL_STRINGS[locale];
  const c = panelStrings.consent;
  const panel = omit(panelStrings, "status", "consent");
  leaves("panel", panel, out);
  const consent = omit(c, "granted", "declined", "ariaAllow", "ariaDecline");
  leaves("panel.consent", consent, out);
  const { activity, stored, changes, list, csvHeader } = EXTRA_STRINGS[locale];
  leaves("extra.activity", activity, out);
  leaves("extra.stored", stored, out);
  const changeText = omit(changes, "none", "since");
  leaves("extra.changes", changeText, out);
  leaves("extra.list", list, out);
  leaves("extra.csvHeader", csvHeader, out);
  const moreStrings = MORE_STRINGS[locale];
  const { printable, network } = moreStrings;
  const more = omit(moreStrings, "status", "printable", "network");
  leaves("more", more, out);
  leaves("more.printable.static", { title: printable.title, heading: printable.heading, storedHeading: printable.storedHeading }, out);
  const networkText = omit(network, "summary");
  leaves("more.network", networkText, out);
  STATUSES.forEach((s, i) => out.push({ source: `status.${s.kind}.${i}`, text: PANEL_STRINGS[locale].status(s) }));
  out.push({ source: "more.network.summary", text: network.summary(3, 2) });
  out.push({ source: "more.network.summary.one", text: network.summary(1, 1) });
  out.push({ source: "more.printable.generated", text: printable.generated("2026-11-15") });
  out.push({ source: "more.printable.reviewed", text: printable.reviewed("2026-11-15") });
  const d = DEVICE_STRINGS[locale];
  const { usage, value, ...signalText } = d.signals;
  leaves("device.signals", signalText, out);
  leaves("device.signals.value", value, out);
  for (const [u, q] of [[null, null], [1500, null], [1500, 5_000_000]] as const) out.push({ source: `device.signals.usage.${u}.${q}`, text: usage(u, q) });
  const { checkedAt, confirmBody, ...deviceText } = d.device;
  leaves("device.device", deviceText, out);
  out.push({ source: "device.device.checkedAt", text: checkedAt("2026-11-15") });
  out.push({ source: "device.device.confirmBody", text: confirmBody(2, 1) });
  out.push({ source: "device.device.confirmBody.one", text: confirmBody(1, 1) });
  leaves("device.copy", d.copy, out);
  DEVICE_STATUSES.forEach((s, i) => out.push({ source: `device.status.${s.kind}.${i}`, text: d.status(s) }));
  return out;
}
