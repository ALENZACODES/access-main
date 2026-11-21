/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { PackPlaces } from "./PackPlaces";

const prov = { source_name: "OpenStreetMap, Geofabrik Ontario extract", source_url: "https://www.openstreetmap.org/way/1", licence: "ODbL-1.0", retrieved_at: "2026-11-13", tier: 0 };
const rec = (id: string, name: string, wheelchair: string, note: string) => ({ id, name, wheelchair, category: "cafe", address: "1 Main Street", wheelchair_description: note, lat: 43.65, lon: -79.38, provenance: prov });
const data = [rec("a", "Alpha Cafe", "yes", "Two steps at the front door"), rec("b", "Beta Bar", "no", "Elevator out of service"), rec("c", "Gamma Grill", "yes", "Washrooms upstairs")];

afterEach(cleanup);
const show = () => render(<MemoryRouter><PackPlaces places={data} locale="en" today="2026-11-15" /></MemoryRouter>);
const open = () => fireEvent.click(screen.getByRole("button", { name: "Show tags and notes" }));
const readNames = () => within(screen.getByRole("list", { name: "Places to read" })).getAllByRole("listitem").map((li) => li.querySelector("strong")!.textContent);

describe("tags and notes in the pack places page", () => {
  it("is on the page, closed, next to the other note tools", () => {
    show();
    expect(document.querySelector("[data-tag-notes]")).not.toBeNull();
    expect(document.querySelector("[data-note-topics]")).not.toBeNull();
    expect(document.querySelector("[data-tag-notes-body]")).toBeNull();
  });
  it("lists the places whose tag and note read in different directions", () => {
    show();
    open();
    expect(readNames()).toEqual(["Alpha Cafe", "Beta Bar"]);
  });
  it("follows the search: only the places shown are looked at", () => {
    show();
    open();
    fireEvent.change(screen.getByLabelText("Search by name, address or kind"), { target: { value: "beta" } });
    expect(readNames()).toEqual(["Beta Bar"]);
    expect(document.querySelector("[data-tag-notes-count]")!.textContent).toBe("1 of 1 note is on the list.");
    fireEvent.change(screen.getByLabelText("Search by name, address or kind"), { target: { value: "gamma" } });
    expect(document.querySelector("[data-tag-notes-count]")!.textContent).toContain("The note is not read");
  });
});
