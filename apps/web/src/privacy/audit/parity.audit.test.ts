// CI audit: English and French copy must have the same shape and the same facts.

import { describe, expect, it } from "vitest";
import { STRINGS as NOTICE } from "../onDeviceNotice";
import { PANEL_STRINGS, type Status } from "../panel/strings";
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
