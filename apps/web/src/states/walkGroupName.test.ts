import { describe, expect, it } from "vitest";
import { place } from "./placeFixtures";
import { STREET_SHARE, membersByName, nameGroup } from "./walkGroupName";

const p = (id: string, address: string | null, name: string | null = `Place ${id}`) => place(id, { address, name });
const g = (...members: ReturnType<typeof p>[]) => ({ members });

describe("nameGroup", () => {
  it("names a group by the street most of its places are on", () => {
    expect(nameGroup(g(p("a", "10 Main Street"), p("b", "12 Main St"), p("c", "5 Oak Avenue")))).toEqual({ kind: "street", text: "Main Street", onStreet: 2 });
  });
  it("treats short and long street types as one street", () => {
    expect(nameGroup(g(p("a", "1 King St W"), p("b", "9 King Street West"))).kind).toBe("street");
  });
  it("needs two places on the street", () => {
    expect(nameGroup(g(p("a", "10 Main Street"), p("b", "5 Oak Avenue"), p("c", "7 Elm Road")))).toMatchObject({ kind: "place", text: "Place a" });
  });
  it("needs half of the group on the street", () => {
    const members = [p("a", "1 Main Street"), p("b", "2 Main Street"), p("c", "3 Oak Avenue"), p("d", "4 Elm Road"), p("e", "5 Pine Road")];
    expect(nameGroup(g(...members)).kind).toBe("place");
    expect(STREET_SHARE).toBe(0.5);
  });
  it("takes exactly half", () => {
    expect(nameGroup(g(p("a", "1 Main Street"), p("b", "2 Main Street"), p("c", "3 Oak Avenue"), p("d", "4 Elm Road"))).kind).toBe("street");
  });
  it("breaks a tie by the street that comes first in the group", () => {
    expect(nameGroup(g(p("a", "1 Oak Avenue"), p("b", "2 Main Street"), p("c", "3 Oak Avenue"), p("d", "4 Main Street"))).text).toBe("Oak Avenue");
  });
  it("falls back to the first place with a name", () => {
    expect(nameGroup(g(p("a", null, null), p("b", null, "Second")))).toEqual({ kind: "place", text: "Second", onStreet: 0 });
  });
  it("has no name when nothing is named", () => {
    expect(nameGroup(g(p("a", null, null), p("b", "PO Box 12", null)))).toEqual({ kind: "none", text: null, onStreet: 0 });
  });
  it("does not name a group by a P.O. box or an intersection", () => {
    expect(nameGroup(g(p("a", "PO Box 12"), p("b", "PO Box 12"))).kind).toBe("place");
  });
  it("does not say a neighbourhood or district", () => {
    for (const x of [nameGroup(g(p("a", "1 Main Street"), p("b", "2 Main Street"))), nameGroup(g(p("a", null), p("b", null)))]) expect(x.text ?? "").not.toMatch(/neighbou?rhood|district|quartier/i);
  });
});

describe("membersByName", () => {
  it("sorts by name without regard to case and puts unnamed places last", () => {
    const m = [p("a", null, "beta"), p("b", null, null), p("c", null, "Alpha"), p("d", null, null)];
    expect(membersByName(m).map((x) => x.id)).toEqual(["c", "a", "b", "d"]);
  });
  it("breaks name ties by id and leaves its input alone", () => {
    const m = [p("b", null, "Same"), p("a", null, "Same")];
    const copy = [...m];
    expect(membersByName(m).map((x) => x.id)).toEqual(["a", "b"]);
    expect(m).toEqual(copy);
  });
});
