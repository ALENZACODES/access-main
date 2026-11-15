import { describe, expect, it } from "vitest";
import { aggregate, decide, publish, resolveConfig, DEFAULT_SUPPRESSION } from "./engine.ts";
import { obs } from "./test-helpers.ts";

const AS_OF = "2026-11-15";
const run = (list: ReturnType<typeof obs>[], config = DEFAULT_SUPPRESSION) => publish(aggregate(list, AS_OF), config);

describe("configuration", () => {
  it("defaults to k = 5", () => {
    expect(resolveConfig().k).toBe(5);
  });

  it("refuses a threshold that would let a count of 2 through", () => {
    expect(() => resolveConfig({ k: 2 })).toThrow(RangeError);
    expect(() => resolveConfig({ k: 1 })).toThrow(RangeError);
    expect(() => resolveConfig({ k: 4.5 })).toThrow(RangeError);
    expect(() => resolveConfig({ smallCommunityFactor: 0 })).toThrow(RangeError);
    expect(resolveConfig({ k: 3 }).k).toBe(3);
  });
});

describe("small-cell threshold", () => {
  it("suppresses 4 and publishes 5 at the default threshold", () => {
    expect(run([obs({ count: 4 })])[0]?.state).toBe("suppressed");
    expect(run([obs({ count: 5 })])[0]).toMatchObject({ state: "published", count: 5 });
  });

  it("suppresses a count of zero, which is below the threshold", () => {
    expect(run([obs({ count: 0 })])[0]?.state).toBe("suppressed");
  });

  it("honours a configured threshold", () => {
    expect(run([obs({ count: 9 })], resolveConfig({ k: 10 }))[0]?.state).toBe("suppressed");
    expect(run([obs({ count: 10 })], resolveConfig({ k: 10 }))[0]?.state).toBe("published");
  });

  it("never rounds: a published count is the exact sum, a suppressed cell has no count", () => {
    const [published, suppressed] = run([obs({ count: 37 }), obs({ area: "test-area-b", count: 2 })]);
    expect(published).toMatchObject({ state: "published", count: 37 });
    expect(suppressed).toEqual({
      record_type: "advocacy_cell",
      schema_version: "advocacy-cell-1.0.0",
      category: "parking",
      geography: { level: "region", id: "test-area-b" },
      period: "2026-10",
      state: "suppressed",
    });
  });
});

describe("aggregation", () => {
  it("sums observations in the same category, area and period before deciding", () => {
    expect(run([obs({ id: "example-a-01", count: 3 }), obs({ id: "example-a-02", count: 2 })])[0]).toMatchObject({ state: "published", count: 5 });
    expect(run([obs({ id: "example-a-01", count: 1 }), obs({ id: "example-a-02", count: 1 })])[0]?.state).toBe("suppressed");
  });

  it("keeps different periods and categories apart", () => {
    const cells = run([obs({ count: 6 }), obs({ period: "2026-09", count: 6 }), obs({ category: "outage", count: 6 })]);
    expect(cells).toHaveLength(3);
  });

  it("publishes unknown, never a partial sum, when any contribution is unknown", () => {
    const [cell] = run([obs({ count: 40 }), obs({ count: "UNKNOWN" })]);
    expect(cell?.state).toBe("unknown");
    expect(cell).not.toHaveProperty("count");
  });

  it("is independent of input order and sorts without using counts", () => {
    const list = [obs({ area: "test-area-c", count: 9 }), obs({ area: "test-area-a", count: 90 }), obs({ area: "test-area-b", count: 1 })];
    const forward = run(list);
    const backward = run([...list].reverse());
    expect(backward).toEqual(forward);
    expect(forward.map((c) => c.geography.id)).toEqual(["test-area-a", "test-area-b", "test-area-c"]);
  });
});

describe("small communities", () => {
  it("needs k times the factor (20 by default) in a small community", () => {
    expect(run([obs({ band: "small", count: 19 })])[0]?.state).toBe("suppressed");
    expect(run([obs({ band: "small", count: 20 })])[0]?.state).toBe("published");
  });

  it("treats an unknown community size as small", () => {
    expect(run([obs({ band: "unknown", count: 12 })])[0]?.state).toBe("suppressed");
    expect(run([obs({ band: "unknown", count: 20 })])[0]?.state).toBe("published");
  });

  it("uses the smallest band when observations disagree about the same area", () => {
    expect(run([obs({ band: "large", count: 6 }), obs({ band: "small", count: 6 })])[0]?.state).toBe("suppressed");
  });

  it("explains itself internally while the published cell does not", () => {
    const [cell] = aggregate([obs({ band: "small", count: 12 })], AS_OF);
    expect(cell && decide(cell, DEFAULT_SUPPRESSION)).toEqual({ state: "suppressed", reasons: ["small_community"] });
  });
});

describe("headline eligibility", () => {
  const real = { example: false, id: "obs-real-01", source_id: "open-source", licence: "open-licence" } as const;
  const eligible = (o: ReturnType<typeof obs>) => {
    const [cell] = run([o]);
    return cell?.state === "published" ? cell : null;
  };

  it("never counts demonstration or fixture records", () => {
    expect(eligible(obs({ count: 9 }))).toMatchObject({ headline_eligible: false, headline_exclusions: ["example_record", "fixture_record"] });
    expect(eligible(obs({ ...real, id: "synthetic-obs-01" }))?.headline_exclusions).toEqual(["fixture_record"]);
    expect(eligible(obs({ ...real, licence: "not-a-real-dataset" }))?.headline_exclusions).toEqual(["fixture_record"]);
  });

  it("counts a dated, recent, non-fixture record", () => {
    expect(eligible(obs({ ...real }))).toMatchObject({ headline_eligible: true, headline_exclusions: [] });
  });

  it("excludes undated, future-dated and old values, and old status observations", () => {
    expect(eligible(obs({ ...real, source_date: "UNKNOWN" }))?.headline_exclusions).toEqual(["undated"]);
    expect(eligible(obs({ ...real, source_date: "2026-12-01" }))?.headline_exclusions).toEqual(["future_dated"]);
    expect(eligible(obs({ ...real, source_date: "2024-01-01" }))?.headline_exclusions).toEqual(["too_old"]);
    expect(eligible(obs({ ...real, source_date: "2026-10-10", category: "outage" }))?.headline_exclusions).toEqual(["status_window"]);
    expect(eligible(obs({ ...real, source_date: "2026-10-10", category: "parking" }))?.headline_eligible).toBe(true);
  });

  it("is not eligible when any contributing record is not", () => {
    const [cell] = run([obs({ ...real }), obs({ ...real, id: "obs-real-02", source_date: "UNKNOWN" })]);
    expect(cell).toMatchObject({ state: "published", headline_eligible: false });
  });
});
