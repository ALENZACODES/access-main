/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ListTransfer } from "./ListTransfer";
import { place } from "./placeFixtures";
import { SHORTLIST_KEY } from "./shortlist";
import { useShortlist } from "./useShortlist";
import type { KeyValueStore } from "./submissionQueue";

const places = ["a", "b", "c"].map((id) => place(id, { name: `Place ${id}` }));

function memoryStore(initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k]! : null),
    setItem: (k, v) => void (data[k] = v),
    removeItem: (k) => void delete data[k],
  };
}

function Harness({ store }: { store: KeyValueStore }) {
  const shortlist = useShortlist("2026-11-19", store);
  return (
    <>
      <p data-ids>{shortlist.list.map((e) => e.id).join(",")}</p>
      <ListTransfer list={shortlist.list} places={places} locale="en" add={shortlist.add} />
    </>
  );
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("a pasted list and the stored shortlist", () => {
  it("is written to the store as the same entries the place buttons write", () => {
    const store = memoryStore();
    render(<Harness store={store} />);
    fireEvent.click(screen.getByRole("button", { name: "Move your list to another device" }));
    fireEvent.change(screen.getByLabelText("Paste a list code here"), { target: { value: "- b | B\n- a | A" } });
    fireEvent.click(screen.getByRole("button", { name: "Add 2 to your list" }));
    expect(JSON.parse(store.data[SHORTLIST_KEY]!)).toEqual([
      { id: "b", addedOn: "2026-11-19" },
      { id: "a", addedOn: "2026-11-19" },
    ]);
    expect(document.querySelector("[data-ids]")!.textContent).toBe("b,a");
  });
  it("survives a reload: a new render reads the same list from the store", () => {
    const store = memoryStore();
    const first = render(<Harness store={store} />);
    fireEvent.click(screen.getByRole("button", { name: "Move your list to another device" }));
    fireEvent.change(screen.getByLabelText("Paste a list code here"), { target: { value: "- c | C" } });
    fireEvent.click(screen.getByRole("button", { name: "Add 1 to your list" }));
    first.unmount();
    render(<Harness store={store} />);
    expect(document.querySelector("[data-ids]")!.textContent).toBe("c");
  });
  it("does not write a place twice when the same code is pasted again", () => {
    const store = memoryStore();
    render(<Harness store={store} />);
    fireEvent.click(screen.getByRole("button", { name: "Move your list to another device" }));
    for (let i = 0; i < 2; i++) {
      fireEvent.change(screen.getByLabelText("Paste a list code here"), { target: { value: "- a | A" } });
      const add = screen.queryByRole("button", { name: "Add 1 to your list" });
      if (add) fireEvent.click(add);
    }
    expect(JSON.parse(store.data[SHORTLIST_KEY]!)).toHaveLength(1);
  });
  it("still adds in memory when the store refuses writes, and the list says it is not kept", () => {
    const refusing: KeyValueStore = { getItem: () => null, setItem: () => { throw new Error("full"); }, removeItem: () => undefined };
    const { result } = renderHook(() => useShortlist("2026-11-19", refusing));
    act(() => void result.current.add("a"));
    expect(result.current.list.map((e) => e.id)).toEqual(["a"]);
    expect(result.current.kept).toBe(false);
  });
  it("makes a code from a list that was loaded from the store", async () => {
    const store = memoryStore({ [SHORTLIST_KEY]: JSON.stringify([{ id: "c", addedOn: "2026-11-01" }, { id: "a", addedOn: null }]) });
    let copied = "";
    function WithCopy() {
      const s = useShortlist("2026-11-19", store);
      return <ListTransfer list={s.list} places={places} locale="en" add={s.add} copy={async (t) => ((copied = t), true)} />;
    }
    render(<WithCopy />);
    fireEvent.click(screen.getByRole("button", { name: "Move your list to another device" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy a code for your 2 places" }));
    await screen.findByText("List code copied.");
    expect(copied).toBe("LIST v1\n- c | Place c\n- a | Place a\n");
  });
});
