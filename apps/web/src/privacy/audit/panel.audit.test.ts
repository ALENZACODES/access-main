// CI audit: every state of the privacy panel, in both languages, must pass the
// HTML audit. A regression in markup (a small target, a missing name, a heading
// skip, an outside URL) fails this test.

import { describe, expect, it } from "vitest";
import { setConsent, type ConsentState, type Purpose } from "../panel/consent";
import type { Locale } from "../panel/copyLint";
import { FIXTURE } from "../panel/fixtures.test-util";
import { renderInventoryTableHtml } from "../panel/inventoryRender";
import { renderPrivacyPanelHtml, type PanelView } from "../panel/panel";
import type { ActivityEntry } from "../panel/activityLog";
import type { ChangesView } from "../panel/changes";
import { createPrivacyController } from "../panel/controller";
import { reconcile } from "../panel/reconcile";
import { createMemoryStorage } from "../panel/storage";
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

const AT = new Date(2026, 10, 15, 20, 5).toISOString();
const ACTIVITY: readonly ActivityEntry[] = [
  { at: AT, kind: "export", count: 3 },
  { at: AT, kind: "list-export", format: "csv" },
  { at: AT, kind: "consent-granted", purposeId: "saved-places" },
  { at: AT, kind: "language", lang: "fr" },
  { at: AT, kind: "expired-removed", count: 2 },
];
const B = (s: string) => ({ en: s, fr: `${s} (fr)` });
const CHANGES: ReadonlyArray<ChangesView> = [
  { kind: "first-view" },
  { kind: "none", seenOn: "2026-11-01" },
  { kind: "diff", seenOn: "2026-11-01", added: [B("A")], changed: [B("C")], removed: [B("R")] },
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
  const storage = createMemoryStorage({ "app.places.v1": "[1]", "app.mystery": "x" });
  const inv = FIXTURE.map((e) => (e.id === "saved-places" ? { ...e, storageKeys: ["places.v1"] } : e));
  const stored = reconcile(storage, "app.", inv);
  for (const locale of LOCALES) {
    out.push([`${locale} activity`, { locale, inventory: inv, purposes: PURPOSES, confirmingErase: false, status: null, activity: ACTIVITY }]);
    out.push([`${locale} activity empty`, { locale, inventory: inv, confirmingErase: false, status: null, activity: [] }]);
    out.push([`${locale} stored`, { locale, inventory: inv, confirmingErase: false, status: null, stored }]);
    out.push([`${locale} stored empty`, { locale, inventory: inv, confirmingErase: false, status: null, stored: reconcile(createMemoryStorage(), "app.", inv) }]);
    for (const c of CHANGES) {
      out.push([`${locale} changes ${c.kind}`, { locale, inventory: inv, confirmingErase: false, status: null, changes: c }]);
    }
    for (const status of [
      { kind: "list-exported", format: "csv" },
      { kind: "list-exported", format: "text" },
      { kind: "seen-saved" },
    ] as const) {
      out.push([`${locale} status ${status.kind}`, { locale, inventory: inv, confirmingErase: false, status }]);
    }
  }
  return out;
}

describe("privacy panel markup", () => {
  const all = views();
  it("covers every combination", () => {
    expect(all).toHaveLength(2 * 4 * 2 * STATUSES.length + 4 + 2 * (2 + 2 + 3 + 3));
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

describe("the live panel, step by step, with every feature on", () => {
  it.each(LOCALES)("passes the HTML audit after every action (%s)", (locale) => {
    const storage = createMemoryStorage({ "app.legacy": "1" });
    const c = createPrivacyController({
      storage,
      prefix: "app.",
      inventory: FIXTURE,
      purposes: PURPOSES,
      logActivity: true,
      trackChanges: true,
      now: () => NOW,
      languages: [locale],
      reviewedOn: "2026-11-15",
    });
    const steps = [
      { type: "set-locale", locale } as const,
      { type: "consent", purposeId: "saved-places", value: "granted" } as const,
      { type: "consent", purposeId: "map-hints", value: "declined" } as const,
      { type: "export" } as const,
      { type: "export-list-csv" } as const,
      { type: "export-list-text" } as const,
      { type: "mark-seen" } as const,
      { type: "erase-ask" } as const,
      { type: "erase-cancel" } as const,
      { type: "erase-ask" } as const,
      { type: "erase-confirm" } as const,
    ];
    const found = (label: string) => {
      const v = auditHtml(c.html());
      expect(v, `${label}\n${formatViolations(v)}`).toEqual([]);
    };
    found("start");
    for (const step of steps) {
      c.dispatch(step);
      found(step.type);
    }
  });
});
