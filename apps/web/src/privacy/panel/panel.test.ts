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
  it("lets keyboard users scroll the table", () => {
    const html = renderInventoryTableHtml("en", FIXTURE);
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('role="region"');
    expect(html).toContain("aria-labelledby");
  });
  it("shows missing fields as unknown, never as a value", () => {
    const html = renderInventoryTableHtml("en", FIXTURE);
    const settings = html.slice(html.indexOf('data-id="settings"'));
    expect(settings).toContain("<td>Not known</td><td>Not known</td><td>Not known</td>");
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
    expect(html).toContain("<td>Inconnu</td>");
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
