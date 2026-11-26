/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarksTransfer } from "./MarksTransfer";
import { place } from "./placeFixtures";
import type { KeyValueStore } from "./submissionQueue";
import { useVisitMarks } from "./useVisitMarks";
import { VISIT_MARKS_KEY, parseVisitMarks } from "./visitMarks";

const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
const places = [place("a", { name: "Alpha Hall" }), place("b", { name: "Beta Court" })];
function memory(initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (k) => (k in data ? data[k]! : null), setItem: (k, v) => { data[k] = v; }, removeItem: (k) => { delete data[k]; } };
}
function Harness({ store, copy, locale = "en" }: { store: KeyValueStore; copy?: (t: string) => Promise<boolean>; locale?: "en" | "fr" }) {
  const state = useVisitMarks("2026-11-21", store);
  return <MarksTransfer places={places} state={state} locale={locale} copy={copy} />;
}
const show = (store = memory(), copy?: (t: string) => Promise<boolean>, locale: "en" | "fr" = "en") => render(<Harness store={store} copy={copy} locale={locale} />);
const open = () => fireEvent.click(screen.getByRole("button", { name: /Move your marks|Transférer vos marques/ }));
const paste = (value: string) => fireEvent.change(screen.getByLabelText(/Paste a marks code here|Collez un code de marques/), { target: { value } });
const marksJson = (...items: { id: string; status: string }[]) => JSON.stringify(items.map((i) => ({ ...i, markedOn: "2026-11-01" })));
afterEach(cleanup);

describe("MarksTransfer", () => {
  it("starts closed, controls a region that exists and adds no heading", () => {
    show();
    const btn = screen.getByRole("button", { name: "Move your marks to another device" });
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(document.getElementById(btn.getAttribute("aria-controls")!)).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    open();
    expect(screen.queryAllByRole("heading")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Hide moving your marks" }).getAttribute("aria-expanded")).toBe("true");
  });
  it("says there is no code to copy when no marked place is in the pack", () => {
    show(memory({ [VISIT_MARKS_KEY]: marksJson({ id: "gone", status: "been" }) }));
    open();
    expect(screen.getByText(/no code to copy/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Copy a code/ })).toBeNull();
  });
  it("copies a code for the marks on places in the pack", async () => {
    const copy = vi.fn(async () => true);
    show(memory({ [VISIT_MARKS_KEY]: marksJson({ id: "a", status: "been" }, { id: "gone", status: "been" }) }), copy);
    open();
    fireEvent.click(screen.getByRole("button", { name: "Copy a code for your 1 mark" }));
    await screen.findByText("Marks code copied.");
    expect(copy).toHaveBeenCalledWith("MARKS v1\n- a | been | Alpha Hall\n");
    expect(screen.queryByLabelText("Marks code")).toBeNull();
  });
  it("shows the code to select when the browser cannot copy", async () => {
    show(memory({ [VISIT_MARKS_KEY]: marksJson({ id: "b", status: "ruled-out" }) }), async () => false);
    open();
    fireEvent.click(screen.getByRole("button", { name: /^Copy a code/ }));
    await screen.findByText(/could not copy/);
    expect((screen.getByLabelText("Marks code") as HTMLTextAreaElement).value).toBe("MARKS v1\n- b | ruled-out | Beta Court\n");
  });
  it("shows nothing about a pasted code until there is text, then a plan, and sets nothing yet", () => {
    const store = memory();
    show(store);
    open();
    expect(document.querySelector("[data-marks-transfer-plan]")).toBeNull();
    paste("MARKS v1\n- a | been | Alpha Hall\n- b | to-visit | Beta Court");
    expect(screen.getByText("2 marks would be set.")).toBeTruthy();
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Alpha Hall\u00a0: Been there", "Beta Court\u00a0: To visit"]);
    expect(VISIT_MARKS_KEY in store.data).toBe(false);
  });
  it("sets the planned marks when the button is pressed, and says how many", () => {
    const store = memory();
    show(store);
    open();
    paste("- a | been\n- b | to-visit\n- gone | been");
    fireEvent.click(screen.getByRole("button", { name: "Set 2 marks" }));
    expect(parseVisitMarks(store.data[VISIT_MARKS_KEY]).map((x) => [x.id, x.status])).toEqual([["a", "been"], ["b", "to-visit"]]);
    expect(screen.getByText("2 marks set.")).toBeTruthy();
    expect((screen.getByLabelText("Paste a marks code here") as HTMLTextAreaElement).value).toBe("");
  });
  it("shows what a mark would replace and replaces it", () => {
    const store = memory({ [VISIT_MARKS_KEY]: marksJson({ id: "a", status: "to-visit" }) });
    show(store);
    open();
    paste("- a | ruled-out");
    expect(screen.getByText("1 replaces a mark you already have.", { exact: false })).toBeTruthy();
    expect(screen.getByText("Alpha Hall: Ruled out (was To visit)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Set 1 mark" }));
    expect(parseVisitMarks(store.data[VISIT_MARKS_KEY])[0]?.status).toBe("ruled-out");
  });
  it("disables the button when nothing would be set", () => {
    show(memory({ [VISIT_MARKS_KEY]: marksJson({ id: "a", status: "been" }) }));
    open();
    paste("- a | been");
    expect((screen.getByRole("button", { name: "Set 0 marks" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/already the same/)).toBeTruthy();
  });
  it("says how to write a code when the text has none", () => {
    show();
    open();
    paste("just some words");
    expect(screen.getByText(/No marks found in this text/)).toBeTruthy();
  });
  it("is in French", async () => {
    const { container } = show(memory(), undefined, "fr");
    open();
    paste("- a | been");
    expect(screen.getByText("1 marque serait appliquée.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Appliquer 1 marque" })).toBeTruthy();
    expect((await axe.run(container, axeRules)).violations).toEqual([]);
  });
  it("has no axe violation closed, open, or with a plan", async () => {
    const { container } = show();
    expect((await axe.run(container, axeRules)).violations).toEqual([]);
    open();
    paste("- a | been");
    expect((await axe.run(container, axeRules)).violations).toEqual([]);
  });
  it("round-trips: a code copied from one device sets the same marks on another", async () => {
    let copied = "";
    const from = show(memory({ [VISIT_MARKS_KEY]: marksJson({ id: "a", status: "been" }, { id: "b", status: "ruled-out" }) }), async (t) => { copied = t; return true; });
    open();
    fireEvent.click(screen.getByRole("button", { name: /^Copy a code/ }));
    await screen.findByText("Marks code copied.");
    from.unmount();
    const store = memory();
    show(store);
    open();
    paste(copied);
    fireEvent.click(screen.getByRole("button", { name: "Set 2 marks" }));
    expect(parseVisitMarks(store.data[VISIT_MARKS_KEY]).map((x) => [x.id, x.status])).toEqual([["a", "been"], ["b", "ruled-out"]]);
  });
});
