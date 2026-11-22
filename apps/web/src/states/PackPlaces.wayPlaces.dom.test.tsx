/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import { PackPlaces } from "./PackPlaces.tsx";
import { parsePackPlaces } from "./packPlaces.ts";
import type { Locale } from "./stateCopy.ts";
import { buildWay } from "./wayPlaces.ts";

const realPlaces = (JSON.parse(contentText) as { places: unknown[] }).places;
const prov = { source_name: "OpenStreetMap, Geofabrik Ontario extract", source_url: "https://www.openstreetmap.org/way/1", licence: "ODbL-1.0", retrieved_at: "2026-11-13", tier: 0 };
const rec = (id: string, name: string, wheelchair: string, lon: number | null) => ({ id, name, wheelchair, category: "attraction", address: "1 Main Street", ...(lon === null ? {} : { lat: 43.6501, lon }), provenance: prov });
const small = [rec("a", "Alpha Hall", "yes", -79.395), rec("b", "Beta Court", "no", -79.37), rec("c", "Gamma Gate", "UNKNOWN", -79.38), rec("n", "No Point Place", "limited", null)];
const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };

/** Renders the page and waits for the tool, which is loaded on its own after the page. */
async function show(places: unknown, locale: Locale = "en") {
  document.documentElement.lang = locale;
  const view = render(
    <MemoryRouter>
      <PackPlaces places={places} locale={locale} today="2026-11-19" />
    </MemoryRouter>,
  );
  await screen.findByRole("button", { name: locale === "en" ? "Show places along a straight line" : "Afficher les lieux le long d’une ligne droite" });
  return view;
}
const tool = () => screen.getByRole("region", { name: "Places along a straight line" });
const open = () => fireEvent.click(screen.getByRole("button", { name: "Show places along a straight line" }));
const type = (label: string, value: string) => fireEvent.change(within(tool()).getByLabelText(label), { target: { value } });
const line = (a = { lat: "43.65", lon: "-79.4" }, b = { lat: "43.65", lon: "-79.36" }) => {
  type("First point latitude", a.lat);
  type("First point longitude", a.lon);
  type("Second point latitude", b.lat);
  type("Second point longitude", b.lon);
};
const rows = () => within(within(tool()).getByRole("table")).getAllByRole("row").slice(1).map((r) => within(r).getByRole("rowheader").textContent);

afterEach(cleanup);

describe("places along a straight line on the places list", () => {
  it("is closed to begin with and adds no heading to the page", async () => {
    await show(small);
    expect(screen.getByRole("button", { name: "Show places along a straight line" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Alpha Hall", "Beta Court", "Gamma Gate", "No Point Place"]);
  });

  it("lists the places on screen near the line, in order from the first point", async () => {
    await show(small);
    open();
    line();
    expect(rows()).toEqual(["Alpha Hall", "Gamma Gate", "Beta Court"]);
    expect(within(tool()).getByText(/1 with no map point: UNKNOWN\./)).toBeTruthy();
  });

  it("lists only the places that pass the page's search", async () => {
    await show(small);
    open();
    line();
    fireEvent.change(screen.getByLabelText("Search by name, address or kind"), { target: { value: "gate" } });
    expect(rows()).toEqual(["Gamma Gate"]);
  });

  it("goes away when no place on screen has a map point, and keeps the points typed", async () => {
    await show(small);
    open();
    line();
    const box = screen.getByLabelText("Search by name, address or kind");
    fireEvent.change(box, { target: { value: "no point" } });
    expect(screen.queryByRole("region", { name: "Places along a straight line" })).toBeNull();
    fireEvent.change(box, { target: { value: "" } });
    expect((within(tool()).getByLabelText("First point latitude") as HTMLInputElement).value).toBe("43.65");
    expect(rows()).toHaveLength(3);
  });

  it("offers the near-me point as the first point once one is typed", async () => {
    await show(small);
    open();
    expect(within(tool()).queryByRole("button", { name: "Use the point typed above" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "43.65" } });
    fireEvent.change(screen.getByLabelText("Longitude"), { target: { value: "-79.4" } });
    fireEvent.click(within(tool()).getByRole("button", { name: "Use the point typed above" }));
    expect((within(tool()).getByLabelText("First point latitude") as HTMLInputElement).value).toBe("43.65000");
  });

  it("is in French on the French page", async () => {
    await show(small, "fr");
    fireEvent.click(screen.getByRole("button", { name: "Afficher les lieux le long d’une ligne droite" }));
    expect(screen.getByRole("heading", { name: "Lieux le long d’une ligne droite" })).toBeTruthy();
  });
});

describe("places along a straight line on the shipped pack", () => {
  const parsed = parsePackPlaces(realPlaces);
  const a = { lat: 43.65, lon: -79.38 };
  const b = { lat: 43.662, lon: -79.38 };

  it("accounts for every place of the pack: in the band, outside it, or with no map point", () => {
    const r = buildWay(parsed.places, a, b, 250);
    if (!r.ok) throw new Error(r.problem);
    expect(r.rows.length + r.outside + r.unlocatedIds.length).toBe(parsed.places.length);
    expect(r.rows.length).toBeGreaterThan(0);
    for (let i = 1; i < r.rows.length; i++) expect(r.rows[i]!.along).toBeGreaterThanOrEqual(r.rows[i - 1]!.along);
    for (const row of r.rows) expect(row.off).toBeLessThanOrEqual(250);
  });

  it("renders the list from the shipped pack without an axe violation", async () => {
    await show(realPlaces);
    open();
    line({ lat: "43.65", lon: "-79.38" }, { lat: "43.662", lon: "-79.38" });
    expect(rows().length).toBeGreaterThan(0);
    expect(rows().length).toBeLessThanOrEqual(25);
    expect((await axe.run(document.body, axeRules)).violations).toEqual([]);
  });
});

describe("how the tool is loaded", () => {
  it("is in its own file, loaded after the page and never imported with it", () => {
    const source = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "PackPlaces.tsx"), "utf8");
    expect(source).not.toMatch(/import \{[^}]*\bWayPlaces\b[^}]*\} from "\.\/WayPlaces/);
    expect(source).toContain('lazy(() => import("./WayPlaces.tsx")');
  });
});
