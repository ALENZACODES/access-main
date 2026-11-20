import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PACKET_LIMITS } from "./recoveryEvidencePacket";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const liveShell = read("./RecoveryCenter.tsx");
const barrel = read("./index.ts");
const model = read("./recoveryEvidencePacket.ts");
const analysis = read("./recoveryEvidenceAnalysis.ts");
const copy = read("./recoveryEvidencePacketCopy.ts");
const ui = read("./RecoveryEvidencePacketPanel.tsx");
const modules = [model, analysis, copy, ui];

describe("local recovery evidence panel contracts", () => {
  it("mounts the evidence panel against active inspection", () => {
    expect(liveShell).toContain('import { RecoveryEvidencePacketPanel } from "./RecoveryEvidencePacketPanel"');
    expect(liveShell).toContain('<RecoveryEvidencePacketPanel locale={locale} records={inventory}');
    expect(liveShell).toContain('inspected={hasInspected && !checking && !inventoryFailure} saveFile={saveFile}');
  });
  it("preserves notebook copy and exports the distinct packet modules", () => {
    expect(barrel).toContain('export { evidenceCopy } from "./recoveryEvidenceCopy"');
    expect(barrel).toContain('from "./recoveryEvidencePacketCopy"');
    expect(barrel).toContain('from "./recoveryEvidencePacket"');
    expect(barrel).toContain('from "./recoveryEvidenceAnalysis"');
  });
  it("uses 44px minimum control height", () => {
    expect(ui).toContain("minHeight: 44");
  });
  it("uses 44px minimum control width", () => {
    expect(ui).toContain("minWidth: 44");
  });
  it("uses a status region for polite messages", () => {
    expect(ui).toContain('role="status"');
    expect(ui).toContain('aria-live="polite"');
  });
  it("uses a labelled section", () => {
    expect(ui).toContain("aria-labelledby={heading}");
  });
  it("uses a labelled entry list", () => {
    expect(ui).toContain("aria-labelledby={listHeading}");
  });
  it("accepts keyboard focus through native controls", () => {
    expect(ui).toContain("<button");
    expect(ui).toContain("<select");
    expect(ui).toContain("<input");
  });
  it("uses an explicit file input", () => {
    expect(ui).toContain('type="file"');
    expect(ui).toContain("onChange=");
  });
  it("does not automatically start downloads", () => {
    expect(ui).not.toContain("downloadRegion(");
  });
  it("does not remove installed packs", () => {
    expect(ui).not.toContain("deleteRegion(");
  });
  it("only exports through a caller-provided save operation", () => {
    expect(ui).toContain("saveFile(");
  });
  it("does not schedule background work", () => {
    for (const content of modules) {
      expect(content).not.toContain("setInterval(");
      expect(content).not.toContain("setTimeout(");
      expect(content).not.toContain("WebSocket(");
    }
  });
  it("does not make any network calls", () => {
    for (const content of modules) expect(content).not.toContain("fetch(");
  });
  it("does not write browser storage", () => {
    for (const content of modules) {
      expect(content).not.toContain("localStorage.setItem(");
      expect(content).not.toContain("indexedDB.open(");
    }
  });
  it("uses bounded manual imports", () => {
    expect(PACKET_LIMITS.bytes).toBeLessThanOrEqual(1_000_000);
    expect(ui).toContain("file.size > PACKET_LIMITS.bytes");
  });
  it("does not automatically overwrite conflicting records", () => {
    expect(ui).toContain("mergePackets(document, staged)");
    expect(model).toContain('return bad("conflict")');
  });
  it("does not invent an observed ready condition", () => {
    expect(model).not.toContain('"ready" |');
  });
  it("does not imply that an evidence packet can authorize pack use", () => {
    expect(model).toContain("packetContentReady");
    expect(analysis).toContain("contentReady: false");
  });
  it("keeps source and licence in every observation", () => {
    expect(model).toContain("readonly licence: string");
    expect(model).toContain("readonly retrievedOn: string");
  });
  it("uses English and French copy tables", () => {
    expect(copy).toContain("const en: PacketCopy");
    expect(copy).toContain("const fr: PacketCopy");
  });
  it("has French nonbreaking colon separators", () => {
    expect(ui).toContain('"\\u00a0: "');
  });
  it("makes status updates user-visible", () => {
    expect(ui).toContain("setMessage(");
  });
  it("keeps file selection user initiated", () => {
    expect(ui).toContain("chooseFile(event)");
  });
  it("does not synthesize unknown source names", () => {
    expect(ui).toContain('entry.source.name || "UNKNOWN"');
  });
  it("does not allow adding evidence without inspected pack", () => {
    expect(ui).toContain("!inspected || !packs.includes(packId)");
  });
  it("does not hide an import conflict", () => {
    expect(ui).toContain("preview.conflicts > 0 || preview.eventConflicts > 0");
  });
});
