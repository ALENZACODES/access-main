/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it } from "vitest";
import type { EarlierPlace } from "./packEarlier";
import { diffPacks } from "./packDiff";
import { parsePackPlaces, type PackPlaceRecord } from "./packPlaces";
import { MAX_LISTED_MOVED, PackTagMoves } from "./PackTagMoves";
import { MOVE_KEYS, buildTagMoves, noTagMoves, placesIn } from "./packTagMoves";

const OSM = { source_name: "OpenStreetMap, Geofabrik Ontario extract", licence: "ODbL-1.0", retrieved_at: "2026-11-10", tier: 0 };
const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
const TAGS = ["yes", "limited", "no", "designated", undefined];

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}
function pair(seed: number, size: number) {
  const next = lcg(seed);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]!;
  const earlier: EarlierPlace[] = [];
  const raw: unknown[] = [];
  for (let i = 0; i < size; i++) {
    const id = `p${String(i).padStart(4, "0")}`;
    if (next() < 0.85) earlier.push({ id, name: `Place ${id}`, kind: "cafe", address: "1 Main Street", lat: 43.65, lon: -79.38, tag: (pick(TAGS) ?? "unknown") as EarlierPlace["tag"], source: OSM.source_name, retrievedOn: OSM.retrieved_at, tier: null });
    if (next() < 0.85) raw.push({ id, name: `Place ${id}`, wheelchair: pick(TAGS), category: "cafe", address: "1 Main Street", lat: 43.65, lon: -79.38, provenance: OSM });
  }
  return diffPacks(earlier, [...parsePackPlaces(raw).places] as PackPlaceRecord[]);
}

afterEach(cleanup);

describe("PackTagMoves over generated comparisons", () => {
  for (const seed of [3, 8, 21, 55, 144, 2026]) {
    for (const size of [3, 12, 60, 130]) {
      const label = `seed ${seed}, ${size} places`;
      for (const locale of ["en", "fr"] as const) {
        it(`shows each cell's count as its table text, and the buttons agree (${label}, ${locale})`, () => {
          const diff = pair(seed, size);
          const moves = buildTagMoves(diff);
          const { container } = render(<PackTagMoves diff={diff} locale={locale} today="2026-11-19" onSave={() => true} />);
          if (noTagMoves(moves)) {
            expect(container.innerHTML).toBe("");
            return;
          }
          for (const from of MOVE_KEYS) {
            for (const to of MOVE_KEYS) {
              const td = container.querySelector(`[data-move="${from}>${to}"]`);
              if (from === to) {
                expect(td, `${from}>${to}`).toBeNull();
                continue;
              }
              expect(td!.textContent, `${from}>${to}`).toBe(String(moves.cells[from][to]));
              expect(within(td as HTMLElement).queryAllByRole("button").length).toBe(moves.cells[from][to] === 0 ? 0 : 1);
            }
          }
        });

        it(`lists the right names, up to the cap, for the biggest cell (${label}, ${locale})`, () => {
          const diff = pair(seed, size);
          const moves = buildTagMoves(diff);
          if (noTagMoves(moves)) return;
          let best: [string, string, number] = ["", "", 0];
          for (const from of MOVE_KEYS) for (const to of MOVE_KEYS) if (moves.cells[from][to] > best[2]) best = [from, to, moves.cells[from][to]];
          const { container } = render(<PackTagMoves diff={diff} locale={locale} today="2026-11-19" onSave={() => true} />);
          fireEvent.click(within(container.querySelector(`[data-move="${best[0]}>${best[1]}"]`) as HTMLElement).getByRole("button"));
          const names = within(container).getAllByRole("listitem").map((l) => l.textContent);
          const expected = placesIn(moves, best[0] as (typeof MOVE_KEYS)[number], best[1] as (typeof MOVE_KEYS)[number]).map((p) => p.name ?? "UNKNOWN");
          expect(names).toEqual(expected.slice(0, MAX_LISTED_MOVED));
        });
      }
    }
  }

  it("has no axe violations on the largest generated comparison", async () => {
    const { container } = render(<PackTagMoves diff={pair(2026, 130)} locale="en" today="2026-11-19" onSave={() => true} />);
    expect((await axe.run(container, axeRules)).violations).toEqual([]);
  });
  it("does not put a name on screen that is not in one of the two files", () => {
    const diff = pair(99, 60);
    const { container } = render(<PackTagMoves diff={diff} locale="en" today="2026-11-19" onSave={() => true} />);
    for (const button of within(container).getAllByRole("button", { name: /List these places/ })) {
      fireEvent.click(button);
      for (const item of within(container).getAllByRole("listitem")) expect(item.textContent).toMatch(/^Place p\d{4}$/);
    }
  });
});
