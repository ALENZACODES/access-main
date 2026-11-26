/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import { PackPlaces } from "./PackPlaces.tsx";
import type { Locale } from "./stateCopy.ts";

// Renders the shipped pack with every place tool, often with an axe scan: slow on CI runners.
vi.setConfig({ testTimeout: 20_000 });

const realPlaces = (JSON.parse(contentText) as { places: unknown[] }).places;
const prov = { source_name: "OpenStreetMap, Geofabrik Ontario extract", source_url: "https://www.openstreetmap.org/way/1", licence: "ODbL-1.0", retrieved_at: "2026-11-13", tier: 0 };
const rec = (id: string, name: string, lat: number, lon: number) => ({
  id, name, wheelchair: "yes", category: "attraction", address: "1 Main Street", wheelchair_description: "UNKNOWN", lat, lon, provenance: prov,
});
const small = [rec("a", "Alpha Hall", 43.656, -79.38), rec("b", "Beta Court", 43.7, -79.4), rec("c", "Gamma Gate", 43.66, -79.39)];
const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };

function show(places: unknown, locale: Locale = "en") {
  document.documentElement.lang = locale;
  return render(
    <MemoryRouter>
      <PackPlaces places={places} locale={locale} today="2026-11-15" />
    </MemoryRouter>,
  );
}
const titles = () => screen.queryAllByRole("heading", { level: 3 }).map((h) => h.textContent);
const paste = (v: string, locale: Locale = "en") =>
  fireEvent.change(screen.getByLabelText(locale === "fr" ? "Coller un point (facultatif)" : "Paste a point (optional)"), { target: { value: v } });
const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

afterEach(cleanup);

describe("paste a point inside the places list", () => {
  it("sits in the near-me group, before the latitude and longitude fields", () => {
    show(small);
    const group = screen.getByRole("group", { name: "Sort by distance from a point" });
    const boxes = within(group).getAllByRole("textbox");
    expect(boxes).toHaveLength(3);
    expect(boxes.slice(1)).toEqual([input("Latitude"), input("Longitude")]);
    expect(within(group).getAllByRole("textbox")[0]).toBe(screen.getByLabelText("Paste a point (optional)"));
  });
  it("changes nothing until the point is used", () => {
    show(small);
    paste("43.7, -79.4");
    expect(input("Latitude").value).toBe("");
    expect(titles()).toEqual(["Alpha Hall", "Beta Court", "Gamma Gate"]);
  });
  it("fills latitude and longitude and sorts by distance when used", () => {
    show(small);
    paste("43.7 N, 79.4 W");
    fireEvent.click(screen.getByRole("button", { name: "Use this point" }));
    expect(input("Latitude").value).toBe("43.70000");
    expect(input("Longitude").value).toBe("-79.40000");
    expect(titles()).toEqual(["Beta Court", "Gamma Gate", "Alpha Hall"]);
    expect(screen.getAllByText(/ away$/)).toHaveLength(3);
  });
  it("replaces a point typed by hand", () => {
    show(small);
    fireEvent.change(input("Latitude"), { target: { value: "43.656" } });
    fireEvent.change(input("Longitude"), { target: { value: "-79.38" } });
    expect(titles()[0]).toBe("Alpha Hall");
    paste("geo:43.7,-79.4");
    fireEvent.click(screen.getByRole("button", { name: "Use this point" }));
    expect(titles()[0]).toBe("Beta Court");
  });
  it("lets the typed fields still be edited after a paste", () => {
    show(small);
    paste("43.7, -79.4");
    fireEvent.click(screen.getByRole("button", { name: "Use this point" }));
    fireEvent.change(input("Latitude"), { target: { value: "43.656" } });
    fireEvent.change(input("Longitude"), { target: { value: "-79.38" } });
    expect(titles()[0]).toBe("Alpha Hall");
  });
  it("shows the typed point in the other forms, and updates as it is typed", () => {
    show(small);
    expect(document.querySelector("[data-point-forms]")).toBeNull();
    fireEvent.change(input("Latitude"), { target: { value: "43.65" } });
    fireEvent.change(input("Longitude"), { target: { value: "-79.38" } });
    expect(document.querySelector("[data-point-forms]")?.textContent).toContain("43° 39′ 0.00″ N, 79° 22′ 48.00″ W");
    fireEvent.change(input("Longitude"), { target: { value: "x" } });
    expect(document.querySelector("[data-point-forms]")).toBeNull();
  });
  it("keeps a pasted but unused point out of the other forms", () => {
    show(small);
    paste("43.7, -79.4");
    expect(document.querySelector("[data-point-forms]")).toBeNull();
  });
  it("does not disturb the page's own status line or its headings", () => {
    show(small);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toBe("3 places shown.");
    paste("43.7, -79.4");
    fireEvent.click(screen.getByRole("button", { name: "Use this point" }));
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(titles()).toHaveLength(3);
  });
  it("leaves the page's own latitude error for a typed bad value", () => {
    show(small);
    fireEvent.change(input("Latitude"), { target: { value: "200" } });
    expect(screen.getByText("Enter a latitude from -90 to 90 and a longitude from -180 to 180.")).toBeTruthy();
  });
  it("shows a paste problem without touching the near-me fields or the list", () => {
    show(small);
    paste("nonsense");
    expect(input("Latitude").value).toBe("");
    expect(titles()).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "Use this point" })).toBeNull();
  });
});

describe("paste a point in French", () => {
  it("labels and fills in French", () => {
    show(small, "fr");
    paste("43,7 N ; 79,4 O", "fr");
    fireEvent.click(screen.getByRole("button", { name: "Utiliser ce point" }));
    expect(input("Latitude").value).toBe("43.70000");
    expect(input("Longitude").value).toBe("-79.40000");
  });
});

describe("paste a point with the shipped Toronto pack", () => {
  it("sorts the real places and names the nearest to the pasted point", () => {
    show(realPlaces);
    paste("https://example.org/map?mlat=43.6532&mlon=-79.3832");
    fireEvent.click(screen.getByRole("button", { name: "Use this point" }));
    expect(input("Latitude").value).toBe("43.65320");
    expect(screen.getAllByText(/ away$/).length).toBeGreaterThan(0);
  });
  it("gives the same order as typing the same two numbers", () => {
    const a = show(realPlaces);
    fireEvent.change(input("Latitude"), { target: { value: "43.65320" } });
    fireEvent.change(input("Longitude"), { target: { value: "-79.38320" } });
    const typed = titles();
    a.unmount();
    show(realPlaces);
    paste("43° 39.192′ N, 79° 22.992′ W");
    fireEvent.click(screen.getByRole("button", { name: "Use this point" }));
    expect(titles()).toEqual(typed);
  });
  it("has no axe violations with a pasted point in use", async () => {
    show(realPlaces);
    paste("43.65, -79.38");
    fireEvent.click(screen.getByRole("button", { name: "Use this point" }));
    const r = await axe.run(document.body, axeRules);
    expect(r.violations.map((v) => v.id)).toEqual([]);
  });
  it("has no axe violations with a bad paste showing", async () => {
    show(realPlaces, "fr");
    paste("zzz", "fr");
    const r = await axe.run(document.body, axeRules);
    expect(r.violations.map((v) => v.id)).toEqual([]);
  });
});
