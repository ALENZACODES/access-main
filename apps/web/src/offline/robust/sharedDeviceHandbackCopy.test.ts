import { describe, expect, it } from "vitest";
import { containsForbiddenOrg } from "../../../../../packages/shared/test/forbiddenOrg.ts";
import { lintCopy } from "../../privacy/panel/copyLint";
import {
  HANDBACK_COPY,
  HANDBACK_ITEM_COPY,
  HANDBACK_CATEGORY_LABELS,
  HANDBACK_FILTER_LABELS,
  HANDBACK_ORDER_LABELS,
  handbackCategoryText,
  handbackFilterText,
  handbackOrderText,
} from "./sharedDeviceHandbackCopy";
import {
  HANDBACK_CATEGORIES,
  HANDBACK_FILTERS,
  HANDBACK_ITEMS,
  HANDBACK_ORDERS,
} from "./sharedDeviceHandback";

describe("shared-device handback bilingual copy", () => {
  it("has a title, explanation and boundary in both languages", () => {
    for (const language of ["en", "fr"] as const) {
      const copy = HANDBACK_COPY[language];
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.intro.length).toBeGreaterThan(20);
      expect(copy.boundary.length).toBeGreaterThan(50);
      expect(copy.privacy.length).toBeGreaterThan(20);
      expect(copy.history.length).toBeGreaterThan(20);
    }
  });

  it("has a translated prompt for every fixed checklist item", () => {
    for (const item of HANDBACK_ITEMS) {
      expect(HANDBACK_ITEM_COPY.en[item.id]?.length).toBeGreaterThan(0);
      expect(HANDBACK_ITEM_COPY.fr[item.id]?.length).toBeGreaterThan(0);
      expect(HANDBACK_ITEM_COPY.en[item.id]).not.toBe(HANDBACK_ITEM_COPY.fr[item.id]);
    }
  });

  it("has labels for every category, filter and sort order", () => {
    for (const category of HANDBACK_CATEGORIES) {
      expect(HANDBACK_CATEGORY_LABELS.en[category]).toBeTruthy();
      expect(HANDBACK_CATEGORY_LABELS.fr[category]).toBeTruthy();
      expect(handbackCategoryText(category, "fr")).toBe(HANDBACK_CATEGORY_LABELS.fr[category]);
    }
    for (const filter of HANDBACK_FILTERS) {
      expect(HANDBACK_FILTER_LABELS.en[filter]).toBeTruthy();
      expect(HANDBACK_FILTER_LABELS.fr[filter]).toBeTruthy();
      expect(handbackFilterText(filter, "fr")).toBe(HANDBACK_FILTER_LABELS.fr[filter]);
    }
    for (const order of HANDBACK_ORDERS) {
      expect(HANDBACK_ORDER_LABELS.en[order]).toBeTruthy();
      expect(HANDBACK_ORDER_LABELS.fr[order]).toBeTruthy();
      expect(handbackOrderText(order, "fr")).toBe(HANDBACK_ORDER_LABELS.fr[order]);
    }
  });

  it("keeps the exact UNKNOWN token in English and French", () => {
    expect(HANDBACK_COPY.en.unknown).toBe("UNKNOWN");
    expect(HANDBACK_COPY.fr.unknown).toBe("UNKNOWN");
    expect(HANDBACK_COPY.en.unknownItems).toBe("UNKNOWN");
    expect(HANDBACK_COPY.fr.unknownItems).toBe("UNKNOWN");
  });

  it("passes the shared copy lint for all visible English and French strings", () => {
    for (const language of ["en", "fr"] as const) {
      const all = [
        ...Object.values(HANDBACK_COPY[language]),
        ...Object.values(HANDBACK_ITEM_COPY[language]),
        ...Object.values(HANDBACK_CATEGORY_LABELS[language]),
        ...Object.values(HANDBACK_FILTER_LABELS[language]),
        ...Object.values(HANDBACK_ORDER_LABELS[language]),
      ];
      for (const text of all) expect(lintCopy(language, text), text).toEqual([]);
    }
  });

  it("uses the French apostrophe and punctuation conventions", () => {
    const all = [
      ...Object.values(HANDBACK_COPY.fr),
      ...Object.values(HANDBACK_ITEM_COPY.fr),
      ...Object.values(HANDBACK_CATEGORY_LABELS.fr),
      ...Object.values(HANDBACK_FILTER_LABELS.fr),
      ...Object.values(HANDBACK_ORDER_LABELS.fr),
    ];
    for (const text of all) {
      expect(text).not.toContain("'");
      expect(text).not.toMatch(/ [;:!?]/u);
      expect(text).not.toContain("«");
    }
  });

  it("does not contain forbidden organisation references or restricted claims", () => {
    for (const language of ["en", "fr"] as const) {
      const all = [
        ...Object.values(HANDBACK_COPY[language]),
        ...Object.values(HANDBACK_ITEM_COPY[language]),
      ];
      for (const text of all) {
        expect(containsForbiddenOrg(text)).toBe(false);
        expect(text).not.toMatch(/verified|verif|vérif|real[- ]?time|partnership|guarantee|\bAI\b/i);
      }
    }
  });

  it("does not claim that the page signs out, clears, deletes or changes anything", () => {
    expect(HANDBACK_COPY.en.boundary).toContain("does not sign out");
    expect(HANDBACK_COPY.en.boundary).toContain("does not");
    expect(HANDBACK_COPY.fr.boundary).toContain("ne ferme");
    expect(HANDBACK_COPY.en.noActions).toContain("No device or account action");
    expect(HANDBACK_COPY.fr.noActions).toContain("aucune action");
  });

  it("warns against entering sensitive account details", () => {
    expect(HANDBACK_COPY.en.privacy).toContain("passwords");
    expect(HANDBACK_COPY.fr.privacy).toContain("mot de passe");
  });

  it("keeps imported reviews historical and exports private", () => {
    expect(HANDBACK_COPY.en.importDoesNotProve).toContain("historical record");
    expect(HANDBACK_COPY.fr.importDoesNotProve).toContain("document historique");
    expect(HANDBACK_COPY.en.filePrivate).toContain("private");
    expect(HANDBACK_COPY.fr.filePrivate).toContain("lieu privé");
  });
});
