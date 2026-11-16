import { describe, expect, it } from "vitest";
import { contextualName, labelInName } from "./index";

describe("contextualName", () => {
  it("keeps the visible label first, then names the item", () => {
    const name = contextualName("en", "Edit", ["draft 2", "new place", "2026-11-15"]);
    expect(name).toBe("Edit: draft 2, new place, 2026-11-15");
    expect(labelInName("Edit", name)).toBe(true);
  });
  it("uses a no-break space before the French colon", () => {
    const name = contextualName("fr", "Supprimer", ["brouillon 1"]);
    expect(name).toBe("Supprimer\u00a0: brouillon 1");
    expect(labelInName("Supprimer", name)).toBe(true);
  });
  it("falls back to the visible label when there is no context", () => {
    expect(contextualName("en", "Delete", ["", undefined, null])).toBe("Delete");
    expect(contextualName("en", " ", ["x"])).toBe("");
  });
  it("gives each row's button a different name", () => {
    const names = [1, 2].map((n) => contextualName("en", "Delete", [`draft ${n}`, "new place"]));
    expect(new Set(names).size).toBe(2);
  });
});
