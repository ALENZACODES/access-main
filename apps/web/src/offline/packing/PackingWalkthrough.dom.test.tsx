/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PackingWalkthrough } from "./PackingWalkthrough";
import { addBag, addItem, createPackingList, moveItem, removeBag, removeItem, renameBag, updateItem, type PackingList } from "./model";

afterEach(cleanup);

function example() {
  let list = addBag(createPackingList("Day out"), "front", "Front pocket");
  list = addBag(list, "rear", "Rear pocket");
  list = addItem(list, "front", { id: "key", name: "Spare key", quantity: 1, packed: 1, returned: 1, note: "" });
  list = addItem(list, "front", { id: "clip", name: "Clips", quantity: 4, packed: null, returned: null, note: "" });
  return addItem(list, "rear", { id: "tag", name: "Luggage tags", quantity: 3, packed: 2, returned: 1, note: "" });
}

function setup(initial = example(), language: "en" | "fr" = "en") {
  let list = initial;
  const change = vi.fn((next: PackingList) => {
    list = next;
    view.rerender(<PackingWalkthrough list={list} language={language} onChange={change} />);
  });
  const view = render(<PackingWalkthrough list={list} language={language} onChange={change} />);
  return {
    change,
    list: () => list,
    replace(next: PackingList) {
      list = next;
      view.rerender(<PackingWalkthrough list={next} language={language} onChange={change} />);
    },
  };
}

const button = (name: string) => screen.getByRole("button", { name });
const press = (name: string) => fireEvent.click(button(name));
const input = () => screen.getByRole("spinbutton") as HTMLInputElement;
const enter = (value: string) => fireEvent.change(input(), { target: { value } });
const heading = (name: string) => screen.getByRole("heading", { name });
const valueOf = (term: string) => screen.getByText(term, { selector: "dt", exact: true }).nextElementSibling?.textContent;

describe("one-item packing and return checks", () => {
  it("walks through unfinished items in bag order and records a partial and a full quantity", () => {
    const state = setup();
    press("Start packing check");
    expect(document.activeElement).toBe(heading("Clips"));
    expect(valueOf("Bag")).toBe("Front pocket");
    expect(valueOf("Packed")).toBe("UNKNOWN");
    expect(input().value).toBe("");
    enter("2");
    press("Record and continue");
    expect(document.activeElement).toBe(heading("Luggage tags"));
    expect(valueOf("Bag")).toBe("Rear pocket");
    expect(input().value).toBe("2");
    expect(valueOf("Items left in this pass")).toBe("1");
    press("Record all 3 and continue");
    expect(document.activeElement).toBe(heading("End of check"));
    expect(valueOf("Counts recorded")).toBe("2");
    expect(valueOf("Items skipped")).toBe("0");
    expect(state.list().bags[0]?.items[1]).toMatchObject({ packed: 2, returned: null });
    expect(state.list().bags[1]?.items[0]).toMatchObject({ packed: 3, returned: 1 });
  });

  it("distinguishes skipping an uncounted item from explicitly recording no units", () => {
    const state = setup();
    press("Start packing check");
    press("Skip this item");
    expect(valueOf("Items skipped")).toBe("1");
    press("End check");
    expect(state.change).not.toHaveBeenCalled();
    expect(state.list().bags[0]?.items[1]?.packed).toBeNull();
    press("Start packing check");
    enter("0");
    press("Record and continue");
    expect(state.list().bags[0]?.items[1]?.packed).toBe(0);
    expect(valueOf("Counts recorded")).toBe("1");
  });

  it("requires an outbound count before recording a return and uses that count as the upper bound", () => {
    const state = setup();
    press("Start return check");
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.getByText("Record a packed quantity before counting returns for this item.")).toBeTruthy();
    press("Skip this item");
    expect(input().max).toBe("2");
    enter("3");
    press("Record and continue");
    expect(document.activeElement).toBe(input());
    expect(input().getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("status").id).toBe(input().getAttribute("aria-describedby"));
    expect(state.change).not.toHaveBeenCalled();
    press("Record all 2 and continue");
    expect(state.list().bags[1]?.items[0]).toMatchObject({ quantity: 3, packed: 2, returned: 2 });
    press("Back to checks");
    expect(document.activeElement).toBe(button("Start return check"));
  });

  it.each(["", "-1", "0.5", "5"])("rejects a blank, fractional or out-of-range packing entry (%j)", (draft) => {
    const state = setup();
    press("Start packing check");
    enter(draft);
    press("Record and continue");
    expect(heading("Clips")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("from 0 to 4");
    expect(state.change).not.toHaveBeenCalled();
    enter("1");
    expect(screen.queryByRole("status")).toBeNull();
    press("Record and continue");
    expect(state.change).toHaveBeenCalledTimes(1);
  });

  it("cannot reduce an outbound count below units already returned", () => {
    const state = setup();
    press("Start packing check");
    press("Skip this item");
    expect(input().min).toBe("1");
    enter("0");
    press("Record and continue");
    expect(valueOf("Packed")).toBe("2");
    expect(screen.getByRole("status").textContent).toContain("from 1 to 3");
    enter("1");
    press("Record and continue");
    expect(state.list().bags[1]?.items[0]).toMatchObject({ packed: 1, returned: 1 });
  });

  it("can close the return check for an item with an explicit outbound zero", () => {
    const list = updateItem(example(), "clip", { packed: 0 });
    const state = setup(list);
    press("Start return check");
    expect(valueOf("Returned")).toBe("UNKNOWN");
    press("Record all 0 and continue");
    expect(state.list().bags[0]?.items[1]?.returned).toBe(0);
    expect(valueOf("Counts recorded")).toBe("1");
  });

  it("keeps the current item and unsubmitted count through pause and resume", () => {
    const state = setup();
    press("Start packing check");
    enter("2");
    press("Pause check");
    expect(document.activeElement).toBe(heading("Check paused"));
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(valueOf("Items left in this pass")).toBe("2");
    press("Resume check");
    expect(document.activeElement).toBe(heading("Clips"));
    expect(input().value).toBe("2");
    expect(state.change).not.toHaveBeenCalled();
    press("End check");
    expect(document.activeElement).toBe(button("Start packing check"));
    press("Start packing check");
    expect(input().value).toBe("");
  });

  it("distinguishes same-named bags and items when walking the list", () => {
    let list = renameBag(example(), "rear", "Front pocket");
    list = updateItem(list, "key", { name: "Clips" });
    setup(list);
    press("Start packing check");
    expect(heading("Clips (2/2)")).toBeTruthy();
    expect(valueOf("Bag")).toBe("Front pocket (1/2)");
    press("Skip this item");
    expect(valueOf("Bag")).toBe("Front pocket (2/2)");
  });

  it("includes completed items when the user asks to recount all bags", () => {
    setup();
    fireEvent.click(screen.getByRole("checkbox"));
    press("Start return check");
    expect(heading("Spare key")).toBeTruthy();
    expect(valueOf("Items left in this pass")).toBe("3");
    expect(input().value).toBe("1");
    press("Skip this item");
    expect(heading("Clips")).toBeTruthy();
  });

  it("handles an empty bag and a whole list with nothing outstanding", () => {
    const empty = addBag(createPackingList("Outing"), "bag", "Pouch");
    const state = setup(empty);
    expect((button("Start packing check") as HTMLButtonElement).disabled).toBe(true);
    expect((button("Start return check") as HTMLButtonElement).disabled).toBe(true);
    const complete = addItem(empty, "bag", { id: "key", name: "Key", quantity: 1, packed: 1, returned: 1, note: "" });
    state.replace(complete);
    press("Start return check");
    expect(heading("End of check")).toBeTruthy();
    expect(valueOf("Items left in this pass")).toBe("0");
    expect(valueOf("Counts recorded")).toBe("0");
    expect(state.change).not.toHaveBeenCalled();
  });

  it("tracks a moved item and omits removed items when the user edits bags during a pass", () => {
    const state = setup();
    press("Start packing check");
    state.replace(moveItem(state.list(), "clip", "rear"));
    expect(valueOf("Bag")).toBe("Rear pocket");
    state.replace(removeBag(state.list(), "rear"));
    expect(heading("End of check")).toBeTruthy();
    expect(valueOf("Items skipped")).toBe("0");
    expect(state.change).not.toHaveBeenCalled();
  });

  it("does not count a new item that reuses a removed item’s ID during the pass", () => {
    const state = setup();
    press("Start packing check");
    state.replace(removeItem(state.list(), "tag"));
    state.replace(addItem(state.list(), "rear", {
      id: "tag", name: "Keys", quantity: 1, packed: null, returned: null, note: "",
    }));
    expect(valueOf("Items left in this pass")).toBe("1");
    press("Skip this item");
    expect(heading("End of check")).toBeTruthy();
    expect(state.list().bags[1]?.items[0]?.packed).toBeNull();
  });

  it("drops stale draft bounds after an item edit while preserving the rest of the pass", () => {
    const state = setup();
    press("Start packing check");
    enter("4");
    state.replace(updateItem(state.list(), "clip", { quantity: 2, packed: 1 }));
    expect(input().value).toBe("1");
    expect(input().max).toBe("2");
    press("Record all 2 and continue");
    expect(heading("Luggage tags")).toBeTruthy();
    expect(state.list().bags[0]?.items[1]?.packed).toBe(2);
  });

  it("offers the complete return path in French and keeps UNKNOWN literal", () => {
    setup(example(), "fr");
    press("Commencer le décompte au retour");
    expect(valueOf("Quantité rapportée")).toBe("UNKNOWN");
    press("Passer cet article");
    enter("1");
    press("Enregistrer et continuer");
    expect(heading("Fin du décompte")).toBeTruthy();
    expect(valueOf("Quantités enregistrées")).toBe("1");
    expect(valueOf("Articles passés")).toBe("1");
    press("Revenir aux décomptes");
    expect(document.activeElement).toBe(button("Commencer le décompte au retour"));
  });
});
