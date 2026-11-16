import { type CleanupOutcome } from "./cleanupController";
import { type RegionInventory } from "./regionInventory";
import { type Language, type RegionManifest, type Provenance } from "./regionDownload";

export interface CleanupReceiptItem {
  readonly id: string;
  readonly action: "removed" | "retained";
  readonly listedBytes: number;
  readonly source: string;
  readonly licence: string;
  readonly sourceDate: string;
  readonly offlineStateAfter: "UNKNOWN" | "SAVED";
}
export interface CleanupReceipt {
  readonly schema: "app-offline-cleanup-v1";
  readonly regionId: string;
  readonly createdOn: string;
  readonly stop: CleanupOutcome["stop"];
  readonly removedCount: number;
  readonly retainedCount: number;
  readonly items: readonly CleanupReceiptItem[];
  readonly evidence: "device-local-inventory";
}

function dateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Receipt contents are limited to identifiers already listed in the manifest;
 * no device address, position, user profile, coordinates, or stored cell bytes.
 */
export function createCleanupReceipt(
  manifest: RegionManifest,
  outcome: CleanupOutcome,
  date: string,
): CleanupReceipt {
  if (!dateOnly(date)) throw new RangeError("Invalid cleanup receipt date");
  if (outcome.regionId !== manifest.regionId) throw new Error("Cleanup receipt region mismatch");
  if (!outcome.latestInventory || outcome.latestInventory.regionId !== manifest.regionId) {
    throw new Error("Latest offline inventory unavailable");
  }
  const source = new Map<string, { readonly bytes: number; readonly provenance: Provenance }>();
  for (const cell of manifest.cells) {
    if (source.has(cell.id)) throw new Error("Duplicate manifest cell");
    source.set(cell.id, { bytes: cell.bytes, provenance: cell.provenance });
  }
  const seen = new Set<string>();
  const items: CleanupReceiptItem[] = [];
  const add = (ids: readonly string[], action: CleanupReceiptItem["action"]): void => {
    for (const id of ids) {
      if (seen.has(id)) throw new Error("Duplicate cleanup result identifier");
      seen.add(id);
      const cell = source.get(id);
      if (!cell) throw new Error("Unlisted cleanup receipt identifier");
      const state = outcome.latestInventory!.cells.find((entry) => entry.id === id);
      if (!state || state.provenance.source !== cell.provenance.source ||
        state.provenance.licence !== cell.provenance.licence ||
        state.provenance.date !== cell.provenance.date ||
        state.expectedBytes !== cell.bytes) {
        throw new Error("Cleanup receipt inventory differs from the listing");
      }
      items.push({
        id, action, listedBytes: cell.bytes,
        source: cell.provenance.source, licence: cell.provenance.licence,
        sourceDate: cell.provenance.date,
        offlineStateAfter: state.state === "saved" ? "SAVED" : "UNKNOWN",
      });
    }
  };
  add(outcome.deleted, "removed");
  add(outcome.retained, "retained");
  return {
    schema: "app-offline-cleanup-v1", regionId: manifest.regionId,
    createdOn: date, stop: outcome.stop,
    removedCount: outcome.deleted.length, retainedCount: outcome.retained.length,
    items, evidence: "device-local-inventory",
  };
}

const RECEIPT_COPY = {
  en: {
    heading: "Offline copy removal record",
    date: "Created on", region: "Region", stop: "Result",
    removed: "Copies removed", retained: "Copies retained",
    item: "Cell", action: "Action", bytes: "Listed bytes",
    source: "Source", licence: "Licence", sourceDate: "Source date",
    status: "Offline copy status after action",
    caution: "This report describes saved device copies only. UNKNOWN does not describe a place’s physical accessibility.",
    button: "Save local cleanup report",
    unavailable: "The local report is not available for this result.",
  },
  fr: {
    heading: "Compte rendu des suppressions hors ligne",
    date: "Créé le", region: "Région", stop: "Résultat",
    removed: "Copies supprimées", retained: "Copies conservées",
    item: "Cellule", action: "Action", bytes: "Octets indiqués",
    source: "Source", licence: "Licence", sourceDate: "Date de la source",
    status: "État de la copie hors ligne après l’action",
    caution: "Ce rapport décrit uniquement les copies enregistrées sur cet appareil. INCONNU ne décrit pas l’accessibilité physique d’un lieu.",
    button: "Enregistrer le rapport local de suppression",
    unavailable: "Le rapport local n’est pas disponible pour ce résultat.",
  },
} as const;

export function cleanupReceiptCopy(language: Language): typeof RECEIPT_COPY["en"] | typeof RECEIPT_COPY["fr"] {
  return RECEIPT_COPY[language];
}

function cleanField(value: string): string {
  return value.replace(/[\r\n\t\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/gu, " ");
}

/** UTF-8 text includes its own source/licence/date columns. */
export function cleanupReceiptText(receipt: CleanupReceipt, language: Language): string {
  const copy = RECEIPT_COPY[language];
  const rows = [
    copy.heading,
    `${copy.date}: ${receipt.createdOn}`,
    `${copy.region}: ${cleanField(receipt.regionId)}`,
    `${copy.stop}: ${receipt.stop}`,
    `${copy.removed}: ${receipt.removedCount}`,
    `${copy.retained}: ${receipt.retainedCount}`,
    "",
    [copy.item, copy.action, copy.bytes, copy.source, copy.licence,
      copy.sourceDate, copy.status].join("\t"),
  ];
  for (const item of receipt.items) {
    rows.push([
      cleanField(item.id), item.action, String(item.listedBytes),
      cleanField(item.source), cleanField(item.licence),
      cleanField(item.sourceDate), item.offlineStateAfter,
    ].join("\t"));
  }
  rows.push("", copy.caution);
  if (language === "fr") {
    return `${rows.join("\n").replace(/(?<!\u00a0):/gu, "\u00a0:")}\n`;
  }
  return `${rows.join("\n")}\n`;
}

/** File names are local-only; user supplied identifiers cannot become paths. */
export function cleanupReceiptFilename(
  receipt: CleanupReceipt,
  format: "txt" | "json",
): string {
  const region = receipt.regionId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 64) || "region";
  return `offline-cleanup-${region}-${receipt.createdOn}.${format}`;
}

/** Never fetches or uploads: a plain Blob download from a direct user gesture. */
export function saveCleanupReceipt(
  receipt: CleanupReceipt,
  language: Language,
  format: "txt" | "json",
  doc: Document,
): void {
  const text = format === "json" ? `${JSON.stringify(receipt, null, 2)}\n` :
    cleanupReceiptText(receipt, language);
  const blob = new Blob([text], {
    type: format === "json" ? "application/json;charset=utf-8" : "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  try {
    const link = doc.createElement("a");
    link.href = url;
    link.download = cleanupReceiptFilename(receipt, format);
    link.style.display = "none";
    doc.body.append(link);
    try { link.click(); } finally { link.remove(); }
  } finally {
    URL.revokeObjectURL(url);
  }
}
