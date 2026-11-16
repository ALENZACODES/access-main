import { describe, expect, it } from "vitest";
// Imported through the folder index so the public entry point is exercised.
import { aboutNoticeItems, renderOnDeviceNoticeHtml, STRINGS } from "./index.ts";

const items = [
  { id: "a", label: { en: "Saved places", fr: "Lieux enregistrés" }, where: "on-device" as const },
  { id: "b", label: { en: "Feedback <note>", fr: "Commentaires" }, where: "sent-to-server" as const },
  { id: "c", label: { en: "Settings", fr: "Réglages" } },
];

describe("renderOnDeviceNoticeHtml", () => {
  it("shows an unstated location as unknown, never assumed", () => {
    const html = renderOnDeviceNoticeHtml({ locale: "en", items });
    expect(html).toContain('data-where="unknown"');
    expect(html).toContain("Not known");
  });
  it("escapes labels", () => {
    const html = renderOnDeviceNoticeHtml({ locale: "en", items });
    expect(html).toContain("Feedback &lt;note&gt;");
    expect(html).not.toContain("<note>");
  });
  it("renders FR with lang, typographic apostrophe and a no-break space before a colon", () => {
    const html = renderOnDeviceNoticeHtml({ locale: "fr", items, reviewedOn: "2026-11-15" });
    expect(html).toContain('lang="fr"');
    expect(html).toContain("Dernière révision\u00A0: 2026-11-15");
    expect(html).toContain("Lieux enregistrés\u00A0: <strong>Reste sur cet appareil");
    expect(STRINGS.fr.empty).toContain("’");
    expect(STRINGS.fr.empty).not.toContain("'");
  });
  it("an empty list does not claim that nothing is kept", () => {
    expect(renderOnDeviceNoticeHtml({ locale: "en", items: [] })).toContain(
      "does not mean no data is kept",
    );
  });
  it("ignores a malformed review date and sizes the dismiss button to 44px", () => {
    const html = renderOnDeviceNoticeHtml({
      locale: "en", items, reviewedOn: "yesterday", showDismiss: true,
    });
    expect(html).not.toContain("Last reviewed");
    expect(html).toContain("min-width:44px;min-height:44px");
  });

  it("lists language choice and optional geolocation with the About inventory", () => {
    const inventory = aboutNoticeItems();
    expect(inventory.map((item) => item.id)).toEqual([
      "profile",
      "cache",
      "outbox",
      "language",
      "geolocation",
    ]);
    expect(inventory.every((item) => item.where === "on-device")).toBe(true);
    const html = renderOnDeviceNoticeHtml({ locale: "fr", items: inventory });
    expect(html).toContain("Choix de langue");
    expect(html).toContain("Géolocalisation facultative");
    expect(html).toContain("Brouillons d’export de contribution");
  });
});
