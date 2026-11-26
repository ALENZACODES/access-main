import type { Language } from "./regionDownload";
import {
  HANDBACK_ITEMS,
  encodeSharedDeviceHandback,
  summarizeHandback,
  validateSharedDeviceHandback,
  type SharedDeviceHandback,
} from "./sharedDeviceHandback";
import { HANDBACK_ITEM_COPY, HANDBACK_COPY } from "./sharedDeviceHandbackCopy";

/** A text export describes selections, not actions performed by this page. */
export function sharedDeviceHandbackText(
  reviewInput: SharedDeviceHandback,
  language: Language,
): string {
  const review = validateSharedDeviceHandback(reviewInput);
  const fr = language === "fr";
  const c = HANDBACK_COPY[language];
  const colon = fr ? "\u00a0:" : ":";
  const summary = summarizeHandback(review);
  const out = [
    c.title,
    c.summary,
    c.overall + colon + summary.overall,
    c.total + colon + summary.total,
    c.required + colon + summary.required,
    c.done + colon + summary.done,
    c.pending + colon + summary.pending,
    c.unknownCount + colon + summary.unknown,
    c.notApplicable + colon + summary.notApplicable,
    c.remaining + colon + summary.remainingRequired,
    c.updated + colon + summary.updatedAt,
    "",
  ];
  for (const item of HANDBACK_ITEMS) {
    const entry = review.entries.find((candidate) => candidate.itemId === item.id)!;
    const itemLabel = HANDBACK_ITEM_COPY[language][item.id] ?? "UNKNOWN";
    const status = entry.state === "done" ? c.done
      : entry.state === "pending" ? c.pending
      : entry.state === "UNKNOWN" ? "UNKNOWN" : c.notApplicable;
    out.push(itemLabel + " — " + status);
    out.push((fr ? "Domaine" : "Area") + colon + " " + c[item.category]);
    out.push((fr ? "Élément requis" : "Required item") + colon + " " + (item.required ? c.requiredMark : c.optionalMark));
    out.push("");
  }
  out.push(c.boundary, c.importDoesNotProve, c.noActions);
  return out.join("\n") + "\n";
}

export function sharedDeviceHandbackJson(review: SharedDeviceHandback): string {
  return encodeSharedDeviceHandback(review);
}

export function sharedDeviceHandbackFilename(
  reviewId: string,
  format: "json" | "txt",
): string {
  const safe = reviewId.replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 64).replace(/^-+|-+$/g, "") || "review";
  return "shared-device-handback-" + safe + "." + format;
}

/** Export is initiated only by the person's explicit action. */
export function saveSharedDeviceHandback(
  review: SharedDeviceHandback,
  language: Language,
  format: "json" | "txt",
  doc: Document,
  createUrl: (blob: Blob) => string = (blob) => URL.createObjectURL(blob),
  revokeUrl: (url: string) => void = (url) => URL.revokeObjectURL(url),
): void {
  const content = format === "json"
    ? sharedDeviceHandbackJson(review)
    : sharedDeviceHandbackText(review, language);
  const blob = new Blob([content], {
    type: format === "json" ? "application/json;charset=utf-8" : "text/plain;charset=utf-8",
  });
  const url = createUrl(blob);
  try {
    const anchor = doc.createElement("a");
    anchor.href = url;
    anchor.download = sharedDeviceHandbackFilename(review.reviewId, format);
    anchor.rel = "noopener";
    anchor.hidden = true;
    doc.body.append(anchor);
    try { anchor.click(); } finally { anchor.remove(); }
  } finally {
    revokeUrl(url);
  }
}
