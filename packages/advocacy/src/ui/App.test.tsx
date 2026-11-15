// @vitest-environment jsdom
import axe from "axe-core";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { validatePack } from "../validate.ts";
import { obs } from "../test-helpers.ts";
import { App } from "./App.tsx";

afterEach(cleanup);

const sectionOf = (name: string) => {
  const heading = screen.getByRole("heading", { name });
  const section = heading.closest("section");
  if (!section) throw new Error(`no section for ${name}`);
  return section;
};

describe("review screen", () => {
  it("lists published cells, suppressed cells and unknown cells in English", () => {
    render(<App initialLang="en" />);
    expect(within(sectionOf("Published cells")).getAllByRole("listitem")).toHaveLength(7);
    expect(within(sectionOf("Suppressed cells")).getAllByRole("listitem")).toHaveLength(5);
    expect(within(sectionOf("Unknown counts")).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText(/Demonstration data only/)).toBeTruthy();
    expect(document.documentElement.lang).toBe("en");
  });

  it("says suppressed cells were suppressed and reveals no raw count", () => {
    const secret = [obs({ id: "example-x-1", area: "synthetic-area-q", band: "small", period: "2026-10", count: 1 }), obs({ id: "example-x-2", area: "synthetic-area-r", band: "large", period: "2026-10", count: 2 })];
    render(<App initialLang="en" observations={secret} />);
    const section = sectionOf("Suppressed cells");
    const items = within(section).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item.textContent).toContain("Suppressed. Count withheld.");
      expect((item.textContent ?? "").replace(/\d{4}-\d{2}/g, "")).not.toMatch(/\d/);
      expect(within(item).queryByText("Count")).toBeNull();
    }
  });

  it("switches to French with U+00A0 typography and updates the document language", () => {
    render(<App initialLang="en" />);
    fireEvent.click(screen.getByRole("button", { name: "Français" }));
    expect(document.documentElement.lang).toBe("fr");
    expect(within(sectionOf("Cellules supprimées")).getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByText("Cellules publiées\u00a0: 7", { normalizer: (text) => text })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Exporter le dossier" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Français" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("exports a valid pack and announces the file name", () => {
    const onExport = vi.fn();
    render(<App initialLang="en" onExport={onExport} />);
    fireEvent.click(screen.getByRole("button", { name: "Export pack" }));
    expect(onExport).toHaveBeenCalledTimes(1);
    const [json, filename] = onExport.mock.calls[0] as [string, string];
    expect(filename).toBe("advocacy-evidence-pack-2026-11-15.json");
    expect(validatePack(JSON.parse(json)).ok).toBe(true);
    expect(screen.getByRole("status").textContent).toBe("Evidence pack exported as advocacy-evidence-pack-2026-11-15.json.");
  });

  for (const lang of ["en", "fr"] as const) {
    it(`has no axe violations in ${lang} (colour contrast is checked in the browser test)`, async () => {
      const { container } = render(<App initialLang={lang} />);
      const results = await axe.run(container, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
      expect(results.violations.map((v) => v.id)).toEqual([]);
    });
  }
});
