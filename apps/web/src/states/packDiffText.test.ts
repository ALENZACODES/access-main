import { describe, expect, it } from "vitest";
import { containsForbiddenOrg } from "../../../../packages/shared/test/forbiddenOrg";
import { lintCopy } from "./copyLint";
import { diffPacks, CHANGE_FIELDS, type PackDiff } from "./packDiff";
import {
  DIFF_CSV_FILENAMES,
  DIFF_CSV_HEADER,
  DIFF_TEXT_FILENAMES,
  diffSummaryLine,
  diffToCsv,
  diffToText,
  fieldCountsLine,
  fieldLabel,
  placesWord,
} from "./packDiffText";
import type { EarlierPlace } from "./packEarlier";
import { parsePackPlaces } from "./packPlaces";
import { lintFrench } from "./typography";

const raw = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: `Place ${id}`,
  category: "cafe",
  address: "1 Main Street",
  wheelchair: "yes",
  lat: 43.65,
  lon: -79.38,
  provenance: { source_name: "OpenStreetMap, Geofabrik Ontario extract", licence: "ODbL-1.0", retrieved_at: "2026-11-10", tier: 0 },
  ...over,
});
const before = (id: string, over: Partial<EarlierPlace> = {}): EarlierPlace => ({
  id,
  name: `Place ${id}`,
  kind: "cafe",
  address: "1 Main Street",
  lat: 43.65,
  lon: -79.38,
  tag: "yes",
  source: "OpenStreetMap, Geofabrik Ontario extract",
  retrievedOn: "2026-11-10",
  tier: null,
  ...over,
});
const now = (...items: ReturnType<typeof raw>[]) => [...parsePackPlaces(items).places];
const mixed: PackDiff = diffPacks(
  [before("a", { tag: "no", address: "2 Side Road" }), before("b"), before("gone", { name: null })],
  now(raw("a"), raw("b"), raw("new", { name: "" })),
);
const same: PackDiff = diffPacks([before("a"), before("b")], now(raw("a"), raw("b")));

describe("placesWord", () => {
  it("uses the singular and plural of each language", () => {
    expect(placesWord(0, "en")).toBe("0 places");
    expect(placesWord(1, "en")).toBe("1 place");
    expect(placesWord(2, "en")).toBe("2 places");
    expect(placesWord(0, "fr")).toBe("0 lieu");
    expect(placesWord(1, "fr")).toBe("1 lieu");
    expect(placesWord(2, "fr")).toBe("2 lieux");
  });
});

describe("fieldLabel", () => {
  it("has a different label in each language for every field, none of them empty", () => {
    for (const f of CHANGE_FIELDS) {
      expect(fieldLabel(f, "en"), f).not.toBe("");
      expect(fieldLabel(f, "fr"), f).not.toBe("");
    }
    expect(new Set(CHANGE_FIELDS.map((f) => fieldLabel(f, "en"))).size).toBe(CHANGE_FIELDS.length);
  });
});

describe("diffSummaryLine", () => {
  it("says no difference was found and does not claim the places are right", () => {
    expect(diffSummaryLine(same, "en")).toBe("No difference found: 2 places in both.");
    expect(diffSummaryLine(same, "fr")).toBe("Aucune différence trouvée : 2 lieux dans les deux.");
  });
  it("counts added, no longer listed, changed and unchanged", () => {
    expect(diffSummaryLine(mixed, "en")).toBe("1 added; 1 no longer listed; 1 changed; 1 unchanged.");
  });
  it("is French with a narrow no-break space before the semicolons and agreement in number", () => {
    const line = diffSummaryLine(mixed, "fr");
    expect(line).toBe("1 ajouté ; 1 qui ne figure plus ; 1 modifié ; 1 inchangé.");
    expect(lintFrench(line)).toEqual([]);
    const many = diffPacks([before("a", { tag: "no" }), before("b", { tag: "no" }), before("x"), before("y")], now(raw("a"), raw("b"), raw("n1"), raw("n2")));
    expect(diffSummaryLine(many, "fr")).toBe("2 ajoutés ; 2 qui ne figurent plus ; 2 modifiés ; 0 inchangé.");
  });
  it("uses no verdict word", () => {
    for (const locale of ["en", "fr"] as const) expect(diffSummaryLine(mixed, locale)).not.toMatch(/\b(better|worse|improved|worsened|accessible|safe)\b|amélior|détérior/i);
  });
});

describe("fieldCountsLine", () => {
  it("lists only the fields with changes", () => {
    expect(fieldCountsLine(mixed, "en")).toBe("Wheelchair tag: 1, Address: 1");
  });
  it("is null when no field changed", () => {
    expect(fieldCountsLine(same, "en")).toBeNull();
  });
  it("puts a no-break space before the French colon", () => {
    expect(fieldCountsLine(mixed, "fr")).toBe("Indication pour fauteuil roulant : 1, Adresse : 1");
  });
});

describe("diffToCsv", () => {
  const rows = (text: string) => text.split("\r\n").filter(Boolean);
  it("starts with the fixed header", () => {
    expect(rows(diffToCsv(mixed))[0]).toBe(DIFF_CSV_HEADER.join(","));
  });
  it("writes a row per added place, removed place and changed field", () => {
    expect(rows(diffToCsv(mixed))).toEqual([
      "change,place_id,place_name,field,before,after",
      "added,new,UNKNOWN,,,",
      "no_longer_listed,gone,UNKNOWN,,,",
      "changed,a,Place a,tag,no,yes",
      "changed,a,Place a,address,2 Side Road,1 Main Street",
    ]);
  });
  it("writes only the header when nothing differs", () => {
    expect(diffToCsv(same)).toBe(`${DIFF_CSV_HEADER.join(",")}\r\n`);
  });
  it("adds a byte order mark only when asked and ends each line with CRLF", () => {
    expect(diffToCsv(mixed).startsWith("﻿")).toBe(false);
    expect(diffToCsv(mixed, { bom: true }).startsWith("﻿")).toBe(true);
    expect(diffToCsv(mixed).endsWith("\r\n")).toBe(true);
  });
  it("quotes commas and defuses a formula in a name or value", () => {
    const d = diffPacks([before("a", { name: "=cmd", address: 'a,"b"' })], now(raw("a", { name: "+x" })));
    const text = diffToCsv(d);
    expect(text).toContain("'+x");
    expect(text).toContain("'=cmd");
    expect(text).toContain('"a,""b"""');
    expect(text).not.toMatch(/(^|\r\n|,)[=+@-]/);
  });
  it("is the same in both languages: fixed names and tokens", () => {
    expect(DIFF_CSV_HEADER.every((h) => /^[a-z_]+$/.test(h))).toBe(true);
    expect(DIFF_CSV_FILENAMES.en).not.toBe(DIFF_CSV_FILENAMES.fr);
    expect(DIFF_TEXT_FILENAMES.en).not.toBe(DIFF_TEXT_FILENAMES.fr);
  });
});

describe("diffToText", () => {
  it("states the date, both counts, the groups and the credit", () => {
    const text = diffToText(mixed, "en", "2026-11-19");
    expect(text).toContain("Changes in the saved places");
    expect(text).toContain("Date: 2026-11-19");
    expect(text).toContain("Earlier file: 3 places. Pack now: 3 places.");
    expect(text).toContain("Added\n- UNKNOWN (new)");
    expect(text).toContain("No longer listed (this does not say the place is gone)\n- UNKNOWN (gone)");
    expect(text).toContain("Changed\n- Place a (a)\n    Wheelchair tag: no → yes\n    Address: 2 Side Road → 1 Main Street");
    expect(text.trimEnd().endsWith("© OpenStreetMap contributors")).toBe(true);
  });
  it("leaves out a group that is empty", () => {
    const text = diffToText(same, "en", "2026-11-19");
    expect(text).not.toContain("\nAdded");
    expect(text).not.toContain("No longer listed");
    expect(text).not.toContain("\nChanged");
  });
  it("is French with correct spacing before colons", () => {
    const text = diffToText(mixed, "fr", "2026-11-19");
    expect(text).toContain("Date : 2026-11-19");
    expect(text).toContain("Fichier précédent : 3 lieux. Pack actuel : 3 lieux.");
    expect(text).toContain("    Indication pour fauteuil roulant : no → yes");
    expect(text).not.toMatch(/[^\u00a0\u202f\n] [:;!?]/);
    for (const line of text.split("\n")) expect(lintFrench(line), line).toEqual([]);
  });
  it("passes the copy linter and names no organisation", () => {
    for (const locale of ["en", "fr"] as const) {
      for (const line of diffToText(mixed, locale, "2026-11-19").split("\n")) {
        expect(lintCopy(line, locale), line).toEqual([]);
        expect(containsForbiddenOrg(line), line).toBe(false);
      }
    }
  });
  it("says what a missing place does not mean", () => {
    expect(diffToText(mixed, "en", "2026-11-19")).toContain("does not say the place is gone");
    expect(diffToText(mixed, "fr", "2026-11-19")).toContain("cela ne dit pas que le lieu a disparu");
  });
  it("uses the token UNKNOWN for a missing name and never the French word for it", () => {
    for (const locale of ["en", "fr"] as const) {
      const text = diffToText(mixed, locale, "2026-11-19");
      expect(text).toContain("UNKNOWN (new)");
      expect(text).not.toMatch(/INCONNU/);
    }
  });
  it("ends with a single newline", () => {
    const text = diffToText(mixed, "en", "2026-11-19");
    expect(text.endsWith("\n")).toBe(true);
    expect(text.endsWith("\n\n")).toBe(false);
  });
});
