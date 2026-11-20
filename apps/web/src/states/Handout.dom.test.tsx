/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Handout } from "./Handout";
import { bare, place, varied } from "./placeFixtures";
import { lintFrench } from "./typography";
import type { SavedFile } from "./downloadFile";

const TODAY = "2026-11-19";
const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
afterEach(cleanup);
const two = [place("a", { wheelchair_description: "Side door" }), bare("z")];
type Save = (f: SavedFile) => boolean;

function open(places = two, locale: "en" | "fr" = "en", onSave?: Save) {
  document.documentElement.lang = locale;
  const view = render(<Handout places={places} locale={locale} today={TODAY} onSave={onSave} />);
  fireEvent.click(screen.getByRole("button", { name: locale === "en" ? "Make a large-print page" : "Créer une page en gros caractères" }));
  return view;
}
const preview = () => document.querySelector("[data-handout-preview]") as HTMLElement;

describe("Handout", () => {
  it("renders nothing for no places", () => {
    expect(render(<Handout places={[]} locale="en" today={TODAY} />).container.innerHTML).toBe("");
  });
  it("starts closed with no preview, and says what it is expanded", () => {
    render(<Handout places={two} locale="en" today={TODAY} />);
    const b = screen.getByRole("button", { name: "Make a large-print page" });
    expect(b.getAttribute("aria-expanded")).toBe("false");
    expect(preview()).toBeNull();
  });
  it("controls a panel that exists", () => {
    const { container } = render(<Handout places={two} locale="en" today={TODAY} />);
    const id = screen.getByRole("button").getAttribute("aria-controls")!;
    expect(container.ownerDocument.getElementById(id)).not.toBeNull();
  });
  it("opens to the size choice, three checkboxes, a preview and a save button", () => {
    open();
    expect(screen.getByRole("radiogroup", { name: "Text size" })).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(screen.getAllByRole("checkbox")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Save the page (.html)" })).toBeTruthy();
  });
  it("starts at Large with all three options on", () => {
    open();
    expect((screen.getByRole("radio", { name: "Large (18 point)" }) as HTMLInputElement).checked).toBe(true);
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.map((c) => c.checked)).toEqual([true, true, true, false]);
  });
  it("shows the title, the places in order and the footer in the preview", () => {
    open();
    const p = within(preview());
    expect(p.getByRole("heading", { name: "My 2 places" })).toBeTruthy();
    expect(p.getAllByRole("listitem").map((li) => li.querySelector("strong")!.textContent)).toEqual(["Place a", "Name UNKNOWN"]);
    expect(p.getByText(/not a check of the place/)).toBeTruthy();
  });
  it("sets the preview size from the choice", () => {
    open();
    expect(preview().style.fontSize).toBe("18pt");
    fireEvent.click(screen.getByRole("radio", { name: "Extra large (24 point)" }));
    expect(preview().style.fontSize).toBe("24pt");
    fireEvent.click(screen.getByRole("radio", { name: "Standard (14 point)" }));
    expect(preview().style.fontSize).toBe("14pt");
  });
  it("drops a line from the preview when its option is switched off", () => {
    open();
    expect(within(preview()).getAllByText("Map point")).toHaveLength(2);
    fireEvent.click(screen.getByRole("checkbox", { name: "Include map points as numbers" }));
    expect(within(preview()).queryByText("Map point")).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Include where each detail comes from" }));
    expect(within(preview()).queryByText("Where it comes from")).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Include the pack’s notes" }));
    expect(within(preview()).queryByText("Side door")).toBeNull();
  });
  it("closes again", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Hide the large-print page" }));
    expect(preview()).toBeNull();
  });
});

describe("questions option", () => {
  it("is off at first and adds the questions to the preview when switched on", () => {
    open();
    expect(within(preview()).queryByText("Questions to ask")).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Include questions to ask, with room to write the answer" }));
    expect(within(preview()).getAllByText("Questions to ask")).toHaveLength(2);
  });
  it("puts the questions and an answer line into the saved page", () => {
    const onSave = vi.fn<Save>(() => true);
    open(two, "en", onSave);
    fireEvent.click(screen.getByRole("checkbox", { name: "Include questions to ask, with room to write the answer" }));
    fireEvent.click(screen.getByRole("button", { name: "Save the page (.html)" }));
    expect(onSave.mock.calls[0]![0].content).toContain('<div class="answer"></div>');
  });
});

describe("saving", () => {
  it("hands over an html file made with the chosen options", () => {
    const onSave = vi.fn<Save>(() => true);
    open(two, "en", onSave);
    fireEvent.click(screen.getByRole("radio", { name: "Extra large (24 point)" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Include map points as numbers" }));
    fireEvent.click(screen.getByRole("button", { name: "Save the page (.html)" }));
    const file = onSave.mock.calls[0]![0];
    expect(file.name).toBe("large-print-list.html");
    expect(file.mime).toBe("text/html;charset=utf-8");
    expect(file.content).toContain("font-size: 24pt");
    expect(file.content).not.toContain("43.65000");
    expect(document.querySelector("[data-handout-status]")?.textContent).toBe("Saved large-print-list.html. Open it in a browser to read or print it.");
  });
  it("says so when the browser cannot save or saving throws", () => {
    for (const onSave of [() => false, () => { throw new Error("x"); }]) {
      const { unmount } = open(two, "en", onSave);
      fireEvent.click(screen.getByRole("button", { name: "Save the page (.html)" }));
      expect(document.querySelector("[data-handout-status]")?.textContent).toBe("This browser cannot save a file here.");
      unmount();
    }
  });
  it("keeps the status in a polite live region", () => {
    open();
    expect(document.querySelector("[data-handout-status]")!.getAttribute("aria-live")).toBe("polite");
  });
  it("copes with a longer list", () => {
    open(varied(4, 12));
    expect(within(preview()).getAllByRole("listitem")).toHaveLength(12);
  });
});

describe("French and accessibility", () => {
  it("is French, with typography kept and no French word for UNKNOWN", () => {
    const { container } = open(two, "fr");
    expect(screen.getByRole("radio", { name: "Grand (18 points)" })).toBeTruthy();
    for (const el of container.querySelectorAll("p, label, button, h4, dt")) expect(lintFrench(el.textContent ?? ""), el.textContent ?? "").toEqual([]);
    expect(container.textContent).not.toMatch(/INCONN/i);
    expect(container.textContent).toContain("UNKNOWN");
  });
  it("has no axe violations closed or open, in either language", async () => {
    for (const locale of ["en", "fr"] as const) {
      document.documentElement.lang = locale;
      const { container, unmount } = render(<Handout places={two} locale={locale} today={TODAY} />);
      expect((await axe.run(container, axeRules)).violations).toEqual([]);
      fireEvent.click(screen.getAllByRole("button")[0]!);
      expect((await axe.run(container, axeRules)).violations).toEqual([]);
      unmount();
    }
  });
});
