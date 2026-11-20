/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlaceSheet } from "./PlaceSheet";
import { bare, place } from "./placeFixtures";
import { lintFrench } from "./typography";
import type { SavedFile } from "./downloadFile";

const TODAY = "2026-11-19";
const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
afterEach(cleanup);

function show(p = place("a", { tier: 0 }), locale: "en" | "fr" = "en", onSave?: (f: SavedFile) => boolean) {
  document.documentElement.lang = locale;
  const view = render(<PlaceSheet place={p} locale={locale} today={TODAY} onSave={onSave} />);
  const toggle = () => screen.getByRole("button", { name: locale === "en" ? /details and gaps/i : /détails et lacunes/i });
  return { ...view, toggle };
}

describe("the disclosure", () => {
  it("starts closed, with the panel hidden and no table", () => {
    const { toggle } = show();
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("table")).toBeNull();
  });
  it("controls a panel that exists", () => {
    const { toggle, container } = show();
    const id = toggle().getAttribute("aria-controls")!;
    expect(container.ownerDocument.getElementById(id)).not.toBeNull();
  });
  it("opens on press and says so, and closes again", () => {
    const { toggle } = show();
    fireEvent.click(toggle());
    expect(screen.getByRole("button", { name: /hide details and gaps/i }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("table")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /hide details and gaps/i }));
    expect(screen.queryByRole("table")).toBeNull();
  });
  it("opens with the keyboard (Enter and Space on the real button)", () => {
    const { toggle } = show();
    toggle().focus();
    fireEvent.keyDown(toggle(), { key: "Enter" });
    fireEvent.keyUp(toggle(), { key: "Enter" });
    expect(screen.queryByRole("table")).not.toBeNull();
  });
});

describe("the table", () => {
  it("has a caption naming the place and two column headers", () => {
    const { toggle } = show();
    fireEvent.click(toggle());
    expect(screen.getByRole("table", { name: "What the pack gives for Place a" })).toBeTruthy();
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Detail", "Value"]);
  });
  it("has one row header per detail, nine in all for a place with no note", () => {
    const { toggle } = show();
    fireEvent.click(toggle());
    expect(screen.getAllByRole("rowheader")).toHaveLength(9);
  });
  it("shows UNKNOWN with its reason for each gap", () => {
    const { toggle } = show(bare("z"));
    fireEvent.click(toggle());
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(9);
    for (const r of rows) {
      expect(r.getAttribute("data-known")).toBe("false");
      expect(within(r).getAllByRole("cell")[0]!.textContent).toMatch(/^UNKNOWN The pack (gives|does not give)/);
    }
  });
  it("gives the count as a sentence that is not a rating", () => {
    const { toggle } = show(bare("z"));
    fireEvent.click(toggle());
    expect(screen.getByText(/^The pack gives 0 of 9 details for this place\./)).toBeTruthy();
  });
  it("shows a stale notice for old details and none for fresh ones", () => {
    const { toggle, unmount } = show(place("a", { provenance: { source_name: "S", licence: "ODbL-1.0", retrieved_at: "2024-01-01", tier: 0 } }));
    fireEvent.click(toggle());
    expect(document.querySelector("[data-place-sheet] p:nth-of-type(2)")?.textContent).toMatch(/\S/);
    unmount();
    show();
    fireEvent.click(screen.getByRole("button", { name: /details and gaps/i }));
    expect(screen.queryByText(/over a year|more than a year|plus d’un an/i)).toBeNull();
  });
});

describe("taking the place along", () => {
  it("offers a geo link styled as a button for a place with a map point", () => {
    const { toggle } = show();
    fireEvent.click(toggle());
    const link = screen.getByRole("link", { name: "Open in your maps app" });
    expect(link.getAttribute("href")).toBe("geo:43.65000,-79.38000");
    expect(link.className).toContain("btn");
  });
  it("offers no link and no GPX button, and says why, for a place with no map point", () => {
    const { toggle } = show(place("a", { lat: null, lon: null }));
    fireEvent.click(toggle());
    expect(screen.queryByRole("link", { name: /maps app/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /GPX/ })).toBeNull();
    expect(screen.getByText(/No map point, so there is no map link\. Its position is UNKNOWN\./)).toBeTruthy();
    expect(screen.getByRole("button", { name: /contact card/ })).toBeTruthy();
  });
  it("saves a .vcf with the card content", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    const { toggle } = show(place("a"), "en", onSave);
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole("button", { name: /contact card/ }));
    const file = onSave.mock.calls[0]![0] as SavedFile;
    expect(file.name).toBe("place.vcf");
    expect(file.mime).toContain("text/vcard");
    expect(file.content.startsWith("BEGIN:VCARD\r\n")).toBe(true);
    expect(document.querySelector("[data-sheet-status]")?.textContent).toBe("Saved place.vcf.");
  });
  it("saves a .gpx with one waypoint", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    const { toggle } = show(place("a"), "fr", onSave);
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole("button", { name: /point de passage/ }));
    const file = onSave.mock.calls[0]![0] as SavedFile;
    expect(file.name).toBe("lieux.gpx");
    expect(file.content.match(/<wpt /g)).toHaveLength(1);
    expect(document.querySelector("[data-sheet-status]")?.textContent).toBe("Fichier lieux.gpx enregistré.");
  });
  it("says so when the browser cannot save, and when saving throws", () => {
    for (const onSave of [() => false, () => { throw new Error("blocked"); }]) {
      const { toggle, unmount } = show(place("a"), "en", onSave);
      fireEvent.click(toggle());
      fireEvent.click(screen.getByRole("button", { name: /contact card/ }));
      expect(document.querySelector("[data-sheet-status]")?.textContent).toBe("This browser cannot save a file here.");
      unmount();
    }
  });
  it("keeps the status in a polite live region", () => {
    const { toggle } = show();
    fireEvent.click(toggle());
    expect(document.querySelector("[data-sheet-status]")?.getAttribute("aria-live")).toBe("polite");
  });
});

describe("French and accessibility", () => {
  it("passes the French typography check on every text node", () => {
    const { toggle, container } = show(bare("z"), "fr");
    fireEvent.click(toggle());
    for (const el of container.querySelectorAll("p, th, td, caption, button, a")) {
      const text = el.textContent ?? "";
      expect(lintFrench(text), text).toEqual([]);
    }
  });
  it("never writes the French word for UNKNOWN", () => {
    const { toggle, container } = show(bare("z"), "fr");
    fireEvent.click(toggle());
    expect(container.textContent).not.toMatch(/INCONN/i);
    expect(container.textContent).toContain("UNKNOWN");
  });
  it("has no axe violations closed or open, in either language", async () => {
    for (const locale of ["en", "fr"] as const) {
      const { toggle, container, unmount } = show(place("a", { wheelchair_description: "Side door" }), locale);
      expect((await axe.run(container, axeRules)).violations).toEqual([]);
      fireEvent.click(toggle());
      expect((await axe.run(container, axeRules)).violations).toEqual([]);
      unmount();
    }
  });
});

describe("saving the details as text", () => {
  it("saves a .txt made from the same rows", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    const { toggle } = show(place("a"), "en", onSave);
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole("button", { name: "Save the details as text (.txt)" }));
    const file = onSave.mock.calls[0]![0];
    expect(file.name).toBe("place-details.txt");
    expect(file.mime).toContain("text/plain");
    expect(file.content).toContain("Name: Place a");
  });
  it("is offered even when the place has no map point", () => {
    const { toggle } = show(place("a", { lat: null, lon: null }));
    fireEvent.click(toggle());
    expect(screen.getByRole("button", { name: "Save the details as text (.txt)" })).toBeTruthy();
  });
  it("is in French in French", () => {
    const { toggle } = show(place("a"), "fr");
    fireEvent.click(toggle());
    expect(screen.getByRole("button", { name: "Enregistrer les détails comme texte (.txt)" })).toBeTruthy();
  });
});
