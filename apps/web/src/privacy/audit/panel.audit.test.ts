// CI audit: every state of the privacy panel, in both languages, must pass the
// HTML audit. A regression in markup (a small target, a missing name, a heading
// skip, an outside URL) fails this test.

import { describe, expect, it } from "vitest";
import { setConsent, type ConsentState, type Purpose } from "../panel/consent";
import type { Locale } from "../panel/copyLint";
import { FIXTURE } from "../panel/fixtures.test-util";
import { renderInventoryTableHtml } from "../panel/inventoryRender";
import { renderPrivacyPanelHtml, type PanelView } from "../panel/panel";
import type { Status } from "../panel/strings";
import { renderOnDeviceNoticeHtml } from "../onDeviceNotice";
import { auditHtml, formatViolations } from "./htmlAudit";

const LOCALES: readonly Locale[] = ["en", "fr"];

const PURPOSES: readonly Purpose[] = [
  {
    id: "saved-places",
    label: { en: "Saved places", fr: "Lieux enregistrés" },
    description: { en: "Remember places on this device", fr: "Garder des lieux sur cet appareil" },
    wordingVersion: 1,
  },
  {
    id: "map-hints",
    label: { en: "Map hints", fr: "Indices de carte" },
    description: { en: "Show short hints on the map", fr: "Afficher de courts indices sur la carte" },
    wordingVersion: 2,
  },
];

const NOW = new Date(2026, 10, 15);
const CONSENTS: ReadonlyArray<[string, ConsentState]> = [
  ["undecided", {}],
  ["granted", setConsent({}, PURPOSES[0]!, "granted", NOW)],
  ["declined", setConsent({}, PURPOSES[0]!, "declined", NOW)],
  ["stale", setConsent({}, { ...PURPOSES[1]!, wordingVersion: 1 }, "granted", NOW)],
];

const STATUSES: ReadonlyArray<Status | null> = [
  null,
  { kind: "exported", count: 3 },
  { kind: "erased", count: 1 },
  { kind: "erase-partial", failed: 2 },
  { kind: "nothing" },
  { kind: "unavailable" },
  { kind: "consent-saved", value: "granted", label: "Saved places" },
  { kind: "save-failed" },
  { kind: "expired-removed", count: 2 },
];

function views(): Array<[string, PanelView]> {
  const out: Array<[string, PanelView]> = [];
  for (const locale of LOCALES) {
    for (const [cname, consent] of CONSENTS) {
      for (const confirmingErase of [false, true]) {
        for (const status of STATUSES) {
          out.push([
            `${locale} consent=${cname} confirm=${confirmingErase} status=${status?.kind ?? "none"}`,
            { locale, inventory: FIXTURE, purposes: PURPOSES, consent, confirmingErase, status, reviewedOn: "2026-11-15" },
          ]);
        }
      }
    }
    out.push([`${locale} no purposes`, { locale, inventory: FIXTURE, confirmingErase: false, status: null }]);
    out.push([`${locale} empty inventory`, { locale, inventory: [], purposes: PURPOSES, confirmingErase: true, status: null }]);
  }
  return out;
}

describe("privacy panel markup", () => {
  const all = views();
  it("covers every combination", () => {
    expect(all).toHaveLength(2 * 4 * 2 * STATUSES.length + 4);
  });
  it.each(all)("passes the HTML audit: %s", (_name, view) => {
    const found = auditHtml(renderPrivacyPanelHtml(view));
    expect(found, formatViolations(found)).toEqual([]);
  });
});

describe("panel parts", () => {
  it.each(LOCALES)("on-device notice passes with and without the close button (%s)", (locale) => {
    for (const showDismiss of [false, true]) {
      const html = renderOnDeviceNoticeHtml({
        locale,
        items: FIXTURE.map((e) => ({ id: e.id, label: e.label, ...(e.where !== undefined ? { where: e.where } : {}) })),
        reviewedOn: "2026-11-15",
        showDismiss,
      });
      const found = auditHtml(html);
      expect(found, formatViolations(found)).toEqual([]);
    }
  });
  it.each(LOCALES)("inventory table passes (%s)", (locale) => {
    const found = auditHtml(renderInventoryTableHtml(locale, FIXTURE), { requireLang: false });
    expect(found, formatViolations(found)).toEqual([]);
  });
  it("the audit is not vacuous: a small target in the same markup would fail", () => {
    const html = renderPrivacyPanelHtml(views()[0]![1]).replace("min-width:44px;min-height:44px", "min-width:20px;min-height:20px");
    expect(auditHtml(html).map((v) => v.code)).toContain("target-too-small");
  });
});
