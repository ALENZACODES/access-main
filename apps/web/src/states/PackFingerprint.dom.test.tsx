/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_LISTED, PackFingerprint } from "./PackFingerprint";
import type { SavedFile } from "./downloadFile";
import { fingerprintPlaces } from "./packFingerprint";
import { printToCode } from "./packFingerprintCode";
import { place, varied } from "./placeFixtures";
import type { PackPlaceRecord } from "./packPlaces";
import { lintFrench } from "./typography";

const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
afterEach(cleanup);

const mine = varied(61, 24);
const OPEN = { en: "Check that another device has the same saved places", fr: "Comparer les lieux enregistrés avec un autre appareil" } as const;
const PASTE = { en: "Paste a code from another device", fr: "Collez un code d’un autre appareil" } as const;

function show(over: { places?: PackPlaceRecord[]; locale?: "en" | "fr"; copy?: (t: string) => Promise<boolean>; onSave?: (f: SavedFile) => boolean; open?: boolean } = {}) {
  const locale = over.locale ?? "en";
  document.documentElement.lang = locale;
  const props = { places: over.places ?? mine, locale, today: "2026-11-21", copy: over.copy, onSave: over.onSave };
  const view = render(<PackFingerprint {...props} />);
  if (over.open !== false) fireEvent.click(screen.getByRole("button", { name: OPEN[locale] }));
  return { ...view, props, locale };
}
const paste = (text: string, locale: "en" | "fr" = "en") => fireEvent.change(screen.getByLabelText(PASTE[locale]), { target: { value: text } });
const codeOf = (places: PackPlaceRecord[]) => printToCode(fingerprintPlaces(places));

describe("opening", () => {
  it("is closed by default, with no heading of its own", () => {
    show({ open: false });
    const button = screen.getByRole("button", { name: OPEN.en });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.queryByLabelText(PASTE.en)).toBeNull();
  });
  it("opens and closes with the button, keeping aria-controls pointed at the panel", () => {
    show({ open: false });
    const button = screen.getByRole("button", { name: OPEN.en });
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(button.getAttribute("aria-controls")).toBe(document.getElementById(button.getAttribute("aria-controls")!)!.id);
    expect(screen.getByLabelText(PASTE.en)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hide the match check between devices" }));
    expect(screen.queryByLabelText(PASTE.en)).toBeNull();
  });
  it("adds no heading when open", () => {
    show();
    expect(screen.queryByRole("heading")).toBeNull();
  });
});

describe("this device's code", () => {
  it("shows the code in a read-only box, with the count", () => {
    show();
    const box = screen.getByLabelText("Code for this device") as HTMLTextAreaElement;
    expect(box.readOnly).toBe(true);
    expect(box.value).toBe(codeOf(mine));
    expect(screen.getByText("The code is made from 24 places saved on this device.")).toBeTruthy();
  });
  it("says there is no code when no places are saved, and still lets a code be pasted", () => {
    show({ places: [] });
    expect(screen.getByText("No places are saved on this device, so there is no code to make.")).toBeTruthy();
    expect(screen.queryByLabelText("Code for this device")).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy the code" })).toBeNull();
    expect(screen.getByLabelText(PASTE.en)).toBeTruthy();
  });
  it("copies the code and says so", async () => {
    const copy = vi.fn(async () => true);
    show({ copy });
    fireEvent.click(screen.getByRole("button", { name: "Copy the code" }));
    await waitFor(() => expect(copy).toHaveBeenCalledWith(codeOf(mine)));
    await waitFor(() => expect(screen.getByText("Code copied.")).toBeTruthy());
  });
  it("says when the browser could not copy", async () => {
    show({ copy: async () => false });
    fireEvent.click(screen.getByRole("button", { name: "Copy the code" }));
    await waitFor(() => expect(screen.getByText(/could not copy\. The code is shown above/)).toBeTruthy());
  });
  it("saves the code as a text file with the right name and content", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    show({ onSave });
    fireEvent.click(screen.getByRole("button", { name: "Save the code as a text file" }));
    const file = onSave.mock.calls[0]![0];
    expect(file.name).toBe("saved-places-fingerprint.txt");
    expect(file.mime).toBe("text/plain;charset=utf-8");
    expect(file.content).toContain(codeOf(mine).split("\n")[0]);
    expect(file.content).toContain("Made on 2026-11-21");
    expect(screen.getByText("Saved saved-places-fingerprint.txt.")).toBeTruthy();
  });
  it("says so when the file cannot be saved, or the save throws", () => {
    const { unmount } = show({ onSave: () => false });
    fireEvent.click(screen.getByRole("button", { name: "Save the code as a text file" }));
    expect(screen.getByText("This browser cannot save a file here.")).toBeTruthy();
    unmount();
    show({ onSave: () => { throw new Error("blocked"); } });
    fireEvent.click(screen.getByRole("button", { name: "Save the code as a text file" }));
    expect(screen.getByText("This browser cannot save a file here.")).toBeTruthy();
  });
  it("shows a different code when the places change", () => {
    const { rerender, props } = show();
    const before = (screen.getByLabelText("Code for this device") as HTMLTextAreaElement).value;
    rerender(<PackFingerprint {...props} places={mine.slice(1)} />);
    expect((screen.getByLabelText("Code for this device") as HTMLTextAreaElement).value).not.toBe(before);
  });
});

describe("comparing with a pasted code", () => {
  it("says nothing until something is pasted", () => {
    show();
    expect(document.querySelector("[data-fingerprint-result]")).toBeNull();
    expect(document.querySelector("[data-fingerprint-problem]")).toBeNull();
  });
  it("says the places are the same, with no table", () => {
    show();
    paste(codeOf([...mine].reverse()));
    const result = document.querySelector("[data-fingerprint-result]")!;
    expect(result.getAttribute("data-kind")).toBe("same");
    expect(within(result as HTMLElement).getByText("Both devices hold the same saved places with the same details, as read.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });
  it("says the places are the same but a detail differs, and shows the one group", () => {
    show();
    const target = mine[5]!;
    paste(codeOf(mine.map((p) => (p.id === target.id ? place(p.id, { name: "Changed elsewhere" }) : p))));
    const result = document.querySelector("[data-fingerprint-result]")!;
    expect(result.getAttribute("data-kind")).toBe("same-ids-different-details");
    expect(screen.getByText("Both devices hold the same places, but some details differ.")).toBeTruthy();
    expect(screen.getByRole("table", { name: "Groups of places, by id" })).toBeTruthy();
    expect(screen.getAllByRole("row")).toHaveLength(17);
    expect(document.querySelectorAll("[data-differs='true']")).toHaveLength(1);
    expect(screen.getByText(/^1 of 16 groups differ: [0-9a-f]\.$/)).toBeTruthy();
  });
  it("names this device's places in the groups that differ, as UNKNOWN when there is no name", () => {
    const here = [place("known-1", { name: "Café Un" }), place("known-2", { name: null }), ...varied(62, 10)];
    show({ places: here });
    paste(codeOf(here.slice(2)));
    expect(screen.getByText(/^Places on this device in the groups that differ \(/)).toBeTruthy();
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((t) => t !== "")).toBe(true);
    expect(items.some((t) => t === "Café Un") || items.some((t) => t === "UNKNOWN")).toBe(true);
  });
  it("says the places differ, and gives both counts", () => {
    show();
    paste(codeOf([...mine, place("only-there", {})]));
    expect(screen.getByText("The two devices hold different saved places.")).toBeTruthy();
    expect(screen.getByText("This device: 24 places. The other device: 25 places.")).toBeTruthy();
  });
  it("says both are empty", () => {
    show({ places: [] });
    paste(codeOf([]));
    expect(screen.getByText("Neither device has saved places, so there is nothing to compare.")).toBeTruthy();
  });
  it("caps the list of places and says how many there are", () => {
    const many = varied(63, 400);
    show({ places: many });
    paste(codeOf([]));
    const items = within(document.querySelector("[data-fingerprint-result]") as HTMLElement).getAllByRole("listitem");
    expect(items).toHaveLength(MAX_LISTED);
    expect(screen.getByText(new RegExp(`first ${MAX_LISTED} of \\d+`))).toBeTruthy();
  });
  it("refuses a typo without comparing", () => {
    show();
    const c = codeOf(mine);
    paste(c.replace(/ids=[0-9a-f]/, (m) => (m.endsWith("0") ? "ids=1" : "ids=0")));
    expect(screen.getByText("The code has a typo or was changed after it was made, so it is not compared. Copy it again.")).toBeTruthy();
    expect(document.querySelector("[data-fingerprint-result]")).toBeNull();
  });
  it("explains each kind of refusal", () => {
    show();
    paste("not a code at all");
    expect(screen.getByText("That is not a code from this App. A code starts with PACKFP.")).toBeTruthy();
    paste(codeOf(mine).split("\n").slice(0, 3).join("\n"));
    expect(screen.getByText("The code is cut short. Copy all of it, including the last line.")).toBeTruthy();
    paste(codeOf(mine).replace("v1", "v9"));
    expect(screen.getByText(/different version of the App/)).toBeTruthy();
    paste(`${codeOf(mine)} extra=1`);
    expect(screen.getByText("Part of the code cannot be read (extra). Copy it again.")).toBeTruthy();
  });
  it("clears the result when the box is emptied", () => {
    show();
    paste(codeOf(mine));
    expect(document.querySelector("[data-fingerprint-result]")).not.toBeNull();
    paste("");
    expect(document.querySelector("[data-fingerprint-result]")).toBeNull();
    expect(document.querySelector("[data-fingerprint-problem]")).toBeNull();
  });
  it("saves the comparison, without any place name in it", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    show({ places: [place("n1", { name: "Hidden Café" }), ...mine], onSave });
    paste(codeOf(mine));
    fireEvent.click(screen.getByRole("button", { name: "Save the comparison as a text file" }));
    const file = onSave.mock.calls[0]![0];
    expect(file.name).toBe("saved-places-comparison.txt");
    expect(file.content).toContain("different saved places");
    expect(file.content).not.toContain("Hidden");
  });
  it("always says what a match does not mean", () => {
    show();
    expect(screen.getByText(/does not say they are correct or up to date/)).toBeTruthy();
    paste(codeOf(mine));
    expect(screen.getAllByText(/does not say they are correct or up to date/)).toHaveLength(1);
  });
  it("announces the verdict and the problems as status messages", () => {
    show();
    paste(codeOf(mine));
    expect(screen.getByRole("status").textContent).toContain("same saved places");
    paste("zzz");
    expect(screen.getByRole("status").textContent).toContain("not a code");
  });
});

describe("two devices, end to end", () => {
  it("one device's copied code is read by another holding the same pack", async () => {
    let copied = "";
    const first = show({ copy: async (t) => ((copied = t), true) });
    fireEvent.click(screen.getByRole("button", { name: "Copy the code" }));
    await waitFor(() => expect(copied).not.toBe(""));
    first.unmount();
    show({ places: [...mine].reverse() });
    paste(copied);
    expect(document.querySelector("[data-fingerprint-result]")!.getAttribute("data-kind")).toBe("same");
  });
  it("a device with one place edited is told that details differ", async () => {
    let copied = "";
    const first = show({ copy: async (t) => ((copied = t), true) });
    fireEvent.click(screen.getByRole("button", { name: "Copy the code" }));
    await waitFor(() => expect(copied).not.toBe(""));
    first.unmount();
    show({ places: mine.map((p, i) => (i === 3 ? place(p.id, { wheelchair: p.tag === "yes" ? "no" : "yes" }) : p)) });
    paste(copied);
    expect(document.querySelector("[data-fingerprint-result]")!.getAttribute("data-kind")).toBe("same-ids-different-details");
  });
});

describe("in French", () => {
  it("uses French words and keeps French punctuation", () => {
    show({ locale: "fr", places: mine.slice(0, 3) });
    expect(screen.getByLabelText("Code de cet appareil")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copier le code" })).toBeTruthy();
    paste(codeOf(mine.slice(1)), "fr");
    expect(screen.getByText("Les deux appareils contiennent des lieux enregistrés différents.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enregistrer la comparaison dans un fichier texte" })).toBeTruthy();
    // The words the tool wrote, not the place names it lists (those are the pack's own text).
    for (const el of document.querySelectorAll("p, button, label, caption, th")) expect(lintFrench(el.textContent ?? ""), el.textContent ?? "").toEqual([]);
    expect(document.querySelector("[data-pack-fingerprint]")!.getAttribute("lang")).toBe("fr");
  });
});

describe("accessibility", () => {
  for (const locale of ["en", "fr"] as const) {
    it(`has no axe violations when open, with a result and a table (${locale})`, async () => {
      const { container } = show({ locale });
      paste(codeOf(mine.map((p, i) => (i === 0 ? place(p.id, { name: "other" }) : p))), locale);
      expect((await axe.run(container, axeRules)).violations).toEqual([]);
    });
    it(`has no axe violations for a refused code (${locale})`, async () => {
      const { container } = show({ locale });
      paste("garbage", locale);
      expect((await axe.run(container, axeRules)).violations).toEqual([]);
    });
  }
  it("has no axe violations when closed or with no places", async () => {
    const closed = show({ open: false });
    expect((await axe.run(closed.container, axeRules)).violations).toEqual([]);
    closed.unmount();
    const empty = show({ places: [] });
    expect((await axe.run(empty.container, axeRules)).violations).toEqual([]);
  });
  it("labels every box and button", () => {
    show();
    paste(codeOf([]));
    for (const box of screen.getAllByRole("textbox")) expect(box.getAttribute("id") && document.querySelector(`label[for="${box.id}"]`)).toBeTruthy();
    for (const b of screen.getAllByRole("button")) expect((b.textContent ?? "").trim()).not.toBe("");
  });
  it("makes every table header a column or row header", () => {
    show();
    paste(codeOf([place("only", {})]));
    const heads = [...document.querySelectorAll("th")];
    expect(heads.length).toBeGreaterThan(4);
    expect(heads.every((h) => h.getAttribute("scope") === "col" || h.getAttribute("scope") === "row")).toBe(true);
  });
});
