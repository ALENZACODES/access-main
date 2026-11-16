import { describe, expect, it } from "vitest";
import { buildManifest, contrastRatio, lintCopy } from "./index";

describe("buildManifest", () => {
  it("is localised and unbranded", () => {
    expect(buildManifest("en")).toMatchObject({ name: "the App", lang: "en", start_url: "/en/search" });
    expect(buildManifest("fr")).toMatchObject({ name: "l’App", lang: "fr", start_url: "/fr/recherche" });
  });
  it("stays within its own scope and uses palette colours", () => {
    const m = buildManifest("en");
    expect(m.start_url.startsWith(m.scope)).toBe(true);
    expect(m.display).toBe("standalone");
    expect(m.background_color).toBe("#FFFFFF");
    expect(contrastRatio("#1A1A1A", m.background_color)!).toBeGreaterThanOrEqual(4.5);
  });
  it("has no prohibited wording", () => {
    for (const l of ["en", "fr"] as const) expect(lintCopy(buildManifest(l).name, l)).toEqual([]);
  });
});
