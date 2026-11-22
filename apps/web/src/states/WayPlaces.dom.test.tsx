/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SavedFile } from "./downloadFile";
import { bare, place } from "./placeFixtures";
import { lintFrench } from "./typography";
import { WayPlaces } from "./WayPlaces";
import { buildWay } from "./wayPlaces";
import { WAY_CSV_FILENAMES, WAY_FILENAMES, WAY_GEOJSON_FILENAMES, wayToText } from "./wayPlacesExport";

const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
const A = { lat: 43.65, lon: -79.4 };
const B = { lat: 43.65, lon: -79.36 };
const at = (id: string, name: string, lat: number, lon: number, wheelchair: string | null = "yes") => place(id, { name, lat, lon, wheelchair });
const set = [at("s", "Start side", 43.6505, -79.401), at("q", "Quarter", 43.6501, -79.39, null), at("m", "Middle", 43.6509, -79.38, "no"), at("f", "Far", 43.658, -79.38, "limited"), at("e", "End side", 43.6495, -79.359, "no"), bare("z")];

afterEach(cleanup);

interface Over {
  places?: typeof set;
  locale?: "en" | "fr";
  from?: { lat: number; lon: number } | null;
  onSave?: (f: SavedFile) => boolean;
}
function show(over: Over = {}) {
  const locale = over.locale ?? "en";
  document.documentElement.lang = locale;
  return render(<WayPlaces places={over.places ?? set} locale={locale} from={over.from ?? null} onSave={over.onSave ?? (() => true)} />);
}
const toggle = () => fireEvent.click(screen.getByRole("button", { name: /^(Show|Hide) places along a straight line$|^(Afficher|Masquer) les lieux le long d’une ligne droite$/ }));
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const fill = (a = A, b = B) => {
  type("First point latitude", String(a.lat));
  type("First point longitude", String(a.lon));
  type("Second point latitude", String(b.lat));
  type("Second point longitude", String(b.lon));
};
const names = () => screen.getAllByRole("row").slice(1).map((r) => within(r).getByRole("rowheader").textContent);
const status = () => (document.querySelector("[data-way-status]") as HTMLElement).textContent;
const ready = (over: Over = {}) => {
  show(over);
  toggle();
  fill();
};

describe("WayPlaces closed", () => {
  it("renders nothing when no place on screen has a map point", () => {
    expect(show({ places: [] }).container.innerHTML).toBe("");
    cleanup();
    expect(show({ places: [bare("a"), bare("b")] }).container.innerHTML).toBe("");
  });

  it("is closed to begin with: one button, no heading and no fields", () => {
    show();
    expect(screen.queryAllByRole("heading")).toEqual([]);
    expect(screen.getByRole("region", { name: "Places along a straight line" })).toBeTruthy();
    const btn = screen.getByRole("button", { name: "Show places along a straight line" });
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByLabelText("First point latitude")).toBeNull();
    expect(document.querySelector("[data-way-places]")!.getAttribute("data-way-places")).toBe("closed");
  });

  it("opens and closes, and the button points at what it controls", () => {
    show();
    toggle();
    const btn = screen.getByRole("button", { name: "Hide places along a straight line" });
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(btn.getAttribute("aria-controls")!)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Places along a straight line" }).tagName).toBe("H3");
    expect(document.querySelector("[data-way-wait]")).toBeTruthy();
    toggle();
    expect(screen.queryByLabelText("First point latitude")).toBeNull();
  });
});

describe("WayPlaces with two points", () => {
  it("lists the places near the line in order from the first point, with the summary and the caveat", () => {
    ready();
    expect(names()).toEqual(["Start side", "Quarter", "Middle", "End side"]);
    expect(document.querySelector("[data-way-summary]")!.textContent).toBe("The line is 3.2\u00a0km long. 4 places are within 250\u00a0m of it, out of 5 with a map point. 1 with no map point: UNKNOWN.");
    expect(screen.getByText(/A straight line is not a route/)).toBeTruthy();
    const first = screen.getAllByRole("row")[1]!;
    expect(within(first).getAllByRole("cell").map((c) => c.textContent)).toEqual(["1", "before the first point", expect.stringMatching(/m$/), "Yes"]);
    expect(within(screen.getAllByRole("row")[2]!).getAllByRole("cell")[3]!.textContent).toBe("UNKNOWN");
  });

  it("widens the band when asked, and says so", () => {
    ready();
    fireEvent.click(screen.getByRole("radio", { name: "Within 1.0\u00a0km of the line" }));
    expect(names()).toEqual(["Start side", "Quarter", "Middle", "Far", "End side"]);
    expect(status()).toBe("Within 1.0\u00a0km of the line");
  });

  it("keeps one tag only, numbers the rows again, and says how many", () => {
    ready();
    fireEvent.click(screen.getByRole("radio", { name: "No (2)" }));
    expect(names()).toEqual(["Middle", "End side"]);
    expect(document.querySelector('[data-way-row="1"] th')!.textContent).toBe("Middle");
    expect(status()).toBe("Showing 2 of 2 places with the tag No.");
    fireEvent.click(screen.getByRole("radio", { name: "Designated (0)" }));
    expect(document.querySelector("[data-way-no-match]")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save the list (text)" })).toBeNull();
  });

  it("shows at most the number chosen and says how many more there are", () => {
    const many = Array.from({ length: 14 }, (_, i) => at(`p${String(i).padStart(2, "0")}`, `Place ${String(i).padStart(2, "0")}`, 43.6502, -79.399 + i * 0.002));
    ready({ places: many });
    fireEvent.click(screen.getByRole("radio", { name: "10" }));
    expect(names()).toHaveLength(10);
    expect(document.querySelector("[data-way-more]")!.textContent).toBe("4 more places are not shown. Save a file to see all of them.");
    expect(screen.getByRole("table").querySelector("caption")!.textContent).toMatch(/^Showing 10 of 14 places/);
    expect(status()).toBe("Showing 10 of 14 places.");
  });

  it("names the longest part of the line with nothing listed near it", () => {
    ready();
    expect(document.querySelector("[data-way-stretch]")!.textContent).toMatch(/^The longest part of the line with no listed place near it is .* not proof that nothing is there\.$/);
  });

  it("swaps the two points and lists from the other end", () => {
    ready();
    fireEvent.click(screen.getByRole("button", { name: "Swap the two points" }));
    expect(names()).toEqual(["End side", "Middle", "Quarter", "Start side"]);
    expect((screen.getByLabelText("First point latitude") as HTMLInputElement).value).toBe(String(B.lat));
    expect((screen.getByLabelText("First point longitude") as HTMLInputElement).value).toBe(String(B.lon));
    expect(status()).toBe("The points are now in the other order. Places are listed from the other end.");
  });

  it("offers the point typed above as the first point", () => {
    show({ from: { lat: 43.651, lon: -79.401 } });
    toggle();
    fireEvent.click(screen.getByRole("button", { name: "Use the point typed above" }));
    expect((screen.getByLabelText("First point latitude") as HTMLInputElement).value).toBe("43.65100");
    expect((screen.getByLabelText("First point longitude") as HTMLInputElement).value).toBe("-79.40100");
  });

  it("does not offer the point above when there is none", () => {
    show();
    toggle();
    expect(screen.queryByRole("button", { name: "Use the point typed above" })).toBeNull();
  });
});

describe("WayPlaces problems", () => {
  it("shows an error on a point that cannot be read, and no list", () => {
    show();
    toggle();
    type("First point latitude", "91");
    type("First point longitude", "-79.4");
    expect(screen.getByText(/Type a latitude from -90 to 90/)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(document.querySelector("[data-way-wait]")).toBeTruthy();
  });

  it("explains two points at the same place, and a line too long to measure", () => {
    show();
    toggle();
    fill(A, A);
    expect(document.querySelector("[data-way-problem]")!.textContent).toMatch(/^Two points that follow each other are at the same place or almost/);
    cleanup();
    show();
    toggle();
    fill(A, { lat: 44.2, lon: -79.4 });
    expect(document.querySelector("[data-way-problem]")!.textContent).toMatch(/^The path is 61\u00a0km long in all\./);
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("says when no place is near the line, and offers no files", () => {
    ready({ places: [at("f", "Far", 43.7, -79.38)] });
    expect(document.querySelector("[data-way-summary]")!.textContent).toContain("No place is within 250\u00a0m of it, out of 1 place with a map point.");
    expect(document.querySelector("[data-way-stretch]")!.textContent).toBe("No place on the list is near any part of the line.");
    expect(screen.queryByRole("radio", { name: /Any tag/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Save/ })).toBeNull();
  });
});

describe("WayPlaces files", () => {
  it("saves the text, CSV and GeoJSON files and says so", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    ready({ onSave });
    fireEvent.click(screen.getByRole("button", { name: "Save the list (text)" }));
    const r = buildWay(set, A, B);
    if (!r.ok) throw new Error(r.problem);
    expect(onSave.mock.calls[0]?.[0]).toEqual({ name: WAY_FILENAMES.en, mime: "text/plain;charset=utf-8", content: wayToText(r, r.rows, "any", [A, B], "en") });
    expect(status()).toBe(`Saved ${WAY_FILENAMES.en}.`);
    fireEvent.click(screen.getByRole("button", { name: "Save the list (CSV)" }));
    expect(onSave.mock.calls[1]?.[0].name).toBe(WAY_CSV_FILENAMES.en);
    fireEvent.click(screen.getByRole("button", { name: "Save the line and places (GeoJSON)" }));
    expect(onSave.mock.calls[2]?.[0].name).toBe(WAY_GEOJSON_FILENAMES.en);
    expect(onSave.mock.calls[2]?.[0].mime).toBe("application/geo+json;charset=utf-8");
  });

  it("saves only the places with the tag chosen", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    ready({ onSave });
    fireEvent.click(screen.getByRole("radio", { name: "No (2)" }));
    fireEvent.click(screen.getByRole("button", { name: "Save the list (text)" }));
    const text = onSave.mock.calls[0]![0].content;
    expect(text).toContain("1. Middle:");
    expect(text).not.toContain("Quarter");
  });

  it("says so when the browser cannot save, or throws", () => {
    ready({ onSave: () => false });
    fireEvent.click(screen.getByRole("button", { name: "Save the list (CSV)" }));
    expect(status()).toBe("This browser cannot save a file here.");
    cleanup();
    ready({
      onSave: () => {
        throw new Error("blocked");
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save the list (text)" }));
    expect(status()).toBe("This browser cannot save a file here.");
  });
});

describe("WayPlaces in French", () => {
  it("uses French labels, decimal commas and UNKNOWN", () => {
    show({ locale: "fr" });
    toggle();
    type("Latitude du premier point", "43,65");
    type("Longitude du premier point", "-79,4");
    type("Latitude du deuxième point", "43,65");
    type("Longitude du deuxième point", "-79,36");
    expect(names()).toEqual(["Start side", "Quarter", "Middle", "End side"]);
    expect(document.querySelector("[data-way-summary]")!.textContent).toBe("La ligne mesure 3,2\u00a0km. 4 lieux sont à 250\u00a0m d’elle ou moins, sur 5 avec un point de carte. 1 sans point de carte\u00a0: UNKNOWN.");
    expect(screen.getByRole("radio", { name: "UNKNOWN (1)" })).toBeTruthy();
    for (const el of document.querySelectorAll("[data-way-places] p, [data-way-places] legend, [data-way-places] caption, [data-way-places] button")) expect(lintFrench(el.textContent ?? ""), el.textContent ?? "").toEqual([]);
  });
});

// One axe run per language and state, so each fits the shared timeout.
describe("WayPlaces axe", () => {
  for (const locale of ["en", "fr"] as const) {
    it(`${locale}: has no axe violations when closed`, async () => {
      show({ locale });
      expect((await axe.run(document.body, axeRules)).violations).toEqual([]);
    });
    it(`${locale}: has no axe violations with a list`, async () => {
      show({ locale, from: A });
      toggle();
      fireEvent.click(screen.getByRole("button", { name: locale === "en" ? "Use the point typed above" : "Utiliser le point saisi plus haut" }));
      type(locale === "en" ? "Second point latitude" : "Latitude du deuxième point", "43.65");
      type(locale === "en" ? "Second point longitude" : "Longitude du deuxième point", "-79.36");
      expect(screen.getByRole("table")).toBeTruthy();
      expect((await axe.run(document.body, axeRules)).violations).toEqual([]);
    });
    it(`${locale}: has no axe violations with a point error`, async () => {
      show({ locale });
      toggle();
      type(locale === "en" ? "First point latitude" : "Latitude du premier point", "abc");
      expect((await axe.run(document.body, axeRules)).violations).toEqual([]);
    });
  }
});

describe("WayPlaces with points in between", () => {
  const C = { lat: 43.67, lon: -79.36 };
  const path = [at("w", "West", 43.6501, -79.39), at("n", "North", 43.66, -79.3591, "no"), at("x", "Off", 43.66, -79.39)];
  const addVia = () => fireEvent.click(screen.getByRole("button", { name: "Add a point in between" }));
  const fillVia = (n: number, p: { lat: number; lon: number }) => {
    type(`Point in between ${n} latitude`, String(p.lat));
    type(`Point in between ${n} longitude`, String(p.lon));
  };
  const typePath = () => {
    type("First point latitude", String(A.lat));
    type("First point longitude", String(A.lon));
    addVia();
    fillVia(1, B);
    type("Second point latitude", String(C.lat));
    type("Second point longitude", String(C.lon));
  };

  it("waits for a point in between to be typed before listing", () => {
    show({ places: path });
    toggle();
    fill();
    expect(names()).toEqual(["West"]);
    addVia();
    expect(status()).toBe("Point in between 1 added. Type it to use it.");
    expect(screen.queryByRole("table")).toBeNull();
    expect(document.querySelector("[data-way-wait]")!.textContent).toBe("Type every point to see the list.");
  });

  it("lists places along both parts and names the part of each", () => {
    show({ places: path });
    toggle();
    typePath();
    expect(names()).toEqual(["West", "North"]);
    expect(document.querySelector("[data-way-summary]")!.textContent).toMatch(/^The path has 2 parts, /);
    const north = screen.getAllByRole("row")[2]!;
    expect(within(north).getAllByRole("cell")[1]!.textContent).toMatch(/along \(part 2\)$/);
  });

  it("removes a point in between, and says so with a remove label", () => {
    show({ places: path });
    toggle();
    typePath();
    fireEvent.click(screen.getByRole("button", { name: "Remove point in between 1" }));
    expect(screen.queryByLabelText("Point in between 1 latitude")).toBeNull();
    expect(status()).toBe("Point in between 1 removed.");
    expect(document.querySelector("[data-way-summary]")!.textContent).toMatch(/^The line is /);
  });

  it("allows three points in between and says when there is no room for more", () => {
    show({ places: path });
    toggle();
    addVia();
    addVia();
    addVia();
    expect(screen.queryByRole("button", { name: "Add a point in between" })).toBeNull();
    expect(document.querySelector("[data-way-via-full]")!.textContent).toBe("A path can have up to 3 points in between.");
    expect(document.querySelectorAll("[data-way-via]")).toHaveLength(3);
  });

  it("keeps the other points in between when one in the middle is removed", () => {
    show({ places: path });
    toggle();
    addVia();
    addVia();
    fillVia(1, B);
    fillVia(2, C);
    fireEvent.click(screen.getByRole("button", { name: "Remove point in between 1" }));
    expect((screen.getByLabelText("Point in between 1 latitude") as HTMLInputElement).value).toBe(String(C.lat));
  });

  it("reverses the points in between when the ends are swapped", () => {
    show({ places: path });
    toggle();
    typePath();
    addVia();
    fillVia(2, { lat: 43.66, lon: -79.36 });
    fireEvent.click(screen.getByRole("button", { name: "Swap the two points" }));
    expect((screen.getByLabelText("Point in between 1 latitude") as HTMLInputElement).value).toBe("43.66");
    expect((screen.getByLabelText("Point in between 2 latitude") as HTMLInputElement).value).toBe(String(B.lat));
    expect(names()).toEqual(["North", "West"]);
  });

  it("shows an error on a point in between that cannot be read", () => {
    show({ places: path });
    toggle();
    fill();
    addVia();
    type("Point in between 1 latitude", "x");
    type("Point in between 1 longitude", "-79.36");
    expect(within(document.querySelector('[data-way-via="1"]') as HTMLElement).getByText(/Type a latitude from -90 to 90/)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("saves the whole path in the files", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    show({ places: path, onSave });
    toggle();
    typePath();
    fireEvent.click(screen.getByRole("button", { name: "Save the line and places (GeoJSON)" }));
    const g = JSON.parse(onSave.mock.calls[0]![0].content) as { features: { geometry: { coordinates: unknown } }[] };
    expect(g.features[0]?.geometry.coordinates).toEqual([[A.lon, A.lat], [B.lon, B.lat], [C.lon, C.lat]]);
  });

  for (const locale of ["en", "fr"] as const) {
    it(`${locale}: has no axe violations with a point in between`, async () => {
      show({ places: path, locale });
      toggle();
      fireEvent.click(screen.getByRole("button", { name: locale === "en" ? "Add a point in between" : "Ajouter un point intermédiaire" }));
      expect(screen.getByRole("button", { name: locale === "en" ? "Remove point in between 1" : "Retirer le point intermédiaire 1" })).toBeTruthy();
      expect((await axe.run(document.body, axeRules)).violations).toEqual([]);
    });
  }
});

describe("WayPlaces picking a place as a point", () => {
  const pick = (label: string) => fireEvent.change(screen.getByLabelText("Use a place on screen as a point"), { target: { value: label } });

  it("lists the places with a map point, by name, and none without", () => {
    show();
    toggle();
    const options = Array.from((screen.getByLabelText("Use a place on screen as a point") as HTMLSelectElement).options).map((o) => o.textContent);
    expect(options).toEqual(["Choose a place", "End side (e)", "Far (f)", "Middle (m)", "Quarter (q)", "Start side (s)"]);
  });

  it("fills the first and second points from places, and lists along the line between them", () => {
    show();
    toggle();
    pick("s");
    fireEvent.click(screen.getByRole("button", { name: "Use as the first point" }));
    expect(status()).toBe("The first point is now Start side.");
    pick("e");
    fireEvent.click(screen.getByRole("button", { name: "Use as the second point" }));
    expect((screen.getByLabelText("Second point latitude") as HTMLInputElement).value).toBe("43.64950");
    expect(names()[0]).toBe("Start side");
    expect(names().at(-1)).toBe("End side");
  });

  it("asks for a place when none is chosen", () => {
    show();
    toggle();
    fireEvent.click(screen.getByRole("button", { name: "Use as the second point" }));
    expect(status()).toBe("Choose a place in the list first.");
    expect((screen.getByLabelText("Second point latitude") as HTMLInputElement).value).toBe("");
  });

  it("makes the list tall enough to reach easily", () => {
    show();
    toggle();
    expect((screen.getByLabelText("Use a place on screen as a point") as HTMLSelectElement).style.minHeight).toBe("44px");
  });
});
