import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { RECONCILIATION_LINES, RECONCILIATION_TARGET, RECORDS, ILLUSTRATIVE_TOTAL, canonicalSchemaId } from "../src/catalog/index.js";
import { countRecords } from "../src/count.js";
import { GAME_NAMES } from "../src/flat-schemas.js";
import { judgeFreshness } from "../src/freshness.js";
import {
  VENUE_ENTRANCE_KEYS,
  VENUE_PLACE_KEYS,
} from "../src/import-class.js";
import { migrateImportRecord, odblShareAlikeMissing } from "../src/migrate.js";
import { loadFieldsFile } from "../src/count.js";
import { schemaDir } from "../src/paths.js";
import { detectSchemaId, getValidator } from "../src/validate.js";
import { runCli } from "../src/cli.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = path.join(root, "fixtures");

function readJson(relative: string): unknown {
  return JSON.parse(readFileSync(path.join(fixtures, relative), "utf8")) as unknown;
}

function walk(directory: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(directory)) {
    const full = path.join(directory, name);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else if (name.endsWith(".json")) files.push(full);
  }
  return files;
}

function naiveImportPieces(record: { fields: Record<string, { value: unknown; derived?: boolean }> }): number {
  let pieces = 0;
  for (const field of Object.values(record.fields)) {
    if (field.derived === true) continue;
    if (field.value === "UNKNOWN" || field.value === "unknown") continue;
    pieces += 1;
  }
  return pieces;
}

describe("catalog census", () => {
  it("lists 100 place fields and keeps entrance measurements off the place", () => {
    const place = RECORDS.find((record) => record.recordType === "place");
    expect(place?.fields).toHaveLength(100);
    const names = new Set(place?.fields.map((field) => field.name));
    expect(names.has("door_clear_width_mm")).toBe(false);
    expect(names.has("transfer_side")).toBe(false);
    const system = place?.fields.filter((field) => field.count === "system") ?? [];
    expect(system).toHaveLength(20);
  });

  it("keeps adult change, hoist, van-accessible bays, and grab bars", () => {
    const washroom = RECORDS.find((record) => record.recordType === "washroom");
    const names = new Set(washroom?.fields.map((field) => field.name));
    for (const required of [
      "adult_change_table_present",
      "adult_change_table_load_kg",
      "hoist_present",
      "hoist_type",
      "hoist_sling_policy",
      "transfer_side",
      "grab_bar_left",
    ]) {
      expect(names.has(required)).toBe(true);
    }
    const parking = RECORDS.find((record) => record.recordType === "parking");
    const bay = parking?.fields.find((field) => field.name === "bay_type");
    expect(bay?.value && bay.value.type === "enum" && bay.value.values).toContain("type_a_van_accessible");
    expect(parking?.fields.filter((field) => field.placement === "facts")).toHaveLength(24);
    expect(RECORDS.find((record) => record.recordType === "entrance")?.fields.filter((field) => field.placement === "facts")).toHaveLength(28);
  });

  it("matches the section 5.6 and table T3-13 arithmetic", () => {
    expect(5_000 * 50 + 10_000 * 10 + 5_000 * 10 + 5_000 * 20).toBe(ILLUSTRATIVE_TOTAL);
    const sum = RECONCILIATION_LINES.reduce((total, line) => total + line.fieldValues, 0);
    expect(sum).toBe(RECONCILIATION_TARGET);
    for (const line of RECONCILIATION_LINES) {
      expect(line.records * line.fieldsPerRecord).toBe(line.fieldValues);
    }
  });

  it("partitions every access-maps venue, washroom, path, and transit field", () => {
    const fields = loadFieldsFile();
    expect(new Set([...VENUE_PLACE_KEYS, ...VENUE_ENTRANCE_KEYS])).toEqual(new Set(fields.venue));
    expect(VENUE_PLACE_KEYS.length + VENUE_ENTRANCE_KEYS.length).toBe(fields.venue.length);
    expect(fields.washroom.length).toBeGreaterThan(0);
    expect(fields.path.length).toBeGreaterThan(0);
    expect(fields.transit.length).toBeGreaterThan(0);
  });
});

describe("validator", () => {
  const validator = getValidator();

  it("compiles every schema and rejects default keywords", () => {
    expect(validator.schemaIds().length).toBeGreaterThan(10);
    const text = walk(schemaDir())
      .filter((file) => file.endsWith(".schema.json"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    expect(text.includes('"default"')).toBe(false);
  });

  it("passes labelled valid fixtures and fails labelled invalid fixtures", () => {
    for (const file of walk(path.join(fixtures, "valid"))) {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
      const records = Array.isArray(parsed) ? parsed : [parsed];
      for (const record of records) {
        const result = validator.validateDetected(record);
        expect(result.ok, `${path.basename(file)} ${JSON.stringify(result.errors)}`).toBe(true);
      }
    }
    for (const file of walk(path.join(fixtures, "invalid"))) {
      const result = validator.validateDetected(JSON.parse(readFileSync(file, "utf8")));
      expect(result.ok, path.basename(file)).toBe(false);
    }
  });

  it("accepts the ten starter games as a set and rejects a health field on the profile", () => {
    const games = readJson("valid/game-definitions.scope-lock.synthetic.json");
    const set = validator.validate(canonicalSchemaId("game-definition-set"), games);
    expect(set.ok, JSON.stringify(set.errors)).toBe(true);
    const names = (games as { name: string }[]).map((game) => game.name);
    expect(names).toEqual([...GAME_NAMES]);
    const profileSchema = JSON.parse(readFileSync(path.join(schemaDir(), "canonical/user-profile.schema.json"), "utf8")) as {
      properties: Record<string, unknown>;
    };
    for (const forbidden of ["diagnosis", "medication", "injury_level", "bladder_routine", "bowel_routine", "asia_score"]) {
      expect(profileSchema.properties[forbidden]).toBeUndefined();
    }
  });

  it("validates unmodified access-maps records, including the source registry row", () => {
    for (const file of walk(path.join(fixtures, "import/real"))) {
      const data = JSON.parse(readFileSync(file, "utf8")) as unknown;
      const result = validator.validateDetected(data);
      expect(result.ok, `${path.basename(file)} ${JSON.stringify(result.errors)}`).toBe(true);
    }
    const source = readJson("import/real/source.osm-ontario.json");
    const canonical = validator.validate(canonicalSchemaId("source"), source);
    expect(canonical.ok, JSON.stringify(canonical.errors)).toBe(true);
    expect(odblShareAlikeMissing(source as { licence_id: string })).toBe(true);
  });
});

describe("counting", () => {
  const asOf = "2026-11-13";

  it("counts the real import files the same way a second loop does, and splits accessibility facts", () => {
    const files = walk(path.join(fixtures, "import/real")).filter((file) => !file.endsWith("source.osm-ontario.json"));
    const records = files.map((file) => JSON.parse(readFileSync(file, "utf8")) as { id: string; fields: Record<string, { value: unknown; derived?: boolean }> });
    const report = countRecords([...records, readJson("import/real/source.osm-ontario.json")], asOf);
    const naive = records.reduce((sum, record) => sum + naiveImportPieces(record), 0);
    expect(report.headline_pieces).toBe(naive);
    expect(report.headline_pieces).toBe(16 + 3 + 3 + 7);
    expect(report.accessibility_fact_pieces + report.other_pieces).toBe(report.headline_pieces);
    expect(report.provenance_registers_not_counted).toBe(1);
    expect(report.local_profiles_not_counted).toBe(0);
    expect(report.illustrative_section_5_6.total).toBe(500_000);
    expect(report.reconciliation_table_t3_13_target).toBe(502_300);
  });

  it("does not count unknown, derived copies, translations, or profiles, and drops status outside 30 days", () => {
    const base = {
      source_id: "example",
      licence: "not-a-real-dataset",
      retrieved_at: "2026-11-13",
      tier: 3,
      method: "tape",
      observed_at: "2026-11-13",
      evidence: {
        protocol_version: "measurement-protocol-1.0.0",
        verifier_role: "trained_verifier",
        method: "tape",
        observed_at: "2026-11-13",
        photo_ids: ["example-photo"],
      },
    };
    const place = {
      record_type: "place",
      schema_version: "place-1.0.0",
      id: "count-place",
      record_status: "draft",
      publication_context: "canonical",
      provenance: {
        tier: 3,
        source_name: "Synthetic example",
        source_id: "example",
        source_date: "2026-11-13",
        record_date: "2026-11-13",
        licence_id: "not-a-real-dataset",
        retrieved_at: "2026-11-13",
        evidence: base.evidence,
      },
      facts: {
        name_en: { ...base, value: "Example Hall" },
        name_fr: { ...base, value: "Salle exemple" },
        step_free_route_exists: { ...base, value: "unknown" },
        interior_path_min_width_mm: { ...base, value: 900, unit: "mm" },
        phone_main: { ...base, value: "555", derived: true },
      },
    };
    const tri = {
      ...place,
      id: "count-tri",
      facts: {
        step_free_route_exists: { ...base, value: "unknown", tri_state_observation: true },
      },
    };
    const old = {
      ...place,
      id: "count-old",
      facts: {
        name_en: { ...base, value: "Old", observed_at: "2020-01-01", retrieved_at: "2020-01-01" },
      },
    };
    const outage = {
      record_type: "outage",
      schema_version: "outage-1.0.0",
      id: "count-outage",
      asset_id: "elev",
      record_status: "draft",
      publication_context: "canonical",
      provenance: place.provenance,
      facts: {
        status: { ...base, tier: 4, value: "out_of_service", observed_at: "2026-10-01", retrieved_at: "2026-10-01" },
        reported_at: { ...base, tier: 4, value: "2026-10-01T00:00:00Z", observed_at: "2026-10-01", retrieved_at: "2026-10-01" },
        received_at: { ...base, tier: 4, value: "2026-10-01T00:00:00Z", observed_at: "2026-10-01", retrieved_at: "2026-10-01" },
        expires_at: { ...base, tier: 4, value: "2026-10-02T00:00:00Z", observed_at: "2026-10-01", retrieved_at: "2026-10-01" },
      },
    };
    const profile = {
      record_type: "user_profile",
      id: "count-profile",
      profile_name: "Example",
      storage: "local_device_only",
      server_persistence: "forbidden",
    };
    const report = countRecords([place, tri, old, outage, profile], "2026-11-13");
    expect(report.by_record_type.place?.headline_pieces).toBe(3);
    expect(report.by_record_type.place?.translations_not_counted).toBe(1);
    expect(report.by_record_type.place?.accessibility_fact_pieces).toBe(2);
    expect(report.by_record_type.place?.derived_excluded).toBe(1);
    expect(report.excluded_older_than_730_days).toBe(1);
    expect(report.excluded_outside_status_snapshot).toBe(4);
    expect(report.local_profiles_not_counted).toBe(1);
    expect(report.headline_pieces).toBe(3);
  });
});

describe("migration from access-maps", () => {
  const validator = getValidator();
  const asOf = "2026-11-13";

  it("validates migrated records and keeps the piece count", () => {
    const source = readJson("import/real/source.osm-ontario.json") as { id: string; name: string };
    for (const relative of [
      "import/real/venue.osm-node-238726675.json",
      "import/real/washroom.osm-node-5747441521.json",
      "import/real/path.osm-way-333112785.json",
      "import/real/transit.gtfs-go-08047.json",
    ]) {
      const original = readJson(relative) as {
        id: string;
        tranche: "venue" | "washroom" | "path" | "transit";
        fields: Record<string, { value: unknown; source_key?: string; derived?: boolean }>;
      };
      const before = countRecords([original], asOf);
      const migrated = migrateImportRecord(original, [source]);
      for (const record of migrated) {
        const result = validator.validateDetected(record);
        expect(result.ok, `${relative} ${JSON.stringify(result.errors)}`).toBe(true);
      }
      const after = countRecords(migrated, asOf);
      expect(after.headline_pieces).toBe(before.headline_pieces);
      expect(after.gaps).toBe(before.gaps);
      expect(after.derived_excluded).toBe(before.derived_excluded);
      const seen = new Set<string>();
      for (const record of migrated) {
        const facts = (record.facts ?? {}) as Record<string, { import_field?: string }>;
        const imported = (record.imported_facts ?? {}) as Record<string, { import_field?: string }>;
        for (const fact of Object.values(facts)) if (fact.import_field) seen.add(fact.import_field);
        for (const [key, fact] of Object.entries(imported)) seen.add(fact.import_field ?? key);
      }
      expect(seen).toEqual(new Set(Object.keys(original.fields)));
    }
  });

  it("does not turn an OSM wheelchair tag into a measured door width", () => {
    const venue = readJson("import/real/venue.osm-node-238726675.json") as {
      id: string;
      tranche: "venue";
      fields: Record<string, { value: unknown }>;
    };
    const [place, entrance] = migrateImportRecord(venue) as Array<{
      facts: Record<string, { value: unknown }>;
      imported_facts: Record<string, { value: unknown }>;
    }>;
    expect(place?.facts.door_clear_width_mm).toBeUndefined();
    expect(entrance?.facts.door_clear_width_mm).toBeUndefined();
    expect(place?.imported_facts.wheelchair?.value).toBe("yes");
    expect(detectSchemaId(place)).toBe(canonicalSchemaId("place"));
  });
});

describe("freshness", () => {
  it("keeps a 400-day-old value in the headline and flags it stale", () => {
    const judgement = judgeFreshness({
      recordType: "place",
      counting: "canonical",
      tier: 3,
      observedAt: "2025-10-01",
      asOf: "2026-11-13",
    });
    expect(judgement.stale).toBe(true);
    expect(judgement.excludeFromHeadline).toBe(false);
  });

  it("marks a summer segment unverified in November without dropping it for age alone", () => {
    const judgement = judgeFreshness({
      recordType: "segment",
      counting: "canonical",
      tier: 2,
      observedAt: "2026-07-01",
      asOf: "2026-11-13",
    });
    expect(judgement.winterUnverified).toBe(true);
    expect(judgement.excludeFromHeadline).toBe(false);
    expect(judgement.estimate).toBe(true);
  });
});

describe("cli", () => {
  it("names each valid file as PASS and each invalid file as FAIL", async () => {
    const logs: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      logs.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    try {
      const valid = await runCli(["validate", path.join(fixtures, "valid"), path.join(fixtures, "import/real")]);
      const invalid = await runCli(["validate", path.join(fixtures, "invalid")]);
      expect(valid).toBe(0);
      expect(invalid).toBe(1);
    } finally {
      process.stdout.write = original;
    }
    const text = logs.join("");
    expect(text).toContain("PASS");
    expect(text).toContain("place.prototype-unverified.synthetic.json");
    expect(text).toContain("FAIL");
    expect(text).toContain("place.missing-tier.synthetic.json");
    expect(text).toContain("place.verified-without-evidence.synthetic.json");
  });
});
