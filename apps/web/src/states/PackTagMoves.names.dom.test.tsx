/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { EarlierPlace } from "./packEarlier";
import { diffPacks } from "./packDiff";
import { parsePackPlaces } from "./packPlaces";
import { PackTagMoves } from "./PackTagMoves";
import { buildTagMoves, placesIn } from "./packTagMoves";
import { tagMovesToCsv, tagMovesToText } from "./packTagMovesExport";

const OSM = { source_name: "OpenStreetMap, Geofabrik Ontario extract", licence: "ODbL-1.0", retrieved_at: "2026-11-10", tier: 0 };
const now = (id: string, name: string, wheelchair: string) => parsePackPlaces([{ id, name, wheelchair, category: "cafe", address: "1 Main Street", lat: 43.65, lon: -79.38, provenance: OSM }]).places[0]!;
const before = (id: string, name: string, tag: EarlierPlace["tag"]): EarlierPlace => ({ id, name, kind: "cafe", address: "1 Main Street", lat: 43.65, lon: -79.38, tag, source: OSM.source_name, retrievedOn: OSM.retrieved_at, tier: null });

afterEach(cleanup);

const NAMES = ["<b>Bold</b> Café", "<script>alert(1)</script>", "Tom & Jerry's", "\"Quoted\" Place", "Café d’Été", "東京カフェ", "A".repeat(400), "=HYPERLINK(\"x\")"];

function mount(names: string[], locale: "en" | "fr" = "en") {
  const ids = names.map((_, i) => `n${i}`);
  const d = diffPacks(ids.map((id, i) => before(id, names[i]!, "yes")), ids.map((id, i) => now(id, names[i]!, "no")));
  document.documentElement.lang = locale;
  return { d, ...render(<PackTagMoves diff={d} locale={locale} today="2026-11-19" onSave={() => true} />) };
}

describe("names in the pack are shown as text, whatever they contain", () => {
  it("lists each odd name exactly as written, and makes no element from it", () => {
    const { container } = mount(NAMES);
    fireEvent.click(within(container.querySelector('[data-move="yes>no"]') as HTMLElement).getByRole("button"));
    // The pack reader shortens a very long name with an ellipsis; everything else is kept as written.
    const kept = NAMES.map((n) => (n.length >= 300 ? null : n)).filter((n): n is string => n !== null);
    const listed = screen.getAllByRole("listitem").map((l) => l.textContent ?? "");
    expect(listed.filter((n) => kept.includes(n)).sort()).toEqual([...kept].sort());
    expect(container.querySelector("b, script")).toBeNull();
    expect(container.querySelectorAll("li > *")).toHaveLength(0);
  });
  it("does not run or inject anything, so the page has no script element after listing", () => {
    const { container } = mount(NAMES);
    fireEvent.click(within(container.querySelector('[data-move="yes>no"]') as HTMLElement).getByRole("button"));
    expect(document.querySelectorAll("script")).toHaveLength(0);
  });
  it("lists a very long name as the pack reader shortened it, with nothing more cut off", () => {
    const { container, d } = mount(NAMES);
    fireEvent.click(within(container.querySelector('[data-move="yes>no"]') as HTMLElement).getByRole("button"));
    const given = d.changed.find((c) => c.id === "n6")!.name;
    expect(given).not.toBeNull();
    expect(given!.length).toBeLessThanOrEqual(300);
    expect(screen.getAllByRole("listitem").some((l) => l.textContent === given)).toBe(true);
  });
  it("puts odd names in the saved text as they are, one per line", () => {
    const moves = buildTagMoves(mount(NAMES).d);
    const text = tagMovesToText(moves, "en", "2026-11-19");
    const moves2 = buildTagMoves(mount(NAMES).d);
    for (const p of placesIn(moves2, "yes", "no")) expect(text).toContain(`  - ${p.name} (${p.id})`);
    expect(text).toContain("  - <b>Bold</b> Café (n0)");
  });
  it("keeps names out of the CSV, which has ids only", () => {
    const moves = buildTagMoves(mount(NAMES).d);
    const csv = tagMovesToCsv(moves);
    for (const name of NAMES) expect(csv).not.toContain(name);
  });
  it("shows the same names in French and in English, since they belong to the pack", () => {
    const en = mount(NAMES, "en");
    fireEvent.click(within(en.container.querySelector('[data-move="yes>no"]') as HTMLElement).getByRole("button"));
    const inEn = screen.getAllByRole("listitem").map((l) => l.textContent);
    cleanup();
    const fr = mount(NAMES, "fr");
    fireEvent.click(within(fr.container.querySelector('[data-move="yes>no"]') as HTMLElement).getByRole("button"));
    expect(screen.getAllByRole("listitem").map((l) => l.textContent)).toEqual(inEn);
  });
  it("lists names in id order, the same order the saved files use", () => {
    const { container, d } = mount(NAMES);
    fireEvent.click(within(container.querySelector('[data-move="yes>no"]') as HTMLElement).getByRole("button"));
    expect(screen.getAllByRole("listitem").map((l) => l.textContent)).toEqual(placesIn(buildTagMoves(d), "yes", "no").map((p) => p.name));
  });
  it("uses the earlier file's name when the pack now gives a blank one", () => {
    const d = diffPacks([before("a", "Old Name", "yes")], [now("a", "", "no")]);
    const { container } = render(<PackTagMoves diff={d} locale="en" today="2026-11-19" onSave={() => true} />);
    fireEvent.click(within(container.querySelector('[data-move="yes>no"]') as HTMLElement).getByRole("button"));
    expect(screen.getAllByRole("listitem").map((l) => l.textContent)).toEqual(["Old Name"]);
  });
});
