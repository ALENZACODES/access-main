import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import { OUTSIDE_STRINGS, outsideItems, outsideItemsForScope, renderOutsideHtml } from "./outsideSection";
import { STORAGE_REGISTER, UNSCANNED } from "./storageRegister";
import { PRIVACY_STORAGE_PREFIX } from "./live";

const items = outsideItems(STORAGE_REGISTER, UNSCANNED, PRIVACY_STORAGE_PREFIX);

describe("outsideItems", () => {
  it("lists every registered key outside the prefix, then the unconfirmed storage", () => {
    expect(items).toHaveLength(STORAGE_REGISTER.filter((r) => !r.key.startsWith(PRIVACY_STORAGE_PREFIX)).length + UNSCANNED.length);
    expect(items.slice(0, -UNSCANNED.length).every((i) => !i.unconfirmed)).toBe(true);
    expect(items.slice(-UNSCANNED.length).every((i) => i.unconfirmed)).toBe(true);
  });
  it("leaves out what the panel's own prefix already reaches", () => {
    const texts = items.map((i) => i.holds.en);
    expect(texts).not.toContain("The language you chose");
    expect(texts).not.toContain("Route reports you wrote on this device");
    expect(texts).toContain("Your display preferences");
  });
  it("is empty for a register fully inside the prefix", () => {
    expect(outsideItems(STORAGE_REGISTER.filter((r) => r.key.startsWith("access.")), [], "access.")).toEqual([]);
  });
});

describe("outsideItemsForScope", () => {
  const scope = { prefix: PRIVACY_STORAGE_PREFIX, keys: ["app.preferences.v1", "app.corrections.v1"] };
  it("leaves out the extra names the scope covers and keeps the rest", () => {
    const texts = outsideItemsForScope(STORAGE_REGISTER, UNSCANNED, scope).map((i) => i.holds.en);
    expect(texts).not.toContain("Your display preferences");
    expect(texts).not.toContain("Corrections you wrote and have not sent");
    expect(texts).toContain("A history of data status checks");
    expect(texts).toContain("The list of map tiles kept for offline use");
  });
  it("lists only the map tile list and unconfirmed storage when the scope covers every panel key", () => {
    const keys = STORAGE_REGISTER.filter((r) => r.reach === "panel" && !r.key.startsWith(PRIVACY_STORAGE_PREFIX)).map((r) => r.key);
    const out = outsideItemsForScope(STORAGE_REGISTER, UNSCANNED, { prefix: PRIVACY_STORAGE_PREFIX, keys });
    expect(out.map((i) => i.holds.en)).toEqual(["The list of map tiles kept for offline use", ...UNSCANNED.map((u) => u.holds.en)]);
  });
  it("is the same as the prefix-only call when the scope has no extra names", () => {
    expect(outsideItemsForScope(STORAGE_REGISTER, UNSCANNED, { prefix: PRIVACY_STORAGE_PREFIX, keys: [] })).toEqual(items);
  });
});

describe("renderOutsideHtml", () => {
  it("renders nothing for an empty list", () => {
    expect(renderOutsideHtml("en", [])).toBe("");
  });
  it("shows plain descriptions in the page language and never a storage key", () => {
    for (const loc of ["en", "fr"] as const) {
      const html = renderOutsideHtml(loc, items);
      expect(html).toContain("data-privacy-outside");
      expect(html).toContain(OUTSIDE_STRINGS[loc].heading);
      for (const r of STORAGE_REGISTER) expect(html).not.toContain(r.key);
      expect(html.match(/<li>/g)).toHaveLength(items.length);
    }
    expect(renderOutsideHtml("fr", items)).toContain("Vos préférences d’affichage");
  });
  it("marks storage whose place is unconfirmed", () => {
    expect(renderOutsideHtml("en", items)).toContain("data-outside-unconfirmed");
    expect(renderOutsideHtml("en", [{ holds: { en: "A", fr: "B" }, unconfirmed: false }])).not.toContain("data-outside-unconfirmed");
  });
  it("escapes descriptions", () => {
    expect(renderOutsideHtml("en", [{ holds: { en: "<b>x</b>", fr: "<b>x</b>" }, unconfirmed: false }])).not.toContain("<b>x");
  });
});

describe("wording", () => {
  it("passes the copy lint with the French typography rules", () => {
    for (const loc of ["en", "fr"] as const) {
      const s = OUTSIDE_STRINGS[loc];
      for (const t of [s.heading, s.note, s.unconfirmed, ...items.map((i) => i.holds[loc])]) expect(lintCopy(loc, t), t).toEqual([]);
    }
  });
  it("has a French description for every row, different from the English one", () => {
    for (const r of [...STORAGE_REGISTER, ...UNSCANNED]) {
      expect(r.holds.fr.trim()).not.toBe("");
      expect(r.holds.fr).not.toBe(r.holds.en);
    }
  });
});
