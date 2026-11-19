// CI audit: English and French copy must have the same shape and the same facts.

import { describe, expect, it } from "vitest";
import { STRINGS as NOTICE } from "../onDeviceNotice";
import { PANEL_STRINGS, type Status } from "../panel/strings";
import { EXTRA_STRINGS, activityText, formatBytes, storedSummary } from "../panel/copyExtra";
import type { ActivityEntry } from "../panel/activityLog";
import { LINK_LABELS, PAGE_TITLES } from "../panel/route";
import { checkParity, assertParity } from "./parity";

const STATUS_SAMPLES: ReadonlyArray<readonly [Status]> = [
  [{ kind: "exported", count: 0 }],
  [{ kind: "exported", count: 1 }],
  [{ kind: "exported", count: 7 }],
  [{ kind: "erased", count: 1 }],
  [{ kind: "erased", count: 7 }],
  [{ kind: "erase-partial", failed: 1 }],
  [{ kind: "erase-partial", failed: 7 }],
  [{ kind: "nothing" }],
  [{ kind: "unavailable" }],
  [{ kind: "consent-saved", value: "granted", label: "Label" }],
  [{ kind: "consent-saved", value: "declined", label: "Label" }],
  [{ kind: "save-failed" }],
  [{ kind: "expired-removed", count: 3 }],
  [{ kind: "list-exported", format: "csv" }],
  [{ kind: "list-exported", format: "text" }],
  [{ kind: "seen-saved" }],
];

const DATE: ReadonlyArray<readonly [string]> = [["2026-11-15"]];
const LABEL: ReadonlyArray<readonly [string]> = [["Label"]];

describe("EN and FR parity", () => {
  it("on-device notice strings match", () => {
    expect(() => assertParity(NOTICE.en, NOTICE.fr, { samples: { reviewed: DATE } })).not.toThrow();
  });
  it("panel strings match", () => {
    expect(() =>
      assertParity(PANEL_STRINGS.en, PANEL_STRINGS.fr, {
        samples: {
          status: STATUS_SAMPLES,
          "consent.granted": DATE,
          "consent.declined": DATE,
          "consent.ariaAllow": LABEL,
          "consent.ariaDecline": LABEL,
        },
      }),
    ).not.toThrow();
  });
  it("the audit is not vacuous: a dropped key and an untranslated line are caught", () => {
    const { title: dropped, ...rest } = PANEL_STRINGS.fr;
    void dropped;
    expect(
      checkParity(PANEL_STRINGS.en, rest, { samples: { status: STATUS_SAMPLES } }).map((p) => p.code),
    ).toContain("missing-in-fr");
    const untranslated = { ...PANEL_STRINGS.fr, scopeNote: PANEL_STRINGS.en.scopeNote };
    expect(
      checkParity(PANEL_STRINGS.en, untranslated, {
        samples: {
          status: STATUS_SAMPLES,
          "consent.granted": DATE,
          "consent.declined": DATE,
          "consent.ariaAllow": LABEL,
          "consent.ariaDecline": LABEL,
        },
      }).map((p) => p.code),
    ).toContain("identical");
  });
});

describe("EN and FR parity of the activity, stored and change copy", () => {
  it("extra strings match", () => {
    expect(() =>
      assertParity(EXTRA_STRINGS.en, EXTRA_STRINGS.fr, {
        samples: { "changes.none": DATE, "changes.since": DATE },
        allowIdentical: ["csvHeader.4"],
      }),
    ).not.toThrow();
  });
  it("the CSV header has the same number of columns in both languages", () => {
    expect(EXTRA_STRINGS.en.csvHeader).toHaveLength(EXTRA_STRINGS.fr.csvHeader.length);
  });
  it("page titles and link labels match", () => {
    expect(() => assertParity({ t: PAGE_TITLES, l: LINK_LABELS }, { t: PAGE_TITLES, l: LINK_LABELS }, { allowIdentical: ["t.en", "t.fr", "l.en", "l.fr"] })).not.toThrow();
    expect(PAGE_TITLES.en).not.toBe(PAGE_TITLES.fr);
    expect(LINK_LABELS.en).not.toBe(LINK_LABELS.fr);
  });
  it("generated lines carry the same numbers in both languages", () => {
    const at = new Date(2026, 10, 15, 20, 5).toISOString();
    const entries: ReadonlyArray<readonly [ActivityEntry]> = [
      [{ at, kind: "export", count: 0 }],
      [{ at, kind: "export", count: 1 }],
      [{ at, kind: "export", count: 12 }],
      [{ at, kind: "expired-removed", count: 7 }],
      [{ at, kind: "list-export", format: "csv" }],
      [{ at, kind: "language", lang: "fr" }],
      [{ at, kind: "consent-granted", purposeId: "p" }],
    ];
    const label = (): string => "L";
    const en = { line: (e: ActivityEntry) => activityText("en", e, label), size: (n: number) => storedSummary("en", { count: n, bytes: n * 1000, undocumented: n }) };
    const fr = { line: (e: ActivityEntry) => activityText("fr", e, label), size: (n: number) => storedSummary("fr", { count: n, bytes: n * 1000, undocumented: n }) };
    expect(checkParity(en, fr, { samples: { line: entries, size: [[0], [1], [2], [40]] } })).toEqual([]);
  });
  it("byte sizes use the same digits in both languages", () => {
    for (const n of [0, 5, 999, 1000, 1536, 2_500_000]) {
      expect(formatBytes("en", n).replace(/\D/g, "")).toBe(formatBytes("fr", n).replace(/\D/g, ""));
    }
  });
});
