/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SavedFile } from "./downloadFile";
import { withNote } from "./noteTopicFixtures";
import type { Locale } from "./stateCopy";
import { TAG_NOTE_SHOWN, TagNoteCheck } from "./TagNoteCheck";
import { lintFrench } from "./typography";

const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
const set = () => [
  withNote("a", "Two steps at the front door.", { wheelchair: "yes", name: "Alpha Hall" }),
  withNote("b", "Step free entrance.", { wheelchair: "no", name: "Beta Court" }),
  withNote("c", "Two steps at the front, ramp at the side.", { wheelchair: "yes", name: "Gamma Gate" }),
  withNote("d", "Ramp at the side.", { wheelchair: "yes", name: "Delta Door" }),
  withNote("e", "Stairs only.", { wheelchair: "limited", name: "Epsilon" }),
  withNote("f", null, { wheelchair: "yes", name: "Zeta" }),
];

afterEach(cleanup);

function show(over: { places?: ReturnType<typeof set>; locale?: Locale; onSave?: (f: SavedFile) => boolean } = {}) {
  const locale = over.locale ?? "en";
  document.documentElement.lang = locale;
  return render(<TagNoteCheck places={over.places ?? set()} locale={locale} onSave={over.onSave} />);
}
const group = (name: string) => screen.getByRole("radiogroup", { name });
const toggle = (l: Locale = "en") => screen.getByRole("button", { name: l === "en" ? /^(Look for a tag and a note that point different ways|Hide the tag and note check)$/ : /^(Chercher une balise et une note qui vont en sens contraire|Masquer la comparaison de la balise et de la note)$/ });
const open = (l: Locale = "en") => fireEvent.click(toggle(l));
const names = (c: HTMLElement) => [...c.querySelectorAll("[data-tag-note-list] > li > strong")].map((e) => e.textContent);

describe("TagNoteCheck closed", () => {
  it("shows nothing when no place has a note", () => {
    expect(show({ places: [withNote("a", null)] }).container.innerHTML).toBe("");
    cleanup();
    expect(show({ places: [] }).container.innerHTML).toBe("");
  });
  it("starts closed with the body hidden, no heading element and no list", () => {
    const { container } = show();
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(toggle().getAttribute("aria-controls")).toBe(container.querySelector("[data-tag-note-body]")!.id);
    expect((container.querySelector("[data-tag-note-body]") as HTMLElement).hidden).toBe(true);
    expect(container.querySelector("h1, h2, h3, h4, h5, h6")).toBeNull();
    expect(container.querySelector("[data-tag-note-list]")).toBeNull();
  });
});

describe("TagNoteCheck open", () => {
  it("lists the places whose tag and note point different ways, clear cases first", () => {
    const { container } = show();
    open();
    expect(names(container)).toEqual(["Alpha Hall", "Beta Court", "Gamma Gate"]);
  });
  it("does not list a place whose note agrees, whose tag is limited, or that has no note", () => {
    const { container } = show();
    open();
    const n = names(container);
    for (const x of ["Delta Door", "Epsilon", "Zeta"]) expect(n).not.toContain(x);
  });
  it("says how many places it compared and how many point different ways", () => {
    show();
    open();
    expect(screen.getByText("4 places have a yes or no tag and a note to compare.")).toBeTruthy();
    expect(screen.getByText("3 places point different ways.")).toBeTruthy();
  });
  it("says what was left out", () => {
    show();
    open();
    expect(screen.getByText("1 place has no note. 1 note has a tag of limited or UNKNOWN, which a note cannot contradict.")).toBeTruthy();
  });
  it("says so when nothing points different ways", () => {
    show({ places: [withNote("a", "Ramp at the side.", { wheelchair: "yes", name: "Alpha" })] as ReturnType<typeof set> });
    open();
    expect(screen.getByText("None of them point different ways.")).toBeTruthy();
    expect(screen.getByText("No place on this list has a tag and a note that point different ways.")).toBeTruthy();
    expect(screen.queryByRole("radiogroup", { name: "Show" })).toBeNull();
  });
  it("shows the note as written with each marked word named", () => {
    const { container } = show();
    open();
    const li = [...container.querySelectorAll("[data-tag-note-list] > li")].find((x) => x.textContent!.includes("Gamma Gate"))!;
    expect(li.querySelector("[data-tag-note-text]")!.textContent).toBe("Two steps (barrier) at the front, ramp (access) at the side.");
    expect([...li.querySelectorAll("mark")].map((m) => m.textContent)).toEqual(["steps", "ramp"]);
  });
  it("shows the tag, what the pair reads as, and how clear the case is", () => {
    const { container } = show();
    open();
    const t = container.querySelector("[data-tag-note-list]")!.textContent!;
    expect(t).toContain("Tag: yes");
    expect(t).toContain("The tag says yes; the note uses words that read as barriers.");
    expect(t).toContain("All the marked words point the same way.");
    expect(t).toContain("so it may be describing more than one part of the place");
  });
  it("says it does not say which is right", () => {
    show();
    open();
    expect(screen.getByText(/does not say which one is right/)).toBeTruthy();
    expect(screen.getByText("Not a finding. Either the tag or the note may be right, and the pack does not say which.")).toBeTruthy();
  });
  it("filters by kind and says when nothing matches", () => {
    const { container } = show();
    open();
    fireEvent.click(within(group("Show")).getByRole("radio", { name: "Tag says no, note uses access words" }));
    expect(names(container)).toEqual(["Beta Court"]);
    cleanup();
    const only = show({ places: [withNote("a", "Two steps.", { wheelchair: "yes", name: "Alpha" })] as ReturnType<typeof set> });
    open();
    fireEvent.click(within(group("Show")).getByRole("radio", { name: "Tag says no, note uses access words" }));
    expect(screen.getByText("No place matches that choice.")).toBeTruthy();
    expect(only.container.querySelector("[data-tag-note-list]")).toBeNull();
  });
  it("orders by name", () => {
    const { container } = show();
    open();
    fireEvent.click(within(group("Order")).getByRole("radio", { name: "By name" }));
    expect(names(container)).toEqual(["Alpha Hall", "Beta Court", "Gamma Gate"]);
    fireEvent.click(within(group("Order")).getByRole("radio", { name: "Pack order" }));
    expect(names(container)).toEqual(["Alpha Hall", "Beta Court", "Gamma Gate"]);
  });
  it("lists at most the limit and still counts them all", () => {
    const many = Array.from({ length: TAG_NOTE_SHOWN + 4 }, (_, i) => withNote(`m${i}`, "Two steps.", { wheelchair: "yes", name: `Place ${String(i).padStart(2, "0")}` }));
    const { container } = show({ places: many as ReturnType<typeof set> });
    open();
    expect(names(container)).toHaveLength(TAG_NOTE_SHOWN);
    expect(screen.getByText(`${TAG_NOTE_SHOWN + 4} places point different ways.`)).toBeTruthy();
  });
  it("keeps the choices when closed and opened again", () => {
    show();
    open();
    fireEvent.click(within(group("Order")).getByRole("radio", { name: "By name" }));
    open();
    open();
    expect((within(group("Order")).getByRole("radio", { name: "By name" }) as HTMLInputElement).checked).toBe(true);
  });
  it("does not work out anything while closed", () => {
    const { container } = show();
    expect(container.querySelector("[data-tag-note-body]")!.childElementCount).toBe(0);
  });
});

describe("TagNoteCheck saving", () => {
  it("saves the text and CSV of what is listed", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    show({ onSave });
    open();
    fireEvent.click(within(group("Show")).getByRole("radio", { name: "Tag says no, note uses access words" }));
    fireEvent.click(screen.getByRole("button", { name: "Save as a CSV file" }));
    fireEvent.click(screen.getByRole("button", { name: "Save as a text file" }));
    expect(onSave.mock.calls.map((c) => c[0].name)).toEqual(["tag-and-note.csv", "tag-and-note.txt"]);
    expect(onSave.mock.calls[0]![0].content.trim().split("\r\n")).toHaveLength(2);
    expect(screen.getByText("Saved tag-and-note.txt.")).toBeTruthy();
  });
  it("says the browser cannot save when saving fails or throws", () => {
    show({ onSave: () => false });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Save as a text file" }));
    expect(screen.getByText("This browser cannot save a file here.")).toBeTruthy();
    cleanup();
    show({
      onSave: () => {
        throw new Error("no");
      },
    });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Save as a CSV file" }));
    expect(screen.getByText("This browser cannot save a file here.")).toBeTruthy();
  });
});

describe("TagNoteCheck by keyboard", () => {
  it("opens with Enter and Space and keeps focus on the toggle", () => {
    show();
    const b = toggle();
    b.focus();
    for (const key of ["Enter", " "]) {
      fireEvent.keyDown(b, { key });
      fireEvent.keyUp(b, { key });
    }
    expect(document.activeElement).toBe(b);
  });
  it("reaches the marked words in order without a tab stop of their own", () => {
    const { container } = show();
    open();
    for (const m of container.querySelectorAll("mark")) expect(m.getAttribute("tabindex")).toBeNull();
    expect(within(container as HTMLElement).getAllByRole("radio").length).toBeGreaterThan(0);
  });
});

for (const locale of ["en", "fr"] as const) {
  describe(`TagNoteCheck in ${locale}`, () => {
    it("has no axe violations closed, open and filtered", async () => {
      const { container } = show({ locale });
      expect((await axe.run(container, axeRules)).violations, "closed").toEqual([]);
      open(locale);
      expect((await axe.run(container, axeRules)).violations, "open").toEqual([]);
      fireEvent.click(within(container.querySelector("[data-tag-note-body]") as HTMLElement).getAllByRole("radio")[1]!);
      expect((await axe.run(container, axeRules)).violations, "filtered").toEqual([]);
    });
    it("uses the page's language and French typography on its own words", () => {
      const { container } = show({ locale });
      open(locale);
      expect(container.querySelector("section")!.getAttribute("lang")).toBe(locale);
      if (locale === "fr") for (const el of container.querySelectorAll<HTMLElement>("section > p, button, label, [data-tag-note-body] > p, [data-tag-note-list] small")) expect(lintFrench(el.textContent ?? ""), el.textContent ?? "").toEqual([]);
    });
    it("names the marked words by direction in the page's language", () => {
      const { container } = show({ locale });
      open(locale);
      expect(container.querySelector("[data-tag-note-text]")!.textContent).toContain(locale === "fr" ? "(obstacle)" : "(barrier)");
    });
  });
}
