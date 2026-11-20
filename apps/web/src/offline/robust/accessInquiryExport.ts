import type { Language } from "./regionDownload";
import { encodeInquiryBook, inquiryPage, inquirySummary, validateInquiryBook,
  type InquiryBook, type InquiryQuestion } from "./accessInquiry";
import { INQUIRY_CHANNEL_LABELS, INQUIRY_COPY, INQUIRY_IMPORTANCE_LABELS,
  INQUIRY_PROGRESS_LABELS, INQUIRY_TOPIC_LABELS } from "./accessInquiryCopy";

export type InquiryExportFormat = "json" | "txt";
export interface InquiryExportRecord {
  readonly format: "access-inquiry-report-v1";
  readonly locale: Language;
  readonly exportedAt: string;
  readonly condition: "UNKNOWN";
  readonly places: number;
  readonly questions: number;
  readonly unanswered: number;
  readonly notes: number;
  readonly book: InquiryBook;
}
function clean(value: string): string {
  // Plain text strips control, bidirectional override and unsafe invisible format marks.
  return [...value].map((character) => {
    const code = character.codePointAt(0) ?? 0;
    if (code < 32 && code !== 10 && code !== 9 || code === 127 ||
      code >= 0x202a && code <= 0x202e || code >= 0x2066 && code <= 0x2069) return " ";
    return character;
  }).join("").replace(/\s+/gu, " ").trim();
}
function isTimestamp(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(value) &&
    Number.isFinite(Date.parse(value));
}
export function createInquiryReport(book: InquiryBook, language: Language, at: string): InquiryExportRecord {
  if (!isTimestamp(at)) throw new TypeError("Invalid export date");
  const validated = validateInquiryBook(book);
  const counts = inquirySummary(validated);
  return {
    format: "access-inquiry-report-v1", locale: language,
    exportedAt: at, condition: "UNKNOWN", places: counts.places,
    questions: counts.questions, unanswered: counts.questions - counts.replies,
    notes: validated.events.length, book: validated,
  };
}
export function inquiryExportFilename(kind: InquiryExportFormat, date: string): string {
  const day = /^\d{4}-\d{2}-\d{2}$/u.test(date) &&
    Number.isFinite(Date.parse(`${date}T00:00:00Z`)) ? date : "unknown-date";
  return `access-inquiry-${day}.${kind}`;
}
export function serializeInquiryReport(record: InquiryExportRecord): string {
  const cleanBook = validateInquiryBook(record.book);
  const data: InquiryExportRecord = { ...record, book: cleanBook, condition: "UNKNOWN" };
  const text = JSON.stringify(data, null, 2) + "\n";
  if (new TextEncoder().encode(text).byteLength > 524288) throw new RangeError("Report exceeds limit");
  return text;
}
function description(question: InquiryQuestion, language: Language): string {
  const label = INQUIRY_TOPIC_LABELS[language][question.topic];
  const importance = INQUIRY_IMPORTANCE_LABELS[language][question.importance];
  const progress = INQUIRY_PROGRESS_LABELS[language][question.progress];
  return `${label} | ${importance} | ${progress}`;
}
/** Plain-text contact sheet. Includes user notes; explicit export only. */
export function formatInquiryReport(record: InquiryExportRecord): string {
  const fr = record.locale === "fr";
  const colon = fr ? "\u00a0:" : ":";
  const field = (key: string, value: string | number): string => `${key}${colon} ${clean(String(value))}`;
  const lines: string[] = [
    INQUIRY_COPY[record.locale].title,
    field(fr ? "Exporté le" : "Exported at", record.exportedAt),
    field(fr ? "Conditions" : "Conditions", "UNKNOWN"),
    field(fr ? "Lieux" : "Places", record.places),
    field(fr ? "Questions" : "Questions", record.questions),
    field(fr ? "Sans réponse consignée" : "Outstanding", record.unanswered),
    field(fr ? "Notes" : "Notes", record.notes), "",
  ];
  for (const place of record.book.places) {
    lines.push(clean(place.label), field(fr ? "Secteur" : "Area", place.area),
      field(fr ? "Visite prévue" : "Planned visit", place.plannedDate ?? "UNKNOWN"));
    const page = inquiryPage(record.book, { placeId: place.id, limit: 40 });
    const placeQuestions = record.book.questions.filter((item) => item.placeId === place.id);
    const ids = new Set(page.rows.map((row) => row.question.id));
    const ordered = [ ...page.rows.map((row) => row.question),
      ...placeQuestions.filter((question) => !ids.has(question.id)) ];
    for (const question of ordered) {
      lines.push(`- ${clean(question.prompt)}`);
      lines.push(`  ${description(question, record.locale)}`);
      lines.push(`  ${field(fr ? "Condition" : "Condition", "UNKNOWN")}`);
      for (const event of record.book.events.filter((item) => item.questionId === question.id)) {
        lines.push(`  ${field(fr ? "Note" : "Note", clean(event.note))}`);
        lines.push(`  ${field(fr ? "Méthode" : "Channel", INQUIRY_CHANNEL_LABELS[record.locale][event.channel])}`);
        lines.push(`  ${field(fr ? "Date de la source" : "Source date", event.sourceDate ?? "UNKNOWN")}`);
      }
    }
    lines.push("");
  }
  lines.push(INQUIRY_COPY[record.locale].reason, INQUIRY_COPY[record.locale].private);
  return lines.join("\n") + "\n";
}
export function createInquiryExport(book: InquiryBook, language: Language,
  kind: InquiryExportFormat, at: string): { filename: string; content: string; mime: string } {
  const report = createInquiryReport(book, language, at);
  const content = kind === "json" ? serializeInquiryReport(report) : formatInquiryReport(report);
  return { filename: inquiryExportFilename(kind, at.slice(0, 10)), content,
    mime: kind === "json" ? "application/json;charset=utf-8" : "text/plain;charset=utf-8" };
}
export function saveInquiryExport(book: InquiryBook, language: Language, kind: InquiryExportFormat,
  doc: Document, at: string): void {
  const payload = createInquiryExport(book, language, kind, at);
  const blob = new Blob([payload.content], { type: payload.mime });
  const uri = URL.createObjectURL(blob);
  const anchor = doc.createElement("a");
  anchor.href = uri;
  anchor.download = payload.filename;
  doc.body.append(anchor);
  try { anchor.click(); } finally { anchor.remove(); URL.revokeObjectURL(uri); }
}
/** JSON imports may be either a book file or a metadata report wrapper. */
export function decodeInquiryExport(text: string): InquiryBook {
  if (new TextEncoder().encode(text).byteLength > 524288) throw new RangeError("Import limit reached");
  const value: unknown = JSON.parse(text);
  if (typeof value === "object" && value !== null && "format" in value &&
    value.format === "access-inquiry-report-v1" && "book" in value) {
    return validateInquiryBook(value.book);
  }
  const book: InquiryBook = JSON.parse(encodeInquiryBook(validateInquiryBook(value))) as InquiryBook;
  return book;
}
