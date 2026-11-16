import { describe, expect, it } from "vitest";
import type { ActivityEntry } from "./activityLog";
import type { ChangesView } from "./changes";
import type { Purpose } from "./consent";
import { FIXTURE } from "./fixtures.test-util";
import { renderActivityHtml, renderChangesHtml, renderStoredHtml } from "./panelSections";
import { reconcile, type Reconciled } from "./reconcile";
import { createMemoryStorage } from "./storage";
import { putExpiring } from "./expiry";
import { auditHtml } from "../audit/htmlAudit";
import { omit } from "./omit";

const AT = new Date(2026, 10, 15, 20, 5).toISOString();
const PURPOSES: readonly Purpose[] = [
  {
    id: "saved-places",
    label: { en: "Saved places", fr: "Lieux enregistrés" },
    description: { en: "Remember places on this device", fr: "Garder des lieux sur cet appareil" },
    wordingVersion: 1,
  },
];
const inventory = FIXTURE.map((e) => (e.id === "saved-places" ? { ...e, storageKeys: ["places.v1"] } : e));
const NOW = new Date(2026, 10, 15, 9, 0, 0);

function stored(): Reconciled {
  const s = createMemoryStorage({ "app.places.v1": "[1,2,3]", "app.mystery": "x" });
  putExpiring(s, "app.places.tmp", "v", NOW, 5);
  return reconcile(s, "app.", inventory);
}

describe("renderActivityHtml", () => {
  it("lists entries as an ordered list with a machine-readable time", () => {
    const e: ActivityEntry[] = [
      { at: AT, kind: "export", count: 2 },
      { at: AT, kind: "consent-granted", purposeId: "saved-places" },
    ];
    const html = renderActivityHtml("en", e, PURPOSES);
    expect(html).toContain("<ol>");
    expect(html).toContain(`<time datetime="${AT}">2026-11-15 20:05</time>`);
    expect(html).toContain("Downloaded my data: 2 items");
    expect(html).toContain("Allowed: “Saved places”");
  });
  it("says when nothing is listed, and still states how long the list is kept", () => {
    const html = renderActivityHtml("en", [], PURPOSES);
    expect(html).toContain("No actions are listed.");
    expect(html).toContain("up to 90 days");
    expect(html).not.toContain("<ol>");
  });
  it("renders in French", () => {
    const html = renderActivityHtml("fr", [{ at: AT, kind: "language", lang: "en" }], PURPOSES);
    expect(html).toContain("Actions récentes de confidentialité");
    expect(html).toContain("Langue changée\u00a0: anglais");
  });
  it("escapes purpose labels", () => {
    const evil: Purpose[] = [{ ...PURPOSES[0]!, label: { en: "<b>x</b>", fr: "<b>x</b>" } }];
    const html = renderActivityHtml("en", [{ at: AT, kind: "consent-declined", purposeId: "saved-places" }], evil);
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).not.toContain("<b>x");
  });
});

describe("renderStoredHtml", () => {
  it("shows names, sizes and the entry that describes each item, never the contents", () => {
    const html = renderStoredHtml("en", stored(), inventory);
    expect(html).toContain('<th scope="row">places.v1</th><td>7 B</td>');
    expect(html).not.toContain("[1,2,3]");
    expect(html).toContain("<td>Saved places</td>");
  });
  it("marks an item the list does not describe", () => {
    const html = renderStoredHtml("en", stored(), inventory);
    const row = html.slice(html.indexOf('data-key="mystery"'));
    expect(row).toContain("Not in the list above");
    expect(html).toContain("Not described in the list above: 2.");
  });
  it("shows an expiry date only where one is recorded", () => {
    const html = renderStoredHtml("en", stored(), inventory);
    expect(html.slice(html.indexOf('data-key="places.tmp"'))).toContain("2026-11-20");
    expect(html.slice(html.indexOf('data-key="mystery"'))).toContain("No expiry date recorded");
  });
  it("says nothing is stored when nothing is", () => {
    const html = renderStoredHtml("en", reconcile(createMemoryStorage(), "app.", inventory), inventory);
    expect(html).toContain("No items from the App are stored in this browser.");
    expect(html).not.toContain("<table");
  });
  it("explains entries that cannot be matched, even when nothing is stored", () => {
    const unkeyed = omit(inventory[0]!, "storageKeys");
    const html = renderStoredHtml("en", reconcile(createMemoryStorage(), "app.", [unkeyed]), [unkeyed]);
    expect(html).toContain("cannot be matched here");
  });
  it("does not add that note when every on-device entry names its storage", () => {
    expect(renderStoredHtml("en", reconcile(createMemoryStorage(), "app.", inventory), inventory)).not.toContain("cannot be matched");
  });
  it("renders in French with decimal commas and U+00A0 before units", () => {
    const s = createMemoryStorage({ "app.big": "x".repeat(1500) });
    const html = renderStoredHtml("fr", reconcile(s, "app.", inventory), inventory);
    expect(html).toContain("1,5\u00a0ko");
    expect(html).toContain("Conservé sur cet appareil en ce moment");
  });
  it("passes the HTML audit in both languages", () => {
    for (const loc of ["en", "fr"] as const) {
      expect(auditHtml(renderStoredHtml(loc, stored(), inventory), { requireLang: false })).toEqual([]);
    }
  });
});

describe("renderChangesHtml", () => {
  const B = (s: string) => ({ en: s, fr: `${s}-fr` });
  it("explains the first view", () => {
    expect(renderChangesHtml("en", { kind: "first-view" })).toContain("first time the list is shown");
    expect(renderChangesHtml("fr", { kind: "first-view" })).toContain("première fois");
  });
  it("says there are no changes and offers no button", () => {
    const html = renderChangesHtml("en", { kind: "none", seenOn: "2026-11-01" });
    expect(html).toContain("No changes since you marked the list as seen on 2026-11-01.");
    expect(html).not.toContain("<button");
  });
  it("lists added, changed and removed entries and offers the button", () => {
    const c: ChangesView = { kind: "diff", seenOn: "2026-11-01", added: [B("A")], changed: [B("C"), B("D")], removed: [B("R")] };
    const html = renderChangesHtml("en", c);
    expect(html).toContain("Since you marked the list as seen on 2026-11-01:");
    expect(html).toContain("<li>Added: A</li>");
    expect(html).toContain("<li>Changed: C, D</li>");
    expect(html).toContain("<li>Removed: R</li>");
    expect(html).toContain('data-action="mark-seen"');
    expect(html).toContain("min-width:44px;min-height:44px");
  });
  it("leaves out empty groups", () => {
    const c: ChangesView = { kind: "diff", seenOn: "2026-11-01", added: [B("A")], changed: [], removed: [] };
    const html = renderChangesHtml("en", c);
    expect(html).not.toContain("Changed");
    expect(html).not.toContain("Removed");
  });
  it("French uses U+00A0 before the colon and French labels", () => {
    const c: ChangesView = { kind: "diff", seenOn: "2026-11-01", added: [B("A")], changed: [], removed: [] };
    const html = renderChangesHtml("fr", c);
    expect(html).toContain("<li>Ajouté\u00a0: A-fr</li>");
    expect(html).toContain("le 2026-11-01\u00a0:");
  });
  it("escapes labels", () => {
    const c: ChangesView = { kind: "diff", seenOn: "2026-11-01", added: [{ en: "<i>", fr: "<i>" }], changed: [], removed: [] };
    expect(renderChangesHtml("en", c)).toContain("&lt;i&gt;");
  });
});
