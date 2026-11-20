/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { SavedFile } from "./downloadFile";
import { OutingPlanner } from "./OutingPlanner";
import { scattered, START_WEST } from "./outingFixtures";
import { legText } from "./outingCopy";
import { buildOuting, nearestOrder, orderFor, type OutingMode } from "./outingPlan";

afterEach(cleanup);

const LABELS: Record<OutingMode, string> = { added: "As added to the list", nearest: "Nearest next", mine: "My own order" };

function mount(seed: number, size: number, start: typeof START_WEST | null, locale: "en" | "fr" = "en") {
  const set = scattered(seed, size);
  const saved: SavedFile[] = [];
  document.documentElement.lang = locale;
  render(<OutingPlanner places={set} locale={locale} today="2026-11-19" start={start} onSave={(f) => (saved.push(f), true)} />);
  return { set, saved };
}
const rowsOf = () => screen.getAllByRole("row").slice(1);

describe("the table follows the outing, over generated sets", () => {
  for (const seed of [2, 5, 9, 14, 33]) {
    for (const size of [2, 3, 7, 12]) {
      for (const start of [null, START_WEST]) {
        const where = start === null ? "no start" : "start";
        it(`added and nearest rows match buildOuting, leg for leg (seed ${seed}, ${size} places, ${where})`, () => {
          const { set } = mount(seed, size, start);
          for (const mode of ["added", "nearest"] as const) {
            fireEvent.click(screen.getByRole("radio", { name: LABELS[mode] }));
            const outing = buildOuting(set, orderFor(mode, set, start, []), start);
            const rows = rowsOf();
            expect(rows).toHaveLength(outing.stops.length);
            outing.stops.forEach((stop, i) => {
              const cells = within(rows[i]!).getAllByRole("cell");
              expect(within(rows[i]!).getByRole("rowheader").textContent).toBe(stop.name ?? "UNKNOWN");
              expect(cells[0]!.textContent).toBe(String(stop.position));
              expect(cells[2]!.textContent).toBe(i === 0 && start === null ? "–" : legText(stop.legMetres, "en"));
              expect(cells[3]!.textContent).toBe(legText(stop.totalMetres, "en") + (stop.totalComplete ? "" : " or more"));
            });
          }
        });
      }
    }
  }

  it("shows UNKNOWN exactly where a place has no map point or its neighbour has none", () => {
    for (const seed of [2, 5, 9]) {
      const { set } = mount(seed, 10, START_WEST);
      const outing = buildOuting(set, set.map((p) => p.id), START_WEST);
      rowsOf().forEach((row, i) => expect(within(row).getAllByRole("cell")[2]!.textContent === "UNKNOWN", `${seed}:${i}`).toBe(outing.stops[i]!.legMetres === null));
      cleanup();
    }
  });

  it("saves the files in the order on screen, after a move", () => {
    const { set, saved } = mount(7, 6, START_WEST);
    const first = set[0]!;
    fireEvent.click(screen.getByRole("button", { name: `Move ${first.name ?? "UNKNOWN"} down` }));
    fireEvent.click(screen.getByRole("button", { name: "Save the outing (CSV)" }));
    const ids = saved[0]!.content.replace(/\r\n$/, "").split("\r\n").slice(1).map((r) => r.split(",")[1]);
    const shown = rowsOf().map((r) => within(r).getByRole("rowheader").textContent);
    expect(shown[1]).toBe(first.name ?? "UNKNOWN");
    expect(ids[1]).toBe(first.id);
    expect(ids).toHaveLength(set.length);
  });

  it("gives the same nearest order on screen as the rule gives on its own", () => {
    const { set } = mount(11, 9, START_WEST);
    fireEvent.click(screen.getByRole("radio", { name: LABELS.nearest }));
    const shown = rowsOf().map((r) => within(r).getByRole("rowheader").textContent!);
    const expected = nearestOrder(set, START_WEST).map((id) => set.find((p) => p.id === id)!.name ?? "UNKNOWN");
    expect(shown).toEqual(expected);
  });

  it("never shows NaN, undefined or an INCONNU in either language", () => {
    for (const locale of ["en", "fr"] as const) {
      for (const seed of [3, 8, 21]) {
        mount(seed, 8, START_WEST, locale);
        fireEvent.change(screen.getByRole("textbox"), { target: { value: "3,5" } });
        expect(document.body.textContent).not.toMatch(/NaN|undefined|INCONN|\[object|null\b/);
        cleanup();
      }
    }
  });
});
