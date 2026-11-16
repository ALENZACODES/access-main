import { describe, expect, it } from "vitest";
import { FIXTURE } from "./fixtures.test-util";
import { renderInventoryTableHtml } from "./inventoryRender";
import { renderPrivacyPanelHtml, type PanelView } from "./panel";

const view = (patch: Partial<PanelView> = {}): PanelView => ({
  locale: "en",
  inventory: FIXTURE,
  confirmingErase: false,
  status: null,
  ...patch,
});

describe("renderInventoryTableHtml", () => {
  it("is a captioned table with scoped headers", () => {
    const html = renderInventoryTableHtml("en", FIXTURE);
    expect(html).toContain("<caption");
    expect(html.match(/<th scope="col">/g)).toHaveLength(5);
    expect(html.match(/<th scope="row">/g)).toHaveLength(FIXTURE.length);
  });
  it("names the table as a region and does not put a div in the tab order", () => {
    const html = renderInventoryTableHtml("en", FIXTURE);
    expect(html).not.toContain('tabindex="0"');
    expect(html).toContain('role="region"');
    expect(html).toContain("aria-labelledby");
  });
  it("reflows as stacked cards on narrow screens instead of a sideways scroller", () => {
    const html = renderInventoryTableHtml("en", FIXTURE);
    expect(html).not.toContain("overflow-x");
    expect(html).not.toContain("tabindex");
    expect(html).toContain('class="privacy-inventory"');
    expect(html).toMatch(/@media\s*\(max-width:\s*40em\)/);
    expect(html).toMatch(/display:\s*block/);
    expect(html).toContain('data-label="Where it is kept"');
    expect(html).toContain('data-label="Why"');
    expect(html).toContain('data-label="How long"');
    expect(html).toContain('data-label="Source and date"');
    const fr = renderInventoryTableHtml("fr", FIXTURE);
    expect(fr).toContain("data-label=\"Où c’est conservé\"");
  });
  it("shows missing fields as unknown, never as a value", () => {
    const html = renderInventoryTableHtml("en", FIXTURE);
    const settings = html.slice(html.indexOf('data-id="settings"'));
    expect(settings.match(/>Not known<\/td>/g)).toHaveLength(3);
    expect(settings).toContain("data-label=\"Why\">Not known");
    expect(settings).toContain("data-label=\"How long\">Not known");
  });
  it("records source, licence and date for each row", () => {
    const html = renderInventoryTableHtml("en", FIXTURE);
    expect(html).toContain("Test fixture (CC0-1.0), 2026-11-14");
    expect(html).toContain("Test fixture, 2026-11-15");
  });
  it("renders French labels, locations and the unknown word", () => {
    const html = renderInventoryTableHtml("fr", FIXTURE);
    expect(html).toContain("Lieux enregistrés");
    expect(html).toContain("Reste sur cet appareil");
    expect(html).toContain(">Inconnu</td>");
    expect(html).toContain("Données d’essai");
  });
  it("escapes entry text", () => {
    const html = renderInventoryTableHtml("en", FIXTURE);
    expect(html).toContain("Feedback &lt;note&gt;");
    expect(html).not.toContain("<note>");
  });
  it("sorts rows by label in the page language", () => {
    const html = renderInventoryTableHtml("en", FIXTURE);
    expect(html.indexOf("feedback-note")).toBeLessThan(html.indexOf("saved-places"));
    expect(html.indexOf("saved-places")).toBeLessThan(html.indexOf('data-id="settings"'));
  });
  it("renders an empty table body for an empty inventory", () => {
    expect(renderInventoryTableHtml("en", [])).toContain("<tbody></tbody>");
  });
});

describe("renderPrivacyPanelHtml", () => {
  it("sets the page language and a labelled section", () => {
    const html = renderPrivacyPanelHtml(view({ locale: "fr" }));
    expect(html.startsWith('<section lang="fr" aria-labelledby="privacy-panel-title"')).toBe(true);
    expect(html).toContain("Vos données sur cet appareil");
  });
  it("includes the on-device notice built from the same inventory", () => {
    const html = renderPrivacyPanelHtml(view({ reviewedOn: "2026-11-15" }));
    expect(html).toContain("Where your data is kept");
    expect(html).toContain("Last reviewed: 2026-11-15");
    expect(html).toContain('data-where="unknown"');
  });
  it("states the scope in plain words", () => {
    expect(renderPrivacyPanelHtml(view())).toContain("does not cover data held on a server");
  });
  it("gives every button a 44 px minimum size", () => {
    for (const patch of [{}, { confirmingErase: true }]) {
      const html = renderPrivacyPanelHtml(view(patch));
      const buttons = html.match(/<button[^>]*>/g) ?? [];
      expect(buttons.length).toBeGreaterThanOrEqual(2);
      for (const b of buttons) expect(b).toContain("min-width:44px;min-height:44px");
    }
  });
  it("gives each language option a 44 px label and marks the current one", () => {
    const html = renderPrivacyPanelHtml(view({ locale: "fr" }));
    expect(html.match(/<label style="[^"]*min-height:44px/g)).toHaveLength(2);
    expect(html).toMatch(/value="fr" data-locale-option checked/);
    expect(html).not.toMatch(/value="en" data-locale-option checked/);
    expect(html).toContain('<legend>Langue</legend>');
  });
  it("labels each language in its own language", () => {
    const html = renderPrivacyPanelHtml(view());
    expect(html).toContain('<span lang="fr">Français</span>');
    expect(html).toContain('<span lang="en">English</span>');
  });
  it("shows the confirmation only when asked", () => {
    expect(renderPrivacyPanelHtml(view())).not.toContain("data-privacy-confirm");
    const html = renderPrivacyPanelHtml(view({ confirmingErase: true }));
    expect(html).toContain("data-privacy-confirm");
    expect(html).toContain('role="group"');
    expect(html).toContain("Erase data on this device?");
    expect(html.indexOf('data-action="erase-cancel"')).toBeLessThan(html.indexOf('data-action="erase-confirm"'));
  });
  it("French confirmation title uses U+202F before the question mark", () => {
    const html = renderPrivacyPanelHtml(view({ locale: "fr", confirmingErase: true }));
    expect(html).toContain("appareil\u202f?");
  });
  it("always renders a polite status region, empty when there is no status", () => {
    const empty = renderPrivacyPanelHtml(view());
    expect(empty).toContain('role="status" aria-live="polite" tabindex="-1" data-privacy-status></p>');
    const full = renderPrivacyPanelHtml(view({ status: { kind: "erased", count: 2 } }));
    expect(full).toContain("data-privacy-status>Erased: 2 items.</p>");
  });
  it("renders with an empty inventory without claiming anything is kept", () => {
    const html = renderPrivacyPanelHtml(view({ inventory: [] }));
    expect(html).toContain("does not mean no data is kept");
  });
});

import type { Purpose } from "./consent";
import { setConsent } from "./consent";

const PURPOSES: readonly Purpose[] = [
  {
    id: "saved-places",
    label: { en: "Saved places", fr: "Lieux enregistrés" },
    description: { en: "Remember places on this device", fr: "Garder des lieux sur cet appareil" },
    wordingVersion: 1,
  },
];

describe("consent section", () => {
  it("is absent without purposes", () => {
    expect(renderPrivacyPanelHtml(view())).not.toContain("data-privacy-consent");
  });
  it("shows an undecided purpose with neither button pressed", () => {
    const html = renderPrivacyPanelHtml(view({ purposes: PURPOSES, consent: {} }));
    expect(html).toContain("Not decided yet");
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(2);
    expect(html).not.toContain('aria-pressed="true"');
  });
  it("marks the chosen button as pressed and shows the date", () => {
    const consent = setConsent({}, PURPOSES[0]!, "granted", new Date(2026, 10, 15));
    const html = renderPrivacyPanelHtml(view({ purposes: PURPOSES, consent }));
    expect(html).toContain("Allowed since 2026-11-15");
    expect(html).toMatch(/data-action="consent-grant"[^>]*aria-pressed="true"/);
    expect(html).toMatch(/data-action="consent-decline"[^>]*aria-pressed="false"/);
  });
  it("shows a refusal", () => {
    const consent = setConsent({}, PURPOSES[0]!, "declined", new Date(2026, 10, 15));
    const html = renderPrivacyPanelHtml(view({ purposes: PURPOSES, consent }));
    expect(html).toContain("Not allowed since 2026-11-15");
    expect(html).toMatch(/data-action="consent-decline"[^>]*aria-pressed="true"/);
  });
  it("asks again, and says why, when the wording changed", () => {
    const consent = setConsent({}, PURPOSES[0]!, "granted", new Date(2026, 10, 15));
    const newer = [{ ...PURPOSES[0]!, wordingVersion: 2 }];
    const html = renderPrivacyPanelHtml(view({ purposes: newer, consent }));
    expect(html).toContain("The wording changed. Please decide again.");
    expect(html).not.toContain('aria-pressed="true"');
  });
  it("names each button with its purpose and keeps the visible word first", () => {
    const html = renderPrivacyPanelHtml(view({ purposes: PURPOSES }));
    expect(html).toContain('aria-label="Allow: Saved places"');
    expect(html).toContain('aria-label="Do not allow: Saved places"');
    expect(html).toMatch(/aria-describedby="privacy-consent-status-saved-places"/);
  });
  it("renders in French", () => {
    const html = renderPrivacyPanelHtml(view({ locale: "fr", purposes: PURPOSES }));
    expect(html).toContain("Fonctions facultatives");
    expect(html).toContain('aria-label="Autoriser\u00a0: Lieux enregistrés"');
    expect(html).toContain("Pas encore décidé");
  });
  it("gives the consent buttons a 44 px minimum size", () => {
    const html = renderPrivacyPanelHtml(view({ purposes: PURPOSES }));
    const consentButtons = (html.match(/<button[^>]*data-purpose[^>]*>/g) ?? []);
    expect(consentButtons).toHaveLength(2);
    for (const b of consentButtons) expect(b).toContain("min-width:44px;min-height:44px");
  });
  it("escapes purpose text", () => {
    const evil = [{ ...PURPOSES[0]!, label: { en: "<b>x</b>", fr: "<b>x</b>" } }];
    const html = renderPrivacyPanelHtml(view({ purposes: evil }));
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).not.toContain("<b>x");
  });
});
