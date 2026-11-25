import { describe, expect, it } from "vitest";
import { containsForbiddenOrg } from "../../../../../packages/shared/test/forbiddenOrg.ts";
import { lintCopy } from "../../privacy/panel/copyLint";
import {
  PACK_RECEIPT_COPY,
  RECEIPT_FILTERS,
  RECEIPT_ORDERS,
  receiptChangeText,
  receiptFilterText,
  receiptOrderText,
} from "./packReceiptCopy";

describe("offline receipt copy", () => {
  it("has a title, instructions and caveat in both languages", () => {
    for (const language of ["en", "fr"] as const) {
      const copy = PACK_RECEIPT_COPY[language];
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.intro.length).toBeGreaterThan(30);
      expect(copy.caution.length).toBeGreaterThan(30);
      expect(copy.digestHelp.length).toBeGreaterThan(20);
      expect(copy.open.length).toBeGreaterThan(0);
      expect(copy.close.length).toBeGreaterThan(0);
    }
  });

  it("keeps the exact UNKNOWN token in both languages", () => {
    expect(PACK_RECEIPT_COPY.en.unknown).toBe("UNKNOWN copies");
    expect(PACK_RECEIPT_COPY.fr.unknown).toBe("Copies UNKNOWN");
    expect(receiptChangeText("UNKNOWN", "en")).toBe("UNKNOWN");
    expect(receiptChangeText("UNKNOWN", "fr")).toBe("UNKNOWN");
    expect(receiptFilterText("UNKNOWN", "fr")).toBe("UNKNOWN");
  });

  it("has matching filter and order labels for every supported value", () => {
    for (const value of RECEIPT_FILTERS) {
      expect(receiptFilterText(value, "en").length).toBeGreaterThan(0);
      expect(receiptFilterText(value, "fr").length).toBeGreaterThan(0);
    }
    for (const value of RECEIPT_ORDERS) {
      expect(receiptOrderText(value, "en").length).toBeGreaterThan(0);
      expect(receiptOrderText(value, "fr").length).toBeGreaterThan(0);
    }
  });

  it("passes the shared English and French copy lint", () => {
    for (const language of ["en", "fr"] as const) {
      for (const value of Object.values(PACK_RECEIPT_COPY[language])) {
        expect(lintCopy(language, value), value).toEqual([]);
      }
    }
    for (const value of Object.values(PACK_RECEIPT_COPY.fr)) {
      expect(value).not.toMatch(/ [;:!?]/u);
      expect(value).not.toContain("'");
    }
  });

  it("does not use forbidden organisation references or restricted claims", () => {
    for (const language of ["en", "fr"] as const) {
      for (const value of Object.values(PACK_RECEIPT_COPY[language])) {
        expect(containsForbiddenOrg(value)).toBe(false);
        expect(value).not.toMatch(/verified|verif|vérif|real-time|partnership|guarantee/i);
      }
    }
  });

  it("keeps the digest caveat distinct from a signature or source attestation", () => {
    expect(PACK_RECEIPT_COPY.en.digestHelp).toContain("not a signature");
    expect(PACK_RECEIPT_COPY.fr.digestHelp).toContain("ni une signature");
    expect(PACK_RECEIPT_COPY.en.digestHelp).not.toContain("proof");
    expect(PACK_RECEIPT_COPY.fr.digestHelp).not.toContain("preuve");
  });
});
