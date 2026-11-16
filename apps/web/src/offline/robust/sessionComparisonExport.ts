import type { Language } from "./regionDownload";
import type { SnapshotComparison } from "./sessionComparison";
import { CHANGE_COPY, comparisonSummary, SESSION_COPY } from "./sessionComparisonCopy";

export interface SessionComparisonDocument {
  readonly schema: "offline-session-comparison-v1";
  readonly region: string;
  readonly from: string;
  readonly to: string;
  readonly status: SnapshotComparison["status"];
  readonly newlySaved: number;
  readonly noLongerSaved: number;
  readonly unknown: number;
  readonly cannotCompare: number;
  readonly changes: SnapshotComparison["changes"];
}

export function makeSessionComparisonDocument(value: SnapshotComparison): SessionComparisonDocument {
  return {
    schema: "offline-session-comparison-v1", region: value.regionId,
    from: value.before.capturedAt, to: value.after.capturedAt,
    status: value.status, newlySaved: value.newlySaved,
    noLongerSaved: value.noLongerSaved, unknown: value.unknown,
    cannotCompare: value.cannotCompare, changes: value.changes,
  };
}

/** Metadata only: do not include payloads or personal device identifiers. */
export function encodeSessionComparison(value: SnapshotComparison): string {
  return JSON.stringify(makeSessionComparisonDocument(value), null, 2) + "\n";
}

function safe(value: string): string {
  return value.replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu, " ");
}

export function formatSessionComparison(value: SnapshotComparison, language: Language): string {
  const c = SESSION_COPY[language];
  const sep = language === "fr" ? "\u00a0:" : ":";
  const lines = [
    c.title,
    `${c.before}${sep} ${safe(value.before.capturedAt)}`,
    `${c.after}${sep} ${safe(value.after.capturedAt)}`,
    `${c.status}${sep} ${value.status}`,
    comparisonSummary(value, language),
    c.intro,
  ];
  for (const row of value.changes) {
    const source = row.after?.source ?? row.before?.source;
    lines.push("", safe(row.cellId), CHANGE_COPY[language][row.change]);
    lines.push(`${c.before}${sep} ${row.before?.state === "saved" ? c.savedLabel : c.unknownLabel}`);
    lines.push(`${c.after}${sep} ${row.after?.state === "saved" ? c.savedLabel : c.unknownLabel}`);
    lines.push(`${c.source}${sep} ${safe(source?.source ?? c.unknownLabel)}`);
    lines.push(`${c.licence}${sep} ${safe(source?.licence ?? c.unknownLabel)}`);
    lines.push(`${c.date}${sep} ${safe(source?.date ?? c.unknownLabel)}`);
  }
  lines.push("", c.note);
  return lines.join("\n") + "\n";
}

export function sessionComparisonFilename(region: string, extension: "txt" | "json"): string {
  const id = region.toLowerCase().replace(/[^a-z0-9_-]/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 64) || "region";
  return `offline-session-${id}.${extension}`;
}

export function saveSessionComparison(
  comparison: SnapshotComparison,
  language: Language,
  extension: "txt" | "json",
  documentRef: Document = document,
): void {
  const value = extension === "txt" ? formatSessionComparison(comparison, language) :
    encodeSessionComparison(comparison);
  const type = extension === "txt" ? "text/plain;charset=utf-8" :
    "application/json;charset=utf-8";
  const url = URL.createObjectURL(new Blob([value], { type }));
  try {
    const anchor = documentRef.createElement("a");
    anchor.href = url;
    anchor.download = sessionComparisonFilename(comparison.regionId, extension);
    anchor.hidden = true;
    documentRef.body.append(anchor);
    try { anchor.click(); } finally { anchor.remove(); }
  } finally {
    URL.revokeObjectURL(url);
  }
}
