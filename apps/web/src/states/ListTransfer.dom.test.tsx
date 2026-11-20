/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ListTransfer } from "./ListTransfer";
import { place } from "./placeFixtures";
import { MAX_SHORTLIST, type AddResult, type ShortlistEntry } from "./shortlist";
import { lintFrench } from "./typography";

const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
afterEach(cleanup);
const places = ["a", "b", "c"].map((id) => place(id, { name: `Place ${id}` }));
const entry = (id: string): ShortlistEntry => ({ id, addedOn: "2026-11-19" });
type Add = (id: string) => AddResult;

function show(over: { list?: ShortlistEntry[]; locale?: "en" | "fr"; add?: Add; copy?: (t: string) => Promise<boolean>; places?: typeof places } = {}) {
  const locale = over.locale ?? "en";
  document.documentElement.lang = locale;
  const props = { list: over.list ?? [], places: over.places ?? places, locale, add: over.add ?? vi.fn<Add>(() => "added"), copy: over.copy };
  const view = render(<ListTransfer {...props} />);
  fireEvent.click(screen.getByRole("button", { name: locale === "en" ? "Move your list to another device" : "Transférer votre liste vers un autre appareil" }));
  return { ...view, props };
}
const paste = (text: string, label = "Paste a list code here") => fireEvent.change(screen.getByLabelText(label), { target: { value: text } });

describe("opening", () => {
  it("starts closed with nothing inside", () => {
    render(<ListTransfer list={[]} places={places} locale="en" add={() => "added"} />);
    expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByLabelText("Paste a list code here")).toBeNull();
  });
  it("opens and closes", () => {
    show();
    expect(screen.getByRole("button", { name: "Hide moving your list" }).getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Hide moving your list" }));
    expect(screen.queryByLabelText("Paste a list code here")).toBeNull();
  });
  it("says the code holds nothing about the person", () => {
    show();
    expect(screen.getByText(/holds nothing about you/)).toBeTruthy();
  });
});

describe("copying", () => {
  it("says there is no code to copy for an empty list", () => {
    show();
    expect(screen.queryByRole("button", { name: /Copy a code/ })).toBeNull();
    expect(screen.getByText("Your list is empty, so there is no code to copy.")).toBeTruthy();
  });
  it("copies a code for the listed places, in the list's order", async () => {
    const copy = vi.fn<(t: string) => Promise<boolean>>(async () => true);
    show({ list: [entry("b"), entry("a")], copy });
    fireEvent.click(screen.getByRole("button", { name: "Copy a code for your 2 places" }));
    await screen.findByText("List code copied.");
    expect(copy).toHaveBeenCalledWith("LIST v1\n- b | Place b\n- a | Place a\n");
  });
  it("uses the singular for one place", () => {
    show({ list: [entry("a")] });
    expect(screen.getByRole("button", { name: "Copy a code for your 1 place" })).toBeTruthy();
  });
  it("leaves out a listed id the pack does not hold", async () => {
    const copy = vi.fn<(t: string) => Promise<boolean>>(async () => true);
    show({ list: [entry("a"), entry("gone")], copy });
    fireEvent.click(screen.getByRole("button", { name: /Copy a code/ }));
    await screen.findByText("List code copied.");
    expect(copy.mock.calls[0]![0]).toBe("LIST v1\n- a | Place a\n");
  });
  it("shows the code to select when copying is not possible", async () => {
    show({ list: [entry("a")], copy: async () => false });
    fireEvent.click(screen.getByRole("button", { name: /Copy a code/ }));
    await screen.findByText(/could not copy/);
    expect((screen.getByLabelText("List code") as HTMLTextAreaElement).value).toBe("LIST v1\n- a | Place a\n");
  });
});

describe("pasting", () => {
  it("shows nothing until something is pasted", () => {
    show();
    expect(document.querySelector("[data-list-transfer-plan]")).toBeNull();
  });
  it("lists the places that would be added, by name, and the count", () => {
    show();
    paste("LIST v1\n- a | x\n- b | y\n");
    const plan = within(document.querySelector("[data-list-transfer-plan]") as HTMLElement);
    expect(plan.getByText("2 places would be added.")).toBeTruthy();
    expect(plan.getAllByRole("listitem").map((l) => l.textContent)).toEqual(["Place a", "Place b"]);
  });
  it("names the pack's name, not the pasted one", () => {
    show();
    paste("- a | Totally different name");
    expect(screen.getByRole("listitem").textContent).toBe("Place a");
  });
  it("says what is already listed, not in the pack, and over the limit", () => {
    show({ list: [entry("a")] });
    paste("- a | A\n- zz | Z\n- b | B");
    expect(screen.getByText(/1 place would be added\. 1 is already on your list\. 1 is not in the pack on this device\./)).toBeTruthy();
  });
  it("says so when no place is found, and disables the add button", () => {
    show();
    paste("hello");
    expect(screen.getByText(/No places found in this text/)).toBeTruthy();
    const b = screen.getByRole("button", { name: "Add 0 to your list" });
    expect(b.hasAttribute("disabled") || b.hasAttribute("data-disabled") || b.getAttribute("aria-disabled") === "true").toBe(true);
  });
  it("adds nothing until the button is pressed", () => {
    const add = vi.fn<Add>(() => "added");
    show({ add });
    paste("- a | A");
    expect(add).not.toHaveBeenCalled();
  });
});

describe("adding", () => {
  it("adds each place the plan names, in order, and says how many", () => {
    const add = vi.fn<Add>(() => "added");
    show({ add });
    paste("- c | C\n- a | A\n- zz | Z");
    fireEvent.click(screen.getByRole("button", { name: "Add 2 to your list" }));
    expect(add.mock.calls.map((c) => c[0])).toEqual(["c", "a"]);
    expect(document.querySelector("[data-list-transfer-status]")?.textContent).toBe("2 places added to your list.");
  });
  it("counts only the places that were really added", () => {
    const add = vi.fn<Add>((id) => (id === "a" ? "added" : "full"));
    show({ add });
    paste("- a | A\n- b | B");
    fireEvent.click(screen.getByRole("button", { name: "Add 2 to your list" }));
    expect(document.querySelector("[data-list-transfer-status]")?.textContent).toBe("1 place added to your list.");
  });
  it("clears the pasted text afterwards", () => {
    show();
    paste("- a | A");
    fireEvent.click(screen.getByRole("button", { name: "Add 1 to your list" }));
    expect((screen.getByLabelText("Paste a list code here") as HTMLTextAreaElement).value).toBe("");
  });
  it("never offers more than the list can hold", () => {
    const many = Array.from({ length: MAX_SHORTLIST + 4 }, (_, i) => place(`p${i}`));
    show({ places: many as unknown as typeof places });
    paste(many.map((p) => `- ${p.id} | n`).join("\n"));
    expect(screen.getByRole("button", { name: `Add ${MAX_SHORTLIST} to your list` })).toBeTruthy();
    expect(screen.getByText(/4 do not fit/)).toBeTruthy();
  });
});

describe("French and accessibility", () => {
  it("is French with typography kept", () => {
    const { container } = show({ locale: "fr", list: [entry("a")] });
    paste("- a | A\n- zz | Z", "Collez un code de liste ici");
    for (const el of container.querySelectorAll("p, label, button, li")) expect(lintFrench(el.textContent ?? ""), el.textContent ?? "").toEqual([]);
    expect(screen.getByRole("button", { name: "Copier un code pour 1 lieu" })).toBeTruthy();
    expect(container.textContent).not.toMatch(/INCONN/i);
  });
  it("has no axe violations closed, open, and with a plan, in either language", async () => {
    for (const locale of ["en", "fr"] as const) {
      document.documentElement.lang = locale;
      const { container, unmount } = render(<ListTransfer list={[entry("a")]} places={places} locale={locale} add={() => "added"} />);
      expect((await axe.run(container, axeRules)).violations).toEqual([]);
      fireEvent.click(screen.getAllByRole("button")[0]!);
      expect((await axe.run(container, axeRules)).violations).toEqual([]);
      fireEvent.change(container.querySelector("textarea")!, { target: { value: "- a | A\n- b | B" } });
      expect((await axe.run(container, axeRules)).violations).toEqual([]);
      unmount();
    }
  });
});
