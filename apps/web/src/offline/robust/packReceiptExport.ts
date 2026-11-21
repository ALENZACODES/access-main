import type { Language } from "./regionDownload";
import {
  comparePackReceipts,
  encodeReceiptBook,
  latestReceiptDiff,
  type PackReceipt,
  type ReceiptBook,
  type ReceiptDiff,
} from "./packReceipt";
import { receiptChangeText } from "./packReceiptCopy";

/** Text exports contain the receipt summary and declared metadata only. */
export function receiptComparisonText(diff: ReceiptDiff | null, language: Language): string {
  const fr = language === "fr";
  const label = (en: string, french: string): string => fr ? french : en;
  const colon = fr ? "\u00a0:" : ":";
  if (diff === null) {
    return [
      label("Offline pack receipt comparison", "Comparaison des reçus de pack hors ligne"),
      label("Status", "État") + colon + " UNKNOWN",
      label("No pair of readings is available.", "Aucune paire de lectures n’est disponible."),
    ].join("\n") + "\n";
  }
  const out = [
    label("Offline pack receipt comparison", "Comparaison des reçus de pack hors ligne"),
    label("Region", "Région") + colon + " " + diff.regionId,
    label("Earlier reading", "Lecture précédente") + colon + " " + diff.from,
    label("Later reading", "Lecture suivante") + colon + " " + diff.to,
    label("Comparison status", "État de la comparaison") + colon + " " + diff.status,
    label("Cells in comparison", "Cellules comparées") + colon + " " + diff.rows.length,
    "",
  ];
  for (const row of diff.rows) {
    const earlier = row.before;
    const later = row.after;
    const source = later?.source ?? earlier?.source;
    out.push(row.id + " — " + receiptChangeText(row.change, language));
    out.push(label("Source", "Source") + colon + " " + (source?.source ?? "UNKNOWN"));
    out.push(label("Licence", "Licence") + colon + " " + (source?.licence ?? "UNKNOWN"));
    out.push(label("Source date", "Date de la source") + colon + " " + (source?.date ?? "UNKNOWN"));
    out.push(label("Listed bytes", "Octets répertoriés") + colon + " " + (later?.bytes ?? earlier?.bytes ?? "UNKNOWN"));
    out.push(label("Earlier local state", "État local précédent") + colon + " " + (earlier?.state ?? "UNKNOWN"));
    out.push(label("Later local state", "État local suivant") + colon + " " + (later?.state ?? "UNKNOWN"), "");
  }
  out.push(label(
    "These are historical device readings. They do not establish current storage or physical access.",
    "Ces lectures sont historiques. Elles n’établissent ni le stockage actuel ni l’accès physique.",
  ));
  return out.join("\n") + "\n";
}

export function receiptBookText(book: ReceiptBook, language: Language): string {
  return receiptComparisonText(latestReceiptDiff(book), language);
}

export function receiptFilename(regionId: string, format: "json" | "txt"): string {
  const safe = regionId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80) || "region";
  return "offline-pack-receipts-" + safe + "." + format;
}

export function receiptJson(book: ReceiptBook): string {
  return encodeReceiptBook(book);
}

export function receiptTextBetween(
  earlier: PackReceipt,
  later: PackReceipt,
  language: Language,
): string {
  return receiptComparisonText(comparePackReceipts(earlier, later), language);
}

/** Download is always initiated by the person pressing the export control. */
export function saveReceiptFile(
  book: ReceiptBook,
  language: Language,
  format: "json" | "txt",
  doc: Document,
): void {
  const content = format === "json" ? receiptJson(book) : receiptBookText(book, language);
  const blob = new Blob([content], {
    type: format === "json" ? "application/json;charset=utf-8" : "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  try {
    const link = doc.createElement("a");
    link.href = url;
    link.download = receiptFilename(book.regionId, format);
    link.rel = "noopener";
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
