/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import PackingListPanel from "./PackingListPanel";

afterEach(cleanup);

function type(label: string, value: string) {
  fireEvent.change(screen.getByRole("textbox", { name: label }), { target: { value } });
}

function press(name: string, scope?: HTMLElement) {
  fireEvent.click((scope ? within(scope) : screen).getByRole("button", { name }));
}

function select(label: string, value: string) {
  fireEvent.change(screen.getByRole("combobox", { name: label }), { target: { value } });
}

function bag(name: string) {
  type("Bag name", name);
  press("Add bag");
}

function item(name: string, counts?: { quantity: string; packed?: string; returned?: string }, note?: string) {
  press("Add item");
  type("Item name", name);
  if (counts) {
    type("Quantity to bring", counts.quantity);
    if (counts.packed !== undefined) type("Quantity packed", counts.packed);
    if (counts.returned !== undefined) type("Quantity returned", counts.returned);
  }
  if (note) type("Item note", note);
  press("Save item");
}

function group(name: string) {
  return screen.getByRole("group", { name });
}

function quantity(scope: HTMLElement, label: string) {
  return within(scope).getByText(label, { selector: "dt" }).nextElementSibling?.textContent;
}

function currentBag(name: string) {
  const picker = screen.getByRole("combobox", { name: "Current bag" });
  const choice = within(picker).getByRole<HTMLOptionElement>("option", { name });
  fireEvent.change(picker, { target: { value: choice.value } });
}

describe("packing list editor", () => {
  it("requires a bag name and takes the user straight to adding an item", () => {
    render(<PackingListPanel language="en" />);
    expect(screen.getByText("Add your first bag, then list what goes inside.")).toBeTruthy();
    type("Bag name", "  ");
    press("Add bag");
    const field = screen.getByLabelText("Bag name");
    expect(document.activeElement).toBe(field);
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(screen.queryByRole("button", { name: "Add item" })).toBeNull();
    bag("Blue backpack");
    expect(document.activeElement).toBe(within(group("Blue backpack")).getByRole("button", { name: "Add item" }));
    expect(within(group("Blue backpack")).getByText("This bag has no items yet.")).toBeTruthy();
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Bag name" }).value).toBe("");
  });

  it("keeps unrecorded counts distinct from explicit zero and preserves written notes when editing", () => {
    render(<PackingListPanel language="en" />);
    bag("Day bag");
    item("Gloves", { quantity: "3", packed: "0" }, "Inside pocket\nPair clip");
    expect(quantity(group("Gloves"), "Quantity packed")).toBe("0");
    expect(quantity(group("Gloves"), "Quantity returned")).toBe("UNKNOWN");
    press("Edit item", group("Gloves"));
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Item name" }));
    expect(screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Item note" }).value).toBe("Inside pocket\nPair clip");
    type("Quantity packed", "2");
    type("Quantity returned", "0");
    press("Save item");
    expect(quantity(group("Gloves"), "Quantity returned")).toBe("0");
    expect(within(group("Gloves")).getByText("Partly counted")).toBeTruthy();
    select("Checklist view", "return");
    expect(within(group("Gloves")).getByText("None counted")).toBeTruthy();
    press("Edit item", group("Gloves"));
    type("Quantity returned", "");
    press("Save item");
    expect(quantity(group("Gloves"), "Quantity returned")).toBe("UNKNOWN");
  });

  it("keeps drafts through validation and focuses the first count that needs correction", () => {
    render(<PackingListPanel language="en" />);
    bag("Basket");
    press("Add item");
    press("Save item");
    const field = (label: string) => screen.getByRole("textbox", { name: label });
    expect(document.activeElement).toBe(field("Item name"));
    type("Item name", "Cable");
    type("Item note", "For the lamp");
    type("Quantity to bring", "1.5");
    press("Save item");
    expect(document.activeElement).toBe(field("Quantity to bring"));
    type("Quantity to bring", "2");
    type("Quantity packed", "3");
    press("Save item");
    expect(document.activeElement).toBe(field("Quantity packed"));
    type("Quantity packed", "");
    type("Quantity returned", "0");
    press("Save item");
    expect(document.activeElement).toBe(field("Quantity returned"));
    type("Quantity packed", "1");
    type("Quantity returned", "2");
    press("Save item");
    expect(field("Quantity returned").getAttribute("aria-invalid")).toBe("true");
    type("Quantity returned", "1");
    press("Save item");
    expect(within(group("Cable")).getByText("For the lamp")).toBeTruthy();
    expect(quantity(group("Cable"), "Quantity returned")).toBe("1");
  });

  it("totals every bag independently of the filter or selected bag", () => {
    render(<PackingListPanel language="en" />);
    bag("Front");
    item("Batteries", { quantity: "4", packed: "2", returned: "1" });
    bag("Back");
    item("Towel");
    item("Notebook", { quantity: "1", packed: "1", returned: "1" });
    const summary = screen.getByRole("region", { name: "All bags" });
    expect(quantity(summary, "Units to pack")).toBe("6");
    expect(quantity(summary, "Units recorded as packed")).toBe("3");
    expect(quantity(summary, "Units left to pack")).toBe("UNKNOWN");
    expect(quantity(summary, "Entries with no count recorded")).toBe("1");
    select("Show items", "outstanding");
    expect(group("Towel")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Notebook" })).toBeNull();
    select("Checklist view", "return");
    expect(quantity(summary, "Units packed for the outing")).toBe("UNKNOWN");
    expect(quantity(summary, "Units recorded as returned")).toBe("2");
    currentBag("Front");
    expect(quantity(summary, "Item entries")).toBe("3");
    select("Show items", "complete");
    expect(screen.getByText("No items in this bag match the filter.")).toBeTruthy();
  });

  it("saves list and bag names independently and cancels a draft item edit", () => {
    render(<PackingListPanel language="en" />);
    press("Rename list");
    type("List title", "Station outing");
    press("Save name");
    expect(screen.getByRole("heading", { name: "Station outing" })).toBeTruthy();
    bag("Small bag");
    press("Rename bag");
    type("Bag name", "Blue bag");
    press("Save name");
    item("Water bottle", { quantity: "2", packed: "1" });
    press("Edit item", group("Water bottle"));
    type("Item name", "Changed");
    type("Quantity packed", "0");
    press("Cancel");
    expect(quantity(group("Water bottle"), "Quantity packed")).toBe("1");
    expect(document.activeElement).toBe(within(group("Water bottle")).getByRole("button", { name: "Edit item" }));
    expect(screen.getByRole("option", { name: "Blue bag" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Small bag" })).toBeNull();
  });

  it("reorders bags and items at their actual bounds and moves an item with its counts", () => {
    render(<PackingListPanel language="en" />);
    bag("Handlebar bag");
    item("Lamp", { quantity: "2", packed: "1", returned: "0" });
    item("Bell");
    expect(within(group("Lamp")).getByRole<HTMLButtonElement>("button", { name: "Move item earlier" }).disabled).toBe(true);
    press("Move item earlier", group("Bell"));
    const rows = within(group("Handlebar bag")).getAllByRole("heading", { level: 4 }).map(node => node.textContent);
    expect(rows).toEqual(["Bell", "Lamp"]);
    expect(within(group("Lamp")).getByRole<HTMLButtonElement>("button", { name: "Move item later" }).disabled).toBe(true);
    bag("Seat bag");
    press("Move bag earlier");
    const choices = within(screen.getByRole("combobox", { name: "Current bag" })).getAllByRole("option");
    expect(choices.map(node => node.textContent)).toEqual(["Seat bag", "Handlebar bag"]);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Move bag earlier" }).disabled).toBe(true);
    currentBag("Handlebar bag");
    press("Move to another bag", group("Lamp"));
    expect(screen.getByRole("combobox", { name: "Destination bag" })).toBe(document.activeElement);
    press("Move item");
    expect(within(group("Seat bag")).getByRole("group", { name: "Lamp" })).toBeTruthy();
    expect(quantity(group("Lamp"), "Quantity packed")).toBe("1");
    expect(quantity(group("Lamp"), "Quantity returned")).toBe("0");
    currentBag("Handlebar bag");
    expect(screen.queryByRole("group", { name: "Lamp" })).toBeNull();
    expect(group("Bell")).toBeTruthy();
  });

  it("offers to keep an item or a whole bag and returns focus after removal", () => {
    render(<PackingListPanel language="en" />);
    bag("Tote");
    item("Ticket");
    press("Remove item", group("Ticket"));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Keep" }));
    press("Keep");
    expect(document.activeElement).toBe(within(group("Ticket")).getByRole("button", { name: "Remove item" }));
    press("Remove bag");
    expect(screen.getByRole("group", { name: "Remove “Tote” and its 1 item?" })).toBeTruthy();
    press("Keep");
    expect(group("Ticket")).toBeTruthy();
    press("Remove item", group("Ticket"));
    press("Remove item", group("Remove “Ticket” from this bag?"));
    expect(screen.queryByRole("group", { name: "Ticket" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Add item" }));
    press("Remove bag");
    press("Remove bag", group("Remove the empty bag “Tote”?"));
    expect(screen.queryByRole("group", { name: "Tote" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Bag name" }));
  });

  it("leaves a draft bag name intact while an item editor is open", () => {
    render(<PackingListPanel language="en" />);
    bag("Locker bag");
    type("Bag name", "Evening bag");
    press("Add item");
    expect(screen.getByRole("button", { name: "Save backup (JSON)" }).matches(":disabled")).toBe(true);
    type("Item name", "Pouch");
    press("Save item");
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Bag name" }).value).toBe("Evening bag");
    press("Add bag");
    expect(group("Evening bag")).toBeTruthy();
    currentBag("Locker bag");
    expect(group("Pouch")).toBeTruthy();
  });

  it("distinguishes identical names in the bag picker, the item actions and the move destination", () => {
    render(<PackingListPanel language="en" />);
    bag("Pouch");
    item("Battery", { quantity: "2", packed: "1" });
    item("Battery", { quantity: "3", packed: "0" });
    bag("Pouch");
    currentBag("Pouch (1/2)");
    expect(quantity(group("Battery (1/2)"), "Quantity packed")).toBe("1");
    expect(quantity(group("Battery (2/2)"), "Quantity packed")).toBe("0");
    press("Move to another bag", group("Battery (2/2)"));
    const picker = screen.getByRole("combobox", { name: "Destination bag" });
    expect(within(picker).getByRole("option", { name: "Pouch (2/2)" })).toBeTruthy();
    press("Move item");
    expect(quantity(within(group("Pouch (2/2)")).getByRole("group", { name: "Battery" }), "Quantity to bring")).toBe("3");
    currentBag("Pouch (1/2)");
    expect(quantity(group("Battery"), "Quantity to bring")).toBe("2");
  });

  it("returns focus to the bag when saving a count makes the filtered row disappear", () => {
    render(<PackingListPanel language="en" />);
    bag("Return bag");
    item("Scarf");
    select("Show items", "UNKNOWN");
    press("Edit item", group("Scarf"));
    type("Quantity packed", "1");
    press("Save item");
    expect(screen.queryByRole("group", { name: "Scarf" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Return bag" }));
    select("Show items", "complete");
    expect(group("Scarf")).toBeTruthy();
  });

  it("applies a reviewed file, resets the checklist view and discards a paused pass from the previous list", async () => {
    render(<PackingListPanel language="en" />);
    bag("Old bag");
    item("Gloves");
    press("Start packing check");
    press("Pause check");
    select("Checklist view", "return");
    select("Show items", "partial");
    type("Bag name", "Unfinished name");
    const replacement = {
      schema: "offline-packing-list-v1",
      title: "Saturday outing",
      bags: [{
        id: "trip",
        name: "Trip bag",
        items: [{ id: "light", name: "Lamp", quantity: 2, packed: 1, returned: null, note: "" }],
      }],
    };
    const bytes = new TextEncoder().encode(JSON.stringify(replacement));
    const file = { size: bytes.byteLength, arrayBuffer: async () => bytes.buffer };
    fireEvent.change(screen.getByLabelText("Choose a packing backup"), { target: { files: [file] } });
    const apply = await screen.findByRole("button", { name: "Replace current list" });
    expect(group("Old bag")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Check paused" })).toBeTruthy();
    fireEvent.click(apply);
    expect(screen.queryByRole("heading", { name: "Check paused" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Old bag" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Saturday outing" })).toBeTruthy();
    expect(within(group("Trip bag")).getByRole("group", { name: "Lamp" })).toBeTruthy();
    expect(screen.getByRole<HTMLSelectElement>("combobox", { name: "Checklist view" }).value).toBe("packing");
    expect(screen.getByRole<HTMLSelectElement>("combobox", { name: "Show items" }).value).toBe("all");
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Bag name" }).value).toBe("");
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Packing list" }));
  });

  it("renders the French workflow with French punctuation and the literal UNKNOWN", () => {
    render(<PackingListPanel language="fr" />);
    const region = screen.getByRole("region", { name: "Liste de bagages" });
    type("Nom du sac", "Sac de jour");
    press("Ajouter un sac", region);
    press("Ajouter un article", group("Sac de jour"));
    type("Nom de l’article", "Gourde");
    type("Quantité à emporter", "2");
    press("Enregistrer l’article");
    expect(quantity(group("Gourde"), "Quantité emballée")).toBe("UNKNOWN");
    expect(quantity(group("Gourde"), "Quantité rapportée")).toBe("UNKNOWN");
    press("Retirer l’article", group("Gourde"));
    expect(within(group("Gourde")).getByText("Retirer « Gourde » de ce sac ?", {
      normalizer: value => value,
    })).toBeTruthy();
    press("Conserver");
    expect(group("Gourde")).toBeTruthy();
  });
});
