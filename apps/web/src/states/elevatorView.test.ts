import { describe, expect, it } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import { ELEVATOR_AGE_BANDS } from "./elevatorAge";
import { notice, manyNotices } from "./elevatorFixtures";
import { ELEVATOR_SORTS, EMPTY_ELEVATOR_QUERY, announce, foldNoticeText, isElevatorSort, matchesSearch, rowsFor, viewElevators, type ElevatorQuery } from "./elevatorView";
import { parseElevatorNotices } from "./packElevators";
import { lcg } from "./placeFixtures";

const TODAY = "2026-11-21";
const shipped = parseElevatorNotices((JSON.parse(contentText) as { elevator_status: unknown[] }).elevator_status).notices;
const q = (over: Partial<ElevatorQuery> = {}): ElevatorQuery => ({ ...EMPTY_ELEVATOR_QUERY, ...over });
const stations = (v: ReturnType<typeof viewElevators>) => v.groups.map((g) => g.station);

describe("foldNoticeText", () => {
  it("lowers case, removes accents and tidies spaces", () => {
    expect(foldNoticeText("  Édifice   PAPE \n Ave ")).toBe("edifice pape ave");
    expect(foldNoticeText("")).toBe("");
  });
  it("leaves digits and punctuation", () => {
    expect(foldNoticeText("ELV02-B / 8D1L")).toBe("elv02-b / 8d1l");
  });
});

describe("matchesSearch", () => {
  const row = rowsFor([notice({ stopIds: ["13746", "13745"] })], TODAY)[0]!;
  it("matches everything for blank text", () => {
    for (const s of ["", "   ", "\n"]) expect(matchesSearch(row, s)).toBe(true);
  });
  it("finds the station, the elevator label, a place in the notice and a stop id", () => {
    for (const s of ["pape", "8d1l", "concourse", "13745", "PAPE AVE"]) expect(matchesSearch(row, s), s).toBe(true);
  });
  it("needs every word, in any order", () => {
    expect(matchesSearch(row, "concourse 8d1l")).toBe(true);
    expect(matchesSearch(row, "concourse zzz")).toBe(false);
  });
  it("finds a word without its accent", () => {
    const r = rowsFor([notice({ station: "Églinton", text: null })], TODAY)[0]!;
    expect(matchesSearch(r, "eglinton")).toBe(true);
    expect(matchesSearch(r, "églinton")).toBe(true);
  });
  it("finds part of a word", () => {
    expect(matchesSearch(row, "conc")).toBe(true);
  });
  it("does not match a notice's source name or licence", () => {
    expect(matchesSearch(row, "ttc")).toBe(false);
    expect(matchesSearch(row, "ogl")).toBe(false);
  });
});

describe("viewElevators on the shipped pack", () => {
  const v = viewElevators(shipped, EMPTY_ELEVATOR_QUERY, TODAY, "en");
  it("lists the stations by name", () => {
    expect(stations(v)).toEqual(["Cedarvale", "Finch", "Pape"]);
  });
  it("counts shown and total", () => {
    expect(v.shown).toBe(3);
    expect(v.total).toBe(3);
    expect(v.announcement).toBe("3 notices shown.");
  });
  it("puts all three in the older band, eight days after the check", () => {
    expect(v.bandCounts.older).toBe(3);
    for (const g of v.groups) for (const r of g.rows) expect(r.age).toEqual({ days: 8, band: "older" });
  });
  it("narrows by a station word and says how many of how many", () => {
    const n = viewElevators(shipped, q({ text: "pape" }), TODAY, "en");
    expect(stations(n)).toEqual(["Pape"]);
    expect(n.announcement).toBe("1 of 3 notices shown.");
  });
  it("narrows by an age band and keeps the band counts of the whole", () => {
    const n = viewElevators(shipped, q({ band: "same-day" }), TODAY, "en");
    expect(n.shown).toBe(0);
    expect(n.groups).toEqual([]);
    expect(n.bandCounts.older).toBe(3);
    expect(n.announcement).toBe("No notices match. 3 saved.");
  });
  it("shows them all on the day of the check, in the same-day band", () => {
    const n = viewElevators(shipped, q({ band: "same-day" }), "2026-11-13", "en");
    expect(n.shown).toBe(3);
  });
  it("says it in French", () => {
    expect(viewElevators(shipped, EMPTY_ELEVATOR_QUERY, TODAY, "fr").announcement).toBe("3 avis affichés.");
    expect(viewElevators(shipped, q({ text: "pape" }), TODAY, "fr").announcement).toBe("1 avis affichés sur 3.");
  });
});

describe("grouping", () => {
  it("puts notices of one station together whatever the case or accents", () => {
    const v = viewElevators([notice({ id: "a", station: "Églinton" }), notice({ id: "b", station: "EGLINTON" }), notice({ id: "c", station: "Union" })], EMPTY_ELEVATOR_QUERY, TODAY, "en");
    expect(v.groups).toHaveLength(2);
    expect(v.groups[0]?.station).toBe("Églinton");
    expect(v.groups[0]?.rows).toHaveLength(2);
  });
  it("keeps unnamed stations in one group, last", () => {
    const v = viewElevators([notice({ id: "a", station: null }), notice({ id: "b", station: "Union" }), notice({ id: "c", station: null })], EMPTY_ELEVATOR_QUERY, TODAY, "en");
    expect(stations(v)).toEqual(["Union", ""]);
    expect(v.groups[1]?.rows).toHaveLength(2);
  });
  it("sorts station names with numbers in order, so Station 2 comes before Station 10", () => {
    const v = viewElevators([notice({ id: "a", station: "Station 10" }), notice({ id: "b", station: "Station 2" })], EMPTY_ELEVATOR_QUERY, TODAY, "en");
    expect(stations(v)).toEqual(["Station 2", "Station 10"]);
  });
  it("sorts accented names with the letter, not after z", () => {
    const v = viewElevators([notice({ id: "a", station: "Zoo" }), notice({ id: "b", station: "Étobicoke" }), notice({ id: "c", station: "Eglinton" })], EMPTY_ELEVATOR_QUERY, TODAY, "fr");
    expect(stations(v)).toEqual(["Eglinton", "Étobicoke", "Zoo"]);
  });
});

describe("sorting", () => {
  const set = [
    notice({ id: "a", station: "Union", checkedAt: "2026-11-10T10:00:00Z", checkedDay: "2026-11-10" }),
    notice({ id: "b", station: "Finch", checkedAt: "2026-11-20T10:00:00Z", checkedDay: "2026-11-20" }),
    notice({ id: "c", station: "Pape", checkedAt: "2026-11-15T10:00:00Z", checkedDay: "2026-11-15" }),
    notice({ id: "d", station: "Kennedy", checkedAt: null, checkedDay: null }),
  ];
  it("by station name", () => {
    expect(stations(viewElevators(set, q({ sort: "station" }), TODAY, "en"))).toEqual(["Finch", "Kennedy", "Pape", "Union"]);
  });
  it("oldest check first, with no check time last", () => {
    expect(stations(viewElevators(set, q({ sort: "oldest" }), TODAY, "en"))).toEqual(["Union", "Pape", "Finch", "Kennedy"]);
  });
  it("newest check first, with no check time last", () => {
    expect(stations(viewElevators(set, q({ sort: "newest" }), TODAY, "en"))).toEqual(["Finch", "Pape", "Union", "Kennedy"]);
  });
  it("orders notices inside a station by the same rule, then by id", () => {
    const two = [
      notice({ id: "z", checkedAt: "2026-11-15T10:00:00Z", checkedDay: "2026-11-15" }),
      notice({ id: "y", checkedAt: "2026-11-12T10:00:00Z", checkedDay: "2026-11-12" }),
      notice({ id: "x", checkedAt: "2026-11-12T10:00:00Z", checkedDay: "2026-11-12" }),
      notice({ id: "w", checkedAt: null, checkedDay: null }),
    ];
    const ids = (s: ElevatorQuery["sort"]) => viewElevators(two, q({ sort: s }), TODAY, "en").groups[0]?.rows.map((r) => r.notice.id);
    expect(ids("oldest")).toEqual(["x", "y", "z", "w"]);
    expect(ids("newest")).toEqual(["z", "x", "y", "w"]);
    expect(ids("station")).toEqual(["x", "y", "z", "w"]);
  });
  it("puts a station by its oldest notice when sorting oldest first", () => {
    const mixed = [
      notice({ id: "a", station: "A", checkedAt: "2026-11-19T10:00:00Z", checkedDay: "2026-11-19" }),
      notice({ id: "b", station: "A", checkedAt: "2026-11-01T10:00:00Z", checkedDay: "2026-11-01" }),
      notice({ id: "c", station: "B", checkedAt: "2026-11-10T10:00:00Z", checkedDay: "2026-11-10" }),
    ];
    expect(stations(viewElevators(mixed, q({ sort: "oldest" }), TODAY, "en"))).toEqual(["A", "B"]);
    expect(stations(viewElevators(mixed, q({ sort: "newest" }), TODAY, "en"))).toEqual(["A", "B"]);
  });
  it("uses a station's oldest check for oldest first and its newest for newest first", () => {
    const set = [
      notice({ id: "c", station: "C", checkedAt: "2026-11-05T10:00:00Z", checkedDay: "2026-11-05" }),
      notice({ id: "d1", station: "D", checkedAt: "2026-11-08T10:00:00Z", checkedDay: "2026-11-08" }),
      notice({ id: "d2", station: "D", checkedAt: "2026-11-20T10:00:00Z", checkedDay: "2026-11-20" }),
    ];
    expect(stations(viewElevators(set, q({ sort: "oldest" }), TODAY, "en"))).toEqual(["C", "D"]);
    expect(stations(viewElevators(set, q({ sort: "newest" }), TODAY, "en"))).toEqual(["D", "C"]);
  });
  it("knows its own sort names", () => {
    for (const s of ELEVATOR_SORTS) expect(isElevatorSort(s)).toBe(true);
    for (const s of ["", "age", null, 3]) expect(isElevatorSort(s)).toBe(false);
  });
});

describe("bands", () => {
  it("counts each band over the whole set", () => {
    const set = [
      notice({ id: "a", checkedDay: "2026-11-21", checkedAt: "2026-11-21T09:00:00Z" }),
      notice({ id: "b", checkedDay: "2026-11-19", checkedAt: "2026-11-19T09:00:00Z" }),
      notice({ id: "c", checkedDay: "2026-11-16", checkedAt: "2026-11-16T09:00:00Z" }),
      notice({ id: "d", checkedDay: "2026-10-01", checkedAt: "2026-10-01T09:00:00Z" }),
      notice({ id: "e", checkedDay: "2026-12-01", checkedAt: "2026-12-01T09:00:00Z" }),
      notice({ id: "f", checkedDay: null, checkedAt: null }),
    ];
    const v = viewElevators(set, EMPTY_ELEVATOR_QUERY, TODAY, "en");
    expect(v.bandCounts).toEqual({ "same-day": 1, "within-3": 1, "within-week": 1, older: 1, future: 1, unknown: 1 });
    for (const b of ELEVATOR_AGE_BANDS) expect(viewElevators(set, q({ band: b }), TODAY, "en").shown, b).toBe(1);
  });
  it("combines a band and a search", () => {
    const v = viewElevators(shipped, q({ band: "older", text: "finch" }), TODAY, "en");
    expect(v.shown).toBe(1);
    expect(viewElevators(shipped, q({ band: "same-day", text: "finch" }), TODAY, "en").shown).toBe(0);
  });
});

describe("announce", () => {
  it("covers none saved, none matching, all and some", () => {
    expect(announce(0, 0, "en")).toBe("No elevator notices are saved.");
    expect(announce(0, 4, "en")).toBe("No notices match. 4 saved.");
    expect(announce(1, 1, "en")).toBe("1 notice shown.");
    expect(announce(4, 4, "en")).toBe("4 notices shown.");
    expect(announce(2, 4, "en")).toBe("2 of 4 notices shown.");
  });
  it("covers them in French with the right plural", () => {
    expect(announce(0, 0, "fr")).toBe("Aucun avis d’ascenseur n’est enregistré.");
    expect(announce(0, 1, "fr")).toBe("Aucun avis ne correspond. 1 enregistré.");
    expect(announce(0, 4, "fr")).toBe("Aucun avis ne correspond. 4 enregistrés.");
    expect(announce(1, 1, "fr")).toBe("1 avis affiché.");
  });
});

describe("invariants over 300 random sets", () => {
  it("never loses, repeats or invents a notice, whatever the query", () => {
    const rnd = lcg(404);
    const bands = [...ELEVATOR_AGE_BANDS, "all" as const];
    for (let i = 0; i < 300; i++) {
      const set = manyNotices(Math.floor(rnd() * 40), rnd);
      const query = q({ text: rnd() < 0.5 ? "" : ["pape", "finch", "e5", "lobby", "1", "zzz"][Math.floor(rnd() * 6)]!, band: bands[Math.floor(rnd() * bands.length)]!, sort: ELEVATOR_SORTS[Math.floor(rnd() * 3)]! });
      const v = viewElevators(set, query, TODAY, "en");
      const ids = v.groups.flatMap((g) => g.rows.map((r) => r.notice.id));
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.length).toBe(v.shown);
      expect(v.total).toBe(set.length);
      for (const id of ids) expect(set.some((n) => n.id === id)).toBe(true);
      expect(Object.values(v.bandCounts).reduce((a, b) => a + b, 0)).toBe(set.length);
      const keys = v.groups.map((g) => foldNoticeText(g.station));
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
  it("gives the same answer for the same input, and does not change its input", () => {
    const rnd = lcg(5);
    const set = manyNotices(30, rnd);
    const copy = JSON.stringify(set);
    const a = viewElevators(set, q({ sort: "oldest" }), TODAY, "en");
    const b = viewElevators(set, q({ sort: "oldest" }), TODAY, "en");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(set)).toBe(copy);
  });
  it("shows every notice when nothing is filtered", () => {
    const set = manyNotices(60, lcg(9));
    expect(viewElevators(set, EMPTY_ELEVATOR_QUERY, TODAY, "en").shown).toBe(60);
  });
  it("sorts oldest first so no later check comes before an earlier one inside a group", () => {
    const set = manyNotices(80, lcg(12));
    for (const g of viewElevators(set, q({ sort: "oldest" }), TODAY, "en").groups) {
      const ms = g.rows.map((r) => Date.parse(r.notice.checkedAt!));
      expect([...ms].sort((a, b) => a - b)).toEqual(ms);
    }
  });
});
