import { describe, expect, it } from "vitest";
// Imported through the folder index so the public entry point is exercised.
import { renderOnDeviceNoticeHtml, STRINGS } from "./index.ts";

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
  it("renders FR with lang, apostrophe and U+00A0 before a colon", () => {
    const html = renderOnDeviceNoticeHtml({ locale: "fr", items, reviewedOn: "2026-11-15" });
    expect(html).toContain('lang="fr"');
    expect(html).toContain("Dernière révision\u00a0: 2026-11-15");
    expect(html).toContain("Lieux enregistrés\u00a0: <strong>Reste sur cet appareil");
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
});
