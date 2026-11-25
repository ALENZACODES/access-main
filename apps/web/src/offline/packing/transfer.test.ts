import { describe, expect, it, vi } from "vitest";
import { PACKING_LIMITS, type PackingList } from "./model";
import { BACKUP_BYTE_LIMIT, packingBackupFile, packingChecklistFile, readPackingBackup } from "./transfer";

function list(): PackingList {
  return {
    schema: "offline-packing-list-v1",
    title: "Fin de semaine",
    bags: [
      {
        id: "carry-bag", name: "Sac à dos",
        items: [
          { id: "folding-cane", name: "Canne pliante", quantity: 1, packed: null, returned: null, note: "Pochette bleue" },
          { id: "spare-cable", name: "Câble USB", quantity: 2, packed: 1, returned: 0, note: "" },
        ],
      },
      { id: "empty-bag", name: "Sac vide", items: [] },
    ],
  };
}

describe("packing backup files", () => {
  it("preserves identifiers, bag order, personal notes, and null counts in a round trip", async () => {
    const original = list();
    const file = packingBackupFile(original);
    expect(file.name).toBe("packing-list.json");
    expect(file.mime).toBe("application/json;charset=utf-8");
    const restored = await readPackingBackup(new Blob([file.content]));
    expect(restored).toEqual({ ok: true, list: original });
    if (!restored.ok) throw Error("expected backup to open");
    expect(restored.list.bags).not.toBe(original.bags);
    expect(restored.list.bags[0]?.items[0]?.note).toBe("Pochette bleue");
    expect(restored.list.bags[0]?.items[0]?.packed).toBeNull();
    expect(restored.list.bags[0]?.items[1]?.returned).toBe(0);
  });

  it("accepts an empty list and a UTF-8 byte-order mark from an editor", async () => {
    const empty = { ...list(), bags: [] };
    const file = new Blob([new Uint8Array([0xef, 0xbb, 0xbf]), JSON.stringify(empty)]);
    await expect(readPackingBackup(file)).resolves.toEqual({ ok: true, list: empty });
  });

  it("keeps user-entered text out of the backup and checklist file names", () => {
    const original = { ...list(), title: "../private-person: 🎒" };
    for (const file of [packingBackupFile(original), packingChecklistFile(original, "fr")]) {
      expect(file.name).toMatch(/^packing-list\.(txt|json)$/);
    }
  });

  it("rejects oversize files before reading them", async () => {
    const file = new Blob(["a"]);
    const read = vi.spyOn(file, "arrayBuffer");
    Object.defineProperty(file, "size", { value: BACKUP_BYTE_LIMIT + 1 });
    await expect(readPackingBackup(file)).resolves.toEqual({ ok: false, problem: "size" });
    expect(read).not.toHaveBeenCalled();
  });

  it("checks actual bytes even if the read result exceeds the advertised size", async () => {
    const file = new Blob([""]);
    vi.spyOn(file, "arrayBuffer").mockResolvedValue(new ArrayBuffer(BACKUP_BYTE_LIMIT + 1));
    await expect(readPackingBackup(file)).resolves.toEqual({ ok: false, problem: "size" });
  });

  it("accepts an exact-limit document with multibyte characters", async () => {
    const original = list();
    const source = JSON.stringify(original);
    const file = new Blob([" ".repeat(BACKUP_BYTE_LIMIT - new Blob([source]).size), source]);
    expect(file.size).toBe(BACKUP_BYTE_LIMIT);
    await expect(readPackingBackup(file)).resolves.toEqual({ ok: true, list: original });
  });

  it("exports a full list containing long non-ASCII notes that can still be restored", async () => {
    const full: PackingList = {
      ...list(),
      bags: [{
        id: "bag", name: "Bag",
        items: Array.from({ length: PACKING_LIMITS.items }, (_, index) => ({
          id: "item-" + index,
          name: "雪".repeat(PACKING_LIMITS.name),
          quantity: PACKING_LIMITS.quantity,
          packed: null,
          returned: null,
          note: "風".repeat(PACKING_LIMITS.note),
        })),
      }],
    };
    const file = new Blob([packingBackupFile(full).content]);
    expect(file.size).toBeLessThan(BACKUP_BYTE_LIMIT);
    const result = await readPackingBackup(file);
    expect(result.ok && result.list.bags[0]?.items.length).toBe(PACKING_LIMITS.items);
  });

  it("distinguishes unreadable files from unsupported JSON", async () => {
    const file = new Blob([""]);
    vi.spyOn(file, "arrayBuffer").mockRejectedValue(new Error("device unavailable"));
    await expect(readPackingBackup(file)).resolves.toEqual({ ok: false, problem: "read" });
    await expect(readPackingBackup(new Blob(["{"]))).resolves.toEqual({ ok: false, problem: "format" });
  });

  it("rejects invalid UTF-8 inside a JSON string instead of silently changing a label", async () => {
    const file = new Blob(['{"schema":"offline-packing-list-v1","title":"', new Uint8Array([0x80]), '","bags":[]}']);
    await expect(readPackingBackup(file)).resolves.toEqual({ ok: false, problem: "encoding" });
  });

  it("rejects the entire backup when a late bag collides with an existing ID", async () => {
    const original = list();
    const input = { ...original, bags: [...original.bags, { id: "carry-bag", name: "Another", items: [] }] };
    await expect(readPackingBackup(new Blob([JSON.stringify(input)]))).resolves.toEqual({ ok: false, problem: "format" });
  });

  it("rejects other JSON documents and alternate schema versions", async () => {
    for (const source of [JSON.stringify({ ...list(), schema: "offline-packing-list-v2" }), "[]", "null"]) {
      await expect(readPackingBackup(new Blob([source]))).resolves.toEqual({ ok: false, problem: "format" });
    }
  });
});

describe("human-readable packing checklists", () => {
  it("prints bags and their contents in list order, including empty bags", () => {
    const file = packingChecklistFile(list(), "en");
    expect(file.name).toBe("packing-list.txt");
    expect(file.mime).toBe("text/plain;charset=utf-8");
    expect(file.content.split("\n")).toEqual([
      "Packing and return checklist",
      "List: Fin de semaine",
      "UNKNOWN means the count has not been recorded.",
      "",
      "Bag: Sac à dos",
      "- Canne pliante",
      "  Planned: 1 · Packed: UNKNOWN · Returned: UNKNOWN",
      "- Câble USB",
      "  Planned: 2 · Packed: 1 · Returned: 0",
      "",
      "Bag: Sac vide",
      "No items in this bag.",
      "",
    ]);
  });

  it("omits internal keys and notes from the text copy by default", () => {
    const original = list();
    const { content } = packingChecklistFile(original, "en");
    for (const hidden of ["carry-bag", "folding-cane", "spare-cable", "Pochette bleue", "offline-packing-list-v1"]) {
      expect(content).not.toContain(hidden);
    }
    expect(original.bags[0]?.items[0]?.note).toBe("Pochette bleue");
  });

  it("includes notes only when chosen, and never creates a blank note label", () => {
    const { content } = packingChecklistFile(list(), "fr", true);
    expect(content.split("\n").filter(line => line.includes("Note\u00a0:"))).toEqual(["  Note\u00a0: Pochette bleue"]);
    expect(content).toContain("Prévus\u00a0: 1 · Emportés\u00a0: UNKNOWN · Rapportés\u00a0: UNKNOWN");
    expect(content).toContain("Prévus\u00a0: 2 · Emportés\u00a0: 1 · Rapportés\u00a0: 0");
    expect(content).toContain("Sac\u00a0: Sac vide\nCe sac ne contient aucun article.");
    expect(content).not.toContain(" :");
  });

  it("keeps multiline notes indented within their item, including pasted paragraph breaks", () => {
    const original = list();
    const item = original.bags[0]?.items[0];
    if (!item) throw Error("missing item");
    item.note = "Outside pocket\r\nGreen clip\rBack flap\u2028Front strap\u2029Small pouch";
    const { content } = packingChecklistFile(original, "en", true);
    expect(content).toContain([
      "  Note: Outside pocket",
      "    Green clip",
      "    Back flap",
      "    Front strap",
      "    Small pouch",
    ].join("\n"));
    expect(packingChecklistFile(original, "en").content).not.toContain("Green clip");
  });

  it("can share an empty list in either language", () => {
    const empty = { ...list(), bags: [] };
    expect(packingChecklistFile(empty, "en").content).toContain("No bags in this list.");
    expect(packingChecklistFile(empty, "fr").content).toContain("Cette liste ne contient aucun sac.");
  });

  it("never treats the text checklist as a backup", async () => {
    const text = packingChecklistFile(list(), "en", true);
    await expect(readPackingBackup(new Blob([text.content]))).resolves.toEqual({ ok: false, problem: "format" });
  });
});
