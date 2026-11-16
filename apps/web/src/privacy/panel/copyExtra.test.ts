import { describe, expect, it } from "vitest";
import type { ActivityEntry } from "./activityLog";
import { EXTRA_STRINGS, activityText, formatBytes, storedSummary } from "./copyExtra";
import { lintCopy, lintTable } from "./copyLint";

const AT = new Date(2026, 10, 15, 20, 5).toISOString();
const entry = (e: Omit<ActivityEntry, "at">): ActivityEntry => ({ at: AT, ...e });
const label = (id: string): string | undefined => (id === "p" ? "Lieux" : undefined);

describe("formatBytes", () => {
  it.each([
    [0, "0 B", "0\u00a0o"],
    [999, "999 B", "999\u00a0o"],
    [1000, "1.0 kB", "1,0\u00a0ko"],
    [1536, "1.5 kB", "1,5\u00a0ko"],
    [999_949, "999.9 kB", "999,9\u00a0ko"],
    [1_000_000, "1.0 MB", "1,0\u00a0Mo"],
    [2_500_000, "2.5 MB", "2,5\u00a0Mo"],
  ])("%d bytes", (n, en, fr) => {
    expect(formatBytes("en", n)).toBe(en);
    expect(formatBytes("fr", n)).toBe(fr);
  });
});

describe("storedSummary", () => {
  it("English: plural, size, and undocumented count", () => {
    expect(storedSummary("en", { count: 1, bytes: 12, undocumented: 0 })).toBe("1 item, 12 B in total.");
    expect(storedSummary("en", { count: 3, bytes: 2048, undocumented: 2 })).toBe(
      "3 items, 2.0 kB in total. Not described in the list above: 2.",
    );
  });
  it("French: 0 and 1 are singular, with U+00A0 before the colon", () => {
    expect(storedSummary("fr", { count: 0, bytes: 0, undocumented: 0 })).toBe("0 élément, 0\u00a0o au total.");
    expect(storedSummary("fr", { count: 2, bytes: 2048, undocumented: 1 })).toBe(
      "2 éléments, 2,0\u00a0ko au total. Non décrits dans la liste plus haut\u00a0: 1.",
    );
  });
});

describe("activityText", () => {
  it("English lines", () => {
    expect(activityText("en", entry({ kind: "export", count: 1 }), label)).toBe("Downloaded my data: 1 item");
    expect(activityText("en", entry({ kind: "export", count: 4 }), label)).toBe("Downloaded my data: 4 items");
    expect(activityText("en", entry({ kind: "list-export", format: "csv" }), label)).toBe("Downloaded the data list (CSV)");
    expect(activityText("en", entry({ kind: "list-export", format: "text" }), label)).toBe("Downloaded the data list (text)");
    expect(activityText("en", entry({ kind: "language", lang: "fr" }), label)).toBe("Changed language to French");
    expect(activityText("en", entry({ kind: "expired-removed", count: 2 }), label)).toBe("Removed expired items: 2");
    expect(activityText("en", entry({ kind: "consent-granted", purposeId: "p" }), label)).toBe("Allowed: “Lieux”");
    expect(activityText("en", entry({ kind: "consent-declined", purposeId: "p" }), label)).toBe("Did not allow: “Lieux”");
  });
  it("French lines use U+00A0 and U+202F", () => {
    expect(activityText("fr", entry({ kind: "export", count: 2 }), label)).toBe("Téléchargement de mes données\u00a0: 2 éléments");
    expect(activityText("fr", entry({ kind: "consent-granted", purposeId: "p" }), label)).toBe("Autorisé\u00a0: «\u202fLieux\u202f»");
    expect(activityText("fr", entry({ kind: "consent-declined", purposeId: "p" }), label)).toBe("Non autorisé\u00a0: «\u202fLieux\u202f»");
    expect(activityText("fr", entry({ kind: "language", lang: "en" }), label)).toBe("Langue changée\u00a0: anglais");
    expect(activityText("fr", entry({ kind: "list-export", format: "text" }), label)).toBe("Liste des données téléchargée (texte)");
  });
  it("falls back to the purpose id when the purpose no longer exists", () => {
    expect(activityText("en", entry({ kind: "consent-granted", purposeId: "gone" }), label)).toBe("Allowed: “gone”");
  });
});

describe("copy rules", () => {
  it.each(["en", "fr"] as const)("every extra string passes the copy lint (%s)", (loc) => {
    expect(lintTable(loc, EXTRA_STRINGS[loc])).toEqual([]);
  });
  it.each(["en", "fr"] as const)("every generated line passes the copy lint (%s)", (loc) => {
    const entries: ActivityEntry[] = [
      entry({ kind: "export", count: 0 }),
      entry({ kind: "export", count: 1 }),
      entry({ kind: "export", count: 5 }),
      entry({ kind: "list-export", format: "csv" }),
      entry({ kind: "list-export", format: "text" }),
      entry({ kind: "consent-granted", purposeId: "p" }),
      entry({ kind: "consent-declined", purposeId: "p" }),
      entry({ kind: "language", lang: "en" }),
      entry({ kind: "language", lang: "fr" }),
      entry({ kind: "expired-removed", count: 3 }),
    ];
    for (const e of entries) expect(lintCopy(loc, activityText(loc, e, label)), JSON.stringify(e)).toEqual([]);
    for (const n of [0, 1, 2, 1500, 2_000_000]) {
      expect(lintCopy(loc, storedSummary(loc, { count: n, bytes: n, undocumented: n }))).toEqual([]);
    }
  });
});
