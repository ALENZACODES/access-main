import type { SavedFile } from "../../states/downloadFile";
import { parsePackingList, type PackingList } from "./model";
import type { PackingLanguage } from "./packingCopy";

export const BACKUP_BYTE_LIMIT = 2 * 1024 * 1024;

type FileProblem = "size" | "read" | "encoding" | "format";
type BackupResult = { ok: true; list: PackingList } | { ok: false; problem: FileProblem };

export async function readPackingBackup(file: Blob): Promise<BackupResult> {
  if (file.size > BACKUP_BYTE_LIMIT) return { ok: false, problem: "size" };

  let buffer: ArrayBuffer;
  try {
    buffer = await file.arrayBuffer();
  } catch {
    return { ok: false, problem: "read" };
  }
  if (buffer.byteLength > BACKUP_BYTE_LIMIT) return { ok: false, problem: "size" };

  let raw: string;
  try {
    raw = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return { ok: false, problem: "encoding" };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return { ok: true, list: parsePackingList(parsed) };
  } catch {
    return { ok: false, problem: "format" };
  }
}

export function packingBackupFile(list: PackingList): SavedFile {
  return {
    name: "packing-list.json",
    mime: "application/json;charset=utf-8",
    content: JSON.stringify(list, null, 2) + "\n",
  };
}

const checklistWords = {
  en: {
    title: "Packing and return checklist",
    list: "List",
    bag: "Bag",
    planned: "Planned",
    packed: "Packed",
    returned: "Returned",
    notes: "Note",
    emptyBag: "No items in this bag.",
    emptyList: "No bags in this list.",
    legend: "UNKNOWN means the count has not been recorded.",
    colon: ": ",
  },
  fr: {
    title: "Liste de préparation et de retour",
    list: "Liste",
    bag: "Sac",
    planned: "Prévus",
    packed: "Emportés",
    returned: "Rapportés",
    notes: "Note",
    emptyBag: "Ce sac ne contient aucun article.",
    emptyList: "Cette liste ne contient aucun sac.",
    legend: "UNKNOWN indique que la quantité n’a pas été consignée.",
    colon: "\u00a0: ",
  },
} as const;

export function packingChecklistFile(
  list: PackingList,
  language: PackingLanguage,
  includeNotes = false,
): SavedFile {
  const w = checklistWords[language];
  const lines = [w.title, w.list + w.colon + list.title, w.legend];
  if (!list.bags.length) lines.push("", w.emptyList);

  for (const bag of list.bags) {
    lines.push("", w.bag + w.colon + bag.name);
    if (!bag.items.length) lines.push(w.emptyBag);
    for (const item of bag.items) {
      lines.push("- " + item.name);
      const counts = [
        w.planned + w.colon + item.quantity,
        w.packed + w.colon + (item.packed ?? "UNKNOWN"),
        w.returned + w.colon + (item.returned ?? "UNKNOWN"),
      ];
      lines.push("  " + counts.join(" · "));
      if (includeNotes && item.note) {
        const note = item.note.replace(/\r\n?|[\n\u2028\u2029]/g, "\n    ");
        lines.push("  " + w.notes + w.colon + note);
      }
    }
  }

  return {
    name: "packing-list.txt",
    mime: "text/plain;charset=utf-8",
    content: lines.join("\n") + "\n",
  };
}
