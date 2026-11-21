import type { Language } from "./regionDownload";
import { assertCoordinationBrief, encodeCoordinationBrief, pageBriefSteps, summarizeBrief, type CoordinationBrief } from "./coordinationBrief";
import { COORDINATION_COPY, COORDINATION_PRIORITIES, COORDINATION_STATUSES, COORDINATION_TOPICS } from "./coordinationBriefCopy";
/** Plain text contains only explicitly supplied details and always names UNKNOWN physical conditions. */
function flat(text: string): string {
  return text.replace(/[\u202a-\u202e\u2066-\u2069]/gu, "").replace(/[\r\n\t]+/gu, " ").replace(/\s+/gu, " ").trim();
}
export function coordinationBriefText(book: CoordinationBrief, language: Language): string {
  assertCoordinationBrief(book);
  const c = COORDINATION_COPY[language];
  const colon = language === "fr" ? "\u00A0: " : ": ";
  const label = (key: string, value: string): string => `${key}${colon}${flat(value)}`;
  const stats = summarizeBrief(book);
  const lines: string[] = [c.title, label(c.brief, book.title), label(c.region, book.regionId),
    label(c.date, book.date), label(c.context, book.context || "UNKNOWN"), c.caution,
    label(c.count, String(stats.total)), label(c.unanswered, String(stats.unanswered)),
    label(c.essentials, String(stats.essential)), ""];
  const ordered = pageBriefSteps(book, { filter: "all", sort: "order", search: "", offset: 0, limit: 40 }).rows;
  const second = book.steps.length > 40 ? pageBriefSteps(book, { filter: "all", sort: "order", search: "", offset: 40, limit: 40 }).rows : [];
  for (const step of [...ordered, ...second]) {
    lines.push(`${step.order + 1}. ${flat(step.label)}`);
    lines.push(label(c.topic, COORDINATION_TOPICS[language][step.topic]));
    lines.push(label(c.priority, COORDINATION_PRIORITIES[language][step.priority]));
    lines.push(label(c.question, step.question));
    lines.push(label(c.fallback, step.fallbackQuestion || "UNKNOWN"));
    lines.push(label(c.status, COORDINATION_STATUSES[language][step.status]));
    lines.push(label(c.contact, step.contactMethod || "UNKNOWN"));
    lines.push(label(c.note, step.note || "UNKNOWN"));
    lines.push(c.physicalUnknown);
    if (step.provenance === null) lines.push(c.sourceUnknown);
    else {
      lines.push(label(c.source, step.provenance.source));
      lines.push(label(c.licence, step.provenance.licence));
      lines.push(label(c.sourceDate, step.provenance.date));
    }
    lines.push("");
  }
  lines.push(c.importWarning, c.effect);
  return lines.join("\n").replace(/\n+$/u, "") + "\n";
}
/** Filename is a plain ASCII stem, never a path or external URL. */
export function coordinationBriefFilename(region: string, date: string, extension: "json" | "txt"): string {
  const stem = region.normalize("NFKD").replace(/[\u0300-\u036f]/gu, "").toLowerCase()
    .replace(/[^a-z0-9-]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 48) || "region";
  const safeDate = /^\d{4}-\d{2}-\d{2}$/u.test(date) ? date : "unknown-date";
  return `offline-coordination-${stem}-${safeDate}.${extension}`;
}
export function coordinationBriefJson(book: CoordinationBrief): string { return encodeCoordinationBrief(book); }
/** Browser download is explicit and does not store files or communicate with any server. */
export function downloadCoordinationBrief(doc: Document, contents: string, filename: string, format: "json" | "txt"): void {
  if (new TextEncoder().encode(contents).byteLength > 360_000) throw new RangeError("File too large");
  if (!/^offline-coordination-[a-z0-9-]+\.(?:json|txt)$/u.test(filename)) throw new TypeError("Invalid filename");
  const blob = new Blob([contents], { type: format === "json" ? "application/json;charset=utf-8" : "text/plain;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = doc.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  doc.body.append(anchor);
  try { anchor.click(); } finally { anchor.remove(); URL.revokeObjectURL(objectUrl); }
}
