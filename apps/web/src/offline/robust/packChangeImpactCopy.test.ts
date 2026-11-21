import { describe, expect, it } from "vitest";
import { auditPackChangeCopy, PACK_CHANGE_COPY, PACK_CHANGE_KIND, PACK_CHANGE_PRIORITY,
  PACK_CHANGE_SORT, packChangeCopy } from "./packChangeImpactCopy";
describe("bilingual offline pack change review", () => {
  it("has matching copy keys", () => { expect(Object.keys(PACK_CHANGE_COPY.en)).toEqual(Object.keys(PACK_CHANGE_COPY.fr)); });
  it("passes French typography check", () => { expect(auditPackChangeCopy()).toEqual([]); });
  it("keeps UNKNOWN literal in English", () => { expect(PACK_CHANGE_COPY.en.unknown).toBe("UNKNOWN"); });
  it("keeps UNKNOWN literal in French", () => { expect(PACK_CHANGE_COPY.fr.unknown).toBe("UNKNOWN"); });
  it("explains physical uncertainty in English", () => { expect(PACK_CHANGE_COPY.en.caution).toContain("UNKNOWN"); });
  it("explains physical uncertainty in French", () => { expect(PACK_CHANGE_COPY.fr.caution).toContain("UNKNOWN"); });
  it("has all change kinds in both languages", () => { expect(Object.keys(PACK_CHANGE_KIND.en)).toEqual(Object.keys(PACK_CHANGE_KIND.fr)); });
  it("has all sort orders in both languages", () => { expect(Object.keys(PACK_CHANGE_SORT.en)).toEqual(Object.keys(PACK_CHANGE_SORT.fr)); });
  it("has all priorities in both languages", () => { expect(Object.keys(PACK_CHANGE_PRIORITY.en)).toEqual(Object.keys(PACK_CHANGE_PRIORITY.fr)); });
  it("presents a text export in both languages", () => { expect(PACK_CHANGE_COPY.en.exportText.length > 0 && PACK_CHANGE_COPY.fr.exportText.length > 0).toBe(true); });
  it("presents JSON export in both languages", () => { expect(PACK_CHANGE_COPY.en.exportJson.length > 0 && PACK_CHANGE_COPY.fr.exportJson.length > 0).toBe(true); });
  it("retains original title by language", () => { expect(packChangeCopy("en").title).toBe(PACK_CHANGE_COPY.en.title); });
  it("selects French title", () => { expect(packChangeCopy("fr").title).toBe(PACK_CHANGE_COPY.fr.title); });
  it("warns that no pack files are exported", () => { expect(PACK_CHANGE_COPY.en.privacy).toContain("downloaded files"); });
  it("includes a clear action", () => { expect(PACK_CHANGE_COPY.en.clear.length > 0).toBe(true); });
  it("mentions that comparison does not download files", () => { expect(PACK_CHANGE_COPY.en.intro).toContain("No files"); });
  it("provides polite error text without false promises", () => { expect(PACK_CHANGE_COPY.fr.error).not.toContain("garanti"); });
  it("uses curved apostrophes", () => { expect(Object.values(PACK_CHANGE_COPY.fr).every((value) => !value.includes("'"))).toBe(true); });
  it("does not have empty copy", () => { expect(Object.values(PACK_CHANGE_COPY.en).every((value) => value.length > 0)).toBe(true); });
});
