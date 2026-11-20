/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TagNoteReads } from "./TagNoteReads";
import { place } from "./placeFixtures";
import { tagNotePlaces } from "./tagNoteFixtures";
import type { Locale } from "./stateCopy";

const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
const places = tagNotePlaces();
afterEach(cleanup);

const show = (locale: Locale = "en", onSave?: (f: { name: string; mime: string; content: string }) => boolean, list = places) => {
  document.documentElement.lang = locale;
  return render(<TagNoteReads places={list} locale={locale} onSave={onSave} />);
};
const toggle = (locale: Locale = "en") => screen.getByRole("button", { name: locale === "en" ? /^(Show|Hide) tags and notes$/ : /^(Afficher|Masquer) les indications et les notes$/ });
const open = (locale: Locale = "en") => fireEvent.click(toggle(locale));
const items = () => within(screen.getByRole("list", { name: /^(Places to read|Lieux à lire)$/ })).getAllByRole("listitem");
const titles = () => items().map((li) => li.querySelector("strong")!.textContent);

describe("TagNoteReads", () => {
  it("shows its heading and a closed toggle first", () => {
    show();
    expect(screen.getByText("Tags and notes side by side")).toBeTruthy();
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector("[data-tag-notes-body]")).toBeNull();
  });
  it("shows nothing when no place has a note", () => {
    expect(show("en", undefined, [place("a", { wheelchair_description: null })]).container.innerHTML).toBe("");
    cleanup();
    expect(show("en", undefined, []).container.innerHTML).toBe("");
  });
  it("opens to the intro, the three readings and the count", () => {
    show();
    open();
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(/not a list of mistakes/)).toBeTruthy();
    expect(screen.getByText("The three readings")).toBeTruthy();
    expect(screen.getByText("Tag No, and the note uses: Ramps and slopes; Lifts and elevators")).toBeTruthy();
    expect(document.querySelector("[data-tag-notes-count]")!.textContent).toBe("5 of 10 notes are on the list.");
  });
  it("lists each place in name order with its tag, the reading and the note", () => {
    show();
    open();
    expect(titles()).toEqual(["Alpha Cafe", "Delta Diner", "Gamma Grill", "Iota Inn", "Place with no name (UNKNOWN)"]);
    const alpha = items()[0]!;
    expect(alpha.textContent).toContain("Wheelchair tag: Yes");
    expect(alpha.textContent).toContain("Tag Yes or Designated, note has a steps word");
    expect(alpha.textContent).toContain("Tag: Yes; the note uses: Steps and stairs");
    expect(within(alpha).getByRole("blockquote" as never, { hidden: true }).textContent).toBe("Two steps at the front door");
  });
  it("marks the words that put the note on the list, and no others", () => {
    show();
    open();
    const gamma = items()[2]!;
    expect([...gamma.querySelectorAll("mark")].map((m) => m.textContent)).toEqual(["Stairs"]);
    const delta = items()[1]!;
    expect([...delta.querySelectorAll("mark")].map((m) => m.textContent)).toEqual(["Elevator"]);
    // The note keeps its own other words, unmarked, in the order written.
    expect(gamma.querySelector("blockquote")!.textContent).toBe("Stairs only, ramp at the back");
  });
  it("shows the note exactly as written, even when it looks like markup", () => {
    const odd = place("o", { name: "Odd", wheelchair: "yes", wheelchair_description: "<b>steps</b> & \"more\"" });
    show("en", undefined, [odd]);
    open();
    expect(document.querySelector("blockquote")!.textContent).toBe("<b>steps</b> & \"more\"");
    expect(document.querySelector("blockquote b")).toBeNull();
  });
  it("narrows to one reading and back", () => {
    show();
    open();
    fireEvent.click(screen.getByLabelText("Tag No, note has a ramp or lift word (1)"));
    expect(titles()).toEqual(["Delta Diner"]);
    fireEvent.click(screen.getByLabelText("All readings (5)"));
    expect(items()).toHaveLength(5);
  });
  it("changes the order", () => {
    show();
    open();
    fireEvent.click(screen.getByLabelText("By reading, then name"));
    expect(titles()).toEqual(["Alpha Cafe", "Gamma Grill", "Iota Inn", "Delta Diner", "Place with no name (UNKNOWN)"]);
  });
  it("says so when no note is on the list, and offers no filters", () => {
    show("en", undefined, [place("a", { wheelchair: "yes", wheelchair_description: "Washrooms upstairs" })]);
    open();
    expect(document.querySelector("[data-tag-notes-count]")!.textContent).toContain("The note is not read");
    expect(screen.queryByRole("list", { name: "Places to read" })).toBeNull();
    expect(screen.queryByLabelText(/All readings/)).toBeNull();
  });
  it("saves text and CSV of what is shown, and says so", () => {
    const onSave = vi.fn(() => true);
    show("en", onSave);
    open();
    fireEvent.click(screen.getByLabelText("Tag No, note has a ramp or lift word (1)"));
    fireEvent.click(screen.getByRole("button", { name: "Save the list as text" }));
    fireEvent.click(screen.getByRole("button", { name: "Save the list as a table (CSV)" }));
    const [txt, csv] = onSave.mock.calls.map((c) => (c as unknown as [{ name: string; mime: string; content: string }])[0]);
    expect(txt!.name).toBe("pack-tags-and-notes.txt");
    expect(txt!.content).toContain("Elevator out of service");
    expect(txt!.content).not.toContain("Two steps at the front door");
    expect(csv!.content.startsWith("\uFEFFplace_id,")).toBe(true);
    expect(csv!.content.split("\r\n").filter(Boolean)).toHaveLength(2);
    expect(document.querySelector("[data-tag-notes-status]")!.textContent).toBe("Saved pack-tags-and-notes.csv.");
  });
  it("says so when the browser cannot save, or saving fails", () => {
    show("en", () => false);
    open();
    fireEvent.click(screen.getByRole("button", { name: "Save the list as text" }));
    expect(document.querySelector("[data-tag-notes-status]")!.textContent).toBe("This browser cannot save a file here.");
    cleanup();
    show("en", () => {
      throw new Error("no");
    });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Save the list as text" }));
    expect(document.querySelector("[data-tag-notes-status]")!.textContent).toBe("This browser cannot save a file here.");
  });
  it("works in French, with the French note as written", () => {
    show("fr");
    open("fr");
    expect(screen.getByText("Indications et notes côte à côte")).toBeTruthy();
    const iota = items().find((li) => li.textContent?.includes("Iota Inn"))!;
    expect([...iota.querySelectorAll("mark")].map((m) => m.textContent)).toEqual(["marches"]);
    expect(iota.querySelector("blockquote")!.textContent).toBe("Entrée avec des marches");
    expect(iota.textContent).toContain("Indication pour fauteuil roulant\u00a0: Oui");
  });
  it("has no accessibility violations, open, in either language", async () => {
    for (const l of ["en", "fr"] as const) {
      const { container } = show(l);
      open(l);
      expect((await axe.run(container, axeRules)).violations, l).toEqual([]);
      cleanup();
    }
  });
});
