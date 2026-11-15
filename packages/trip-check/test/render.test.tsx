import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MemoryStorage, PROMPTS, STRINGS, TripCheck } from "../src/index";

describe("TripCheck markup", () => {
  for (const lang of ["en", "fr"] as const) {
    it(`renders three native buttons per prompt in ${lang}`, () => {
      const html = renderToStaticMarkup(<TripCheck storage={new MemoryStorage()} lang={lang} />);
      expect((html.match(/<button/g) ?? []).length).toBe(PROMPTS.length * 3 + 1);
      expect(html).toContain(`lang="${lang}"`);
      expect(html).toContain('role="group"');
      expect(html).toContain('aria-pressed="false"');
      expect(html).toContain('role="status"');
      for (const p of PROMPTS) expect(html).toContain(p.text[lang].replace(/['’]/g, "&#x27;"));
      expect(html).toContain(STRINGS[lang].notChecked);
    });
  }
  it("shows unanswered prompts as not answered, never as no", () => {
    const html = renderToStaticMarkup(<TripCheck storage={new MemoryStorage()} lang="en" />);
    expect(html).toContain("Not answered");
  });
});
