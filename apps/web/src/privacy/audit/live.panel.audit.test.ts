// CI audit: the live privacy panel, built from the App's real settings, in every state a person can
// reach, in both languages. Each state must pass the HTML audit, keep to the French typography and
// wording rules, never show a storage key or a stored value, and never contain a forbidden name.
// The copy tables for the sections added for the live panel must have the same shape in English and French.

import { describe, expect, it } from "vitest";
import { containsForbiddenOrg } from "../../../../../packages/shared/test/forbiddenOrg.ts";
import { lintCopy, type Locale } from "../panel/copyLint";
import { createPrivacyController, type PrivacyController } from "../panel/controller";
import { FIXTURE } from "../panel/fixtures.test-util";
import { ROUTE_REPORTS_STORAGE_KEY, clearLiveRefused, liveStorage, saveGated } from "../panel/live";
import { liveControllerDeps } from "../panel/liveController";
import { OUTSIDE_STRINGS } from "../panel/outsideSection";
import { REFUSED_STRINGS } from "../panel/refusedSection";
import { REGISTER_STRINGS } from "../panel/registerExport";
import { STORAGE_REGISTER, UNSCANNED } from "../panel/storageRegister";
import { createMemoryStorage, type StorageLike } from "../panel/storage";
import { auditHtml, formatViolations } from "./htmlAudit";
import { rawTexts } from "./rawTexts";
import { checkParity } from "./parity";

const NOW = new Date(2026, 10, 19, 9, 0, 0);
const LOCALES: readonly Locale[] = ["en", "fr"];
const STORED_TEXT = "value-that-must-never-be-shown-123";

interface Setup {
  name: string;
  run: (c: PrivacyController, storage: StorageLike) => void;
}

const SETUPS: readonly Setup[] = [
  { name: "first visit", run: () => undefined },
  {
    name: "a save was stopped before any choice",
    run: (_c, s) => {
      saveGated(liveStorage(s), ROUTE_REPORTS_STORAGE_KEY, STORED_TEXT);
    },
  },
  {
    name: "route reports allowed",
    run: (c) => {
      c.dispatch({ type: "consent", purposeId: "route-reports", value: "granted" });
    },
  },
  {
    name: "route reports declined after a stopped save",
    run: (c, s) => {
      saveGated(liveStorage(s), ROUTE_REPORTS_STORAGE_KEY, STORED_TEXT);
      c.dispatch({ type: "consent", purposeId: "route-reports", value: "declined" });
    },
  },
  {
    name: "withdrawn after saving",
    run: (c, s) => {
      c.dispatch({ type: "consent", purposeId: "route-reports", value: "granted" });
      saveGated(liveStorage(s), ROUTE_REPORTS_STORAGE_KEY, STORED_TEXT);
      c.dispatch({ type: "consent", purposeId: "route-reports", value: "declined" });
    },
  },
  {
    name: "erase asked",
    run: (c) => {
      c.dispatch({ type: "erase-ask" });
    },
  },
  {
    name: "erased with stored preferences and corrections",
    run: (c, s) => {
      s.setItem("app.preferences.v1", STORED_TEXT);
      s.setItem("app.corrections.v1", STORED_TEXT);
      c.dispatch({ type: "erase-ask" });
      c.dispatch({ type: "erase-confirm" });
    },
  },
  {
    name: "downloaded with stored preferences",
    run: (c, s) => {
      s.setItem("app.preferences.v1", STORED_TEXT);
      c.dispatch({ type: "export" });
    },
  },
];

function build(setup: Setup, locale: Locale): { html: string } {
  clearLiveRefused();
  const storage = createMemoryStorage();
  const c = createPrivacyController({ storage, inventory: FIXTURE, now: () => NOW, ...liveControllerDeps() });
  c.dispatch({ type: "set-locale", locale });
  setup.run(c, storage);
  return { html: c.html() };
}

describe("live panel states", () => {
  for (const setup of SETUPS) {
    for (const locale of LOCALES) {
      const label = `${setup.name} (${locale})`;
      const { html } = build(setup, locale);

      it(`${label}: passes the HTML audit`, () => {
        const violations = auditHtml(html);
        expect(violations, formatViolations(violations)).toEqual([]);
      });

      it(`${label}: every piece of text passes the copy lint`, () => {
        for (const text of rawTexts(html)) expect(lintCopy(locale, text), text).toEqual([]);
      });

      it(`${label}: shows no storage key, stored value or forbidden name`, () => {
        expect(html).not.toContain(STORED_TEXT);
        for (const r of STORAGE_REGISTER) expect(html, r.key).not.toContain(r.key);
        expect(containsForbiddenOrg(html)).toBe(false);
      });
    }
  }

  it("shows the sections that belong to each state", () => {
    expect(build(SETUPS[0]!, "en").html).toContain("data-privacy-outside");
    expect(build(SETUPS[0]!, "en").html).not.toContain("data-privacy-refused");
    expect(build(SETUPS[1]!, "en").html).toContain("data-privacy-refused");
    expect(build(SETUPS[1]!, "fr").html).toContain("Non enregistré");
  });

  it("reads French text with its no-break spaces, so a plain space before a colon would be caught", () => {
    const fr = rawTexts(build(SETUPS[0]!, "fr").html);
    expect(fr.some((t) => t.includes("\u00a0:"))).toBe(true);
    expect(lintCopy("fr", "Élément : x").map((i) => i.code)).toEqual(["fr-colon-space"]);
  });

  it("does not show the extra names it now covers in the outside section", () => {
    const html = build(SETUPS[0]!, "en").html;
    const o = html.slice(html.indexOf("data-privacy-outside"), html.indexOf("</div>", html.indexOf("data-privacy-outside")));
    expect(o).not.toContain("Your display preferences");
    expect(o).toContain("The list of map tiles kept for offline use");
  });
});

describe("copy tables for the live panel", () => {
  it("have the same shape and facts in English and French", () => {
    expect(checkParity(OUTSIDE_STRINGS.en, OUTSIDE_STRINGS.fr)).toEqual([]);
    expect(checkParity(REFUSED_STRINGS.en, REFUSED_STRINGS.fr, { samples: { line: [["Feature", 2, "reason"]] } })).toEqual([]);
    expect(checkParity(REGISTER_STRINGS.en, REGISTER_STRINGS.fr, { allowIdentical: ["header.3"] })).toEqual([]);
  });

  it("describe every register row in both languages, with a source and a date, and no forbidden name", () => {
    for (const r of [...STORAGE_REGISTER, ...UNSCANNED]) {
      expect(r.holds.en.trim(), r.key).not.toBe("");
      expect(r.holds.fr.trim(), r.key).not.toBe("");
      expect(containsForbiddenOrg(`${r.holds.en} ${r.holds.fr}`)).toBe(false);
      expect(r.recordedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    for (const r of STORAGE_REGISTER) expect(r.source.trim(), r.key).not.toBe("");
  });

  it("leave unknown storage as UNKNOWN rather than guessing a key", () => {
    for (const u of UNSCANNED) expect(u.key).toBe("UNKNOWN");
  });
});
