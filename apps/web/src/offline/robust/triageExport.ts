import { selectableIds } from "./cellTriage";
import { type RegionInventory } from "./regionInventory";
import { type Language } from "./regionDownload";

export interface RecoveryListRow {
  readonly id: string;
  readonly status: "UNKNOWN";
  readonly reason: "missing" | "stale" | "unreadable";
  readonly expectedBytes: number;
  readonly source: string;
  readonly licence: string;
  readonly date: string;
}

export interface RecoveryList {
  readonly regionId: string;
  readonly generatedDate: string;
  readonly rowCount: number;
  readonly rows: readonly RecoveryListRow[];
  readonly note: string;
}

function canonicalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Export a small, local-only recovery list with public manifest metadata.
 * Never export payload bytes, storage paths, device identifiers or search history.
 */
export function createTriageRecoveryList(
  inventory: RegionInventory,
  requested: readonly string[],
  generatedDate: string,
): RecoveryList {
  if (!canonicalDate(generatedDate)) throw new RangeError("Invalid report date");
  if (!inventory.regionId.trim()) throw new TypeError("Missing region ID");
  const allowed = new Set(selectableIds(inventory, requested));
  const rows: RecoveryListRow[] = [];
  for (const cell of inventory.cells) {
    if (!allowed.has(cell.id)) continue;
    if (cell.state !== "unknown" || cell.cause === "present") continue;
    if (!Number.isSafeInteger(cell.expectedBytes) || cell.expectedBytes < 0) {
      throw new RangeError("Invalid expected byte count");
    }
    if (!cell.provenance.source.trim() || !cell.provenance.licence.trim() ||
      !canonicalDate(cell.provenance.date)) {
      throw new TypeError("Missing source metadata");
    }
    rows.push({
      id: cell.id,
      status: "UNKNOWN",
      reason: cell.cause,
      expectedBytes: cell.expectedBytes,
      source: cell.provenance.source,
      licence: cell.provenance.licence,
      date: cell.provenance.date,
    });
  }
  return {
    regionId: inventory.regionId,
    generatedDate,
    rowCount: rows.length,
    rows,
    note: "Offline byte status only; does not establish physical accessibility.",
  };
}

export function formatTriageRecoveryList(list: RecoveryList, language: Language): string {
  const en = language === "en";
  const labels = en
    ? { heading: "Offline recovery list", region: "Region", date: "Generated", count: "Cells", id: "Cell", status: "Offline status", reason: "Reason", bytes: "Expected bytes", source: "Source", licence: "Licence", sourceDate: "Source date", note: "Notice" }
    : { heading: "Liste de récupération hors ligne", region: "Région", date: "Créée", count: "Cellules", id: "Cellule", status: "État hors ligne", reason: "Motif", bytes: "Octets prévus", source: "Source", licence: "Licence", sourceDate: "Date de la source", note: "Avis" };
  const colon = en ? ":" : "\u00a0:";
  const reasons = en
    ? { missing: "No copy", stale: "Different copy", unreadable: "Unreadable copy" }
    : { missing: "Aucune copie", stale: "Copie différente", unreadable: "Copie illisible" };
  const lines = [
    labels.heading,
    `${labels.region}${colon} ${list.regionId}`,
    `${labels.date}${colon} ${list.generatedDate}`,
    `${labels.count}${colon} ${list.rowCount}`,
    "",
  ];
  for (const row of list.rows) {
    lines.push(
      `${labels.id}${colon} ${row.id}`,
      `${labels.status}${colon} ${en ? "UNKNOWN" : "INCONNU"}`,
      `${labels.reason}${colon} ${reasons[row.reason]}`,
      `${labels.bytes}${colon} ${row.expectedBytes}`,
      `${labels.source}${colon} ${row.source}`,
      `${labels.licence}${colon} ${row.licence}`,
      `${labels.sourceDate}${colon} ${row.date}`,
      "",
    );
  }
  lines.push(`${labels.note}${colon} ${en
    ? list.note
    : "État des données hors ligne seulement. Aucune conclusion sur l’accessibilité physique."}`);
  return lines.join("\n") + "\n";
}

function safeFileName(value: string): string {
  const safe = value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 64);
  return safe || "region";
}

/** Browser-triggered export only. No network traffic and no hidden persistence. */
export function saveTriageRecoveryList(
  list: RecoveryList,
  language: Language,
  documentRef: Document,
): void {
  const content = formatTriageRecoveryList(list, language);
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = documentRef.createElement("a");
  anchor.href = url;
  anchor.download = `offline-recovery-${safeFileName(list.regionId)}-${list.generatedDate}-${language}.txt`;
  anchor.style.display = "none";
  documentRef.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}
