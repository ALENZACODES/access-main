import { IDBFactory } from "fake-indexeddb";
import { createEmptyProfile } from "@access/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { demoProfile } from "./fixtures.ts";
import { CaregiverService } from "./service.ts";
import { IndexedDbStore, MemoryStore, type GrantStore } from "./store.ts";
import type { SnapshotField } from "./types.ts";
import { findForbiddenKeys } from "@access/shared";

let clock = Date.parse("2026-11-15T12:00:00.000Z");
let counter = 0;
const advance = (ms: number) => {
  clock += ms;
};
const HOUR = 3_600_000;

function make(store: GrantStore = new MemoryStore()) {
  return new CaregiverService({ store, now: () => new Date(clock), newId: () => `g-${String(++counter).padStart(8, "0")}` });
}

const journey = { kind: "journey_reference", journey_ref: "trip-1", label: "Clinic visit" } as const;
const profile = demoProfile();

beforeEach(() => {
  clock = Date.parse("2026-11-15T12:00:00.000Z");
  counter = 0;
});

describe("default deny", () => {
  it("shows an empty view that says why when nothing is granted", async () => {
    const service = make();
    const view = await service.caregiverView("Sam");
    expect(view.empty).toBe(true);
    expect(view.empty_reason).toBe("no_active_grants");
    expect(view.items).toEqual([]);
    expect(await service.auditLog()).toEqual([]);
  });

  it("shows nothing to a caregiver who has no grant, even when someone else does", async () => {
    const service = make();
    await service.createGrant({ caregiver_label: "Sam", scope: journey }, profile);
    expect((await service.caregiverView("Alex")).empty).toBe(true);
    expect((await service.caregiverView("")).empty).toBe(true);
  });

  it("does not match a name by prefix", async () => {
    const service = make();
    await service.createGrant({ caregiver_label: "Samantha", scope: journey }, profile);
    expect((await service.caregiverView("Sam")).empty).toBe(true);
  });
});

describe("grant", () => {
  it("lets a named caregiver see a journey reference and logs it", async () => {
    const service = make();
    const made = await service.createGrant({ caregiver_label: "  Sam ", scope: journey }, profile);
    expect(made.ok).toBe(true);
    const view = await service.caregiverView("sam");
    expect(view.empty).toBe(false);
    expect(view.items).toHaveLength(1);
    expect(view.items[0]?.scope).toEqual(journey);
    const log = await service.auditLog();
    expect(log.map((entry) => entry.action)).toEqual(["grant_created", "grant_viewed"]);
  });

  it("copies only the chosen equipment fields, at the time of the grant", async () => {
    const service = make();
    await service.createGrant({ caregiver_label: "Sam", scope: { kind: "equipment_snapshot", fields: ["chair_width_mm", "attendant_travels"] } }, profile);
    const changed = { ...profile, chair_width_mm: 900 };
    expect(changed.chair_width_mm).toBe(900);
    const view = await service.caregiverView("Sam");
    expect(view.items[0]?.scope).toEqual({ kind: "equipment_snapshot", snapshot: { chair_width_mm: 680, attendant_travels: true } });
    expect(JSON.stringify(view)).not.toContain("low_slope");
  });

  it("keeps an unset profile value as null, not zero or false", async () => {
    const service = make();
    await service.createGrant({ caregiver_label: "Sam", scope: { kind: "equipment_snapshot", fields: ["chair_length_mm", "attendant_travels"] } }, createEmptyProfile("2026-01-01T00:00:00.000Z", "en"));
    const view = await service.caregiverView("Sam");
    expect(view.items[0]?.scope).toEqual({ kind: "equipment_snapshot", snapshot: { chair_length_mm: null, attendant_travels: null } });
  });

  it("refuses scopes that are not on the list, empty snapshots and contact details", async () => {
    const service = make();
    const bad = [
      { caregiver_label: "Sam", scope: { kind: "full_profile" } },
      { caregiver_label: "Sam", scope: { kind: "equipment_snapshot", fields: [] } },
      { caregiver_label: "Sam", scope: { kind: "equipment_snapshot", fields: ["routing_preference"] } },
      { caregiver_label: "sam@example.com", scope: journey },
      { caregiver_label: "   ", scope: journey },
    ];
    for (const input of bad) {
      const result = await service.createGrant(input as never, profile);
      expect(result.ok).toBe(false);
    }
    expect(await service.listGrants()).toEqual([]);
    expect(await service.auditLog()).toEqual([]);
  });

  it("refuses an end date in the past", async () => {
    const service = make();
    const result = await service.createGrant({ caregiver_label: "Sam", scope: journey, expires_at: new Date(clock - HOUR).toISOString() }, profile);
    expect(result).toMatchObject({ ok: false, code: "invalid_input" });
  });

  it("refuses a profile that does not validate", async () => {
    const service = make();
    const result = await service.createGrant({ caregiver_label: "Sam", scope: journey }, { ...profile, chair_width_mm: -1 });
    expect(result).toMatchObject({ ok: false, code: "profile_invalid" });
  });
});

describe("narrow", () => {
  const fields: SnapshotField[] = ["equipment_type_general", "chair_width_mm", "transfer_side_preference"];

  it("removes fields and the caregiver stops seeing them", async () => {
    const service = make();
    const made = await service.createGrant({ caregiver_label: "Sam", scope: { kind: "equipment_snapshot", fields } }, profile);
    if (!made.ok) throw new Error("setup");
    const narrowed = await service.narrowGrant(made.value.grant_id, { remove_fields: ["transfer_side_preference"] });
    expect(narrowed.ok).toBe(true);
    const view = await service.caregiverView("Sam");
    expect(view.items[0]?.scope).toEqual({ kind: "equipment_snapshot", snapshot: { equipment_type_general: "power_chair", chair_width_mm: 680 } });
    const entry = (await service.auditLog()).find((item) => item.action === "grant_narrowed");
    expect(entry?.fields_removed).toEqual(["transfer_side_preference"]);
  });

  it("cannot widen, remove everything, or narrow a journey reference", async () => {
    const service = make();
    const made = await service.createGrant({ caregiver_label: "Sam", scope: { kind: "equipment_snapshot", fields: ["chair_width_mm"] } }, profile);
    const other = await service.createGrant({ caregiver_label: "Sam", scope: journey }, profile);
    if (!made.ok || !other.ok) throw new Error("setup");
    expect(await service.narrowGrant(made.value.grant_id, { remove_fields: ["attendant_travels"] })).toMatchObject({ ok: false, code: "not_a_narrowing" });
    expect(await service.narrowGrant(made.value.grant_id, { remove_fields: ["chair_width_mm"] })).toMatchObject({ ok: false, code: "would_be_empty" });
    expect(await service.narrowGrant(other.value.grant_id, { remove_fields: ["chair_width_mm"] })).toMatchObject({ ok: false, code: "not_narrowable" });
    expect(await service.narrowGrant(other.value.grant_id, {})).toMatchObject({ ok: false, code: "invalid_input" });
  });

  it("only shortens the end date", async () => {
    const service = make();
    const later = new Date(clock + 10 * HOUR).toISOString();
    const sooner = new Date(clock + 2 * HOUR).toISOString();
    const made = await service.createGrant({ caregiver_label: "Sam", scope: journey, expires_at: later }, profile);
    if (!made.ok) throw new Error("setup");
    expect(await service.narrowGrant(made.value.grant_id, { expires_at: new Date(clock + 20 * HOUR).toISOString() })).toMatchObject({ ok: false, code: "not_a_narrowing" });
    expect(await service.narrowGrant(made.value.grant_id, { expires_at: sooner })).toMatchObject({ ok: true });
    advance(3 * HOUR);
    expect((await service.caregiverView("Sam")).empty).toBe(true);
  });

  it("can put an end date on a grant that had none", async () => {
    const service = make();
    const made = await service.createGrant({ caregiver_label: "Sam", scope: journey }, profile);
    if (!made.ok) throw new Error("setup");
    expect(await service.narrowGrant(made.value.grant_id, { expires_at: new Date(clock + HOUR).toISOString() })).toMatchObject({ ok: true });
  });
});

describe("revoke", () => {
  it("empties the caregiver view and refuses every later use", async () => {
    const service = make();
    const made = await service.createGrant({ caregiver_label: "Sam", scope: journey }, profile);
    if (!made.ok) throw new Error("setup");
    const id = made.value.grant_id;
    expect((await service.useGrant(id, "Sam")).ok).toBe(true);
    expect((await service.revokeGrant(id)).ok).toBe(true);
    expect(await service.useGrant(id, "Sam")).toMatchObject({ ok: false, code: "revoked" });
    const view = await service.caregiverView("Sam");
    expect(view).toMatchObject({ empty: true, empty_reason: "no_active_grants", items: [] });
    expect(await service.narrowGrant(id, { expires_at: new Date(clock + HOUR).toISOString() })).toMatchObject({ ok: false, code: "revoked" });
  });

  it("is refused twice without a second log line", async () => {
    const service = make();
    const made = await service.createGrant({ caregiver_label: "Sam", scope: journey }, profile);
    if (!made.ok) throw new Error("setup");
    await service.revokeGrant(made.value.grant_id);
    const before = (await service.auditLog()).length;
    expect(await service.revokeGrant(made.value.grant_id)).toMatchObject({ ok: false, code: "already_revoked" });
    expect(await service.revokeGrant("g-99999999")).toMatchObject({ ok: false, code: "not_found" });
    expect((await service.auditLog()).length).toBe(before);
  });

  it("does not touch another caregiver's grant", async () => {
    const service = make();
    const sam = await service.createGrant({ caregiver_label: "Sam", scope: journey }, profile);
    await service.createGrant({ caregiver_label: "Alex", scope: journey }, profile);
    if (!sam.ok) throw new Error("setup");
    await service.revokeGrant(sam.value.grant_id);
    expect((await service.caregiverView("Alex")).empty).toBe(false);
  });
});

describe("use and end", () => {
  it("refuses a grant that belongs to someone else, an unknown grant and an ended grant, and logs each", async () => {
    const service = make();
    const made = await service.createGrant({ caregiver_label: "Sam", scope: journey, expires_at: new Date(clock + HOUR).toISOString() }, profile);
    if (!made.ok) throw new Error("setup");
    expect(await service.useGrant(made.value.grant_id, "Alex")).toMatchObject({ ok: false, code: "wrong_caregiver" });
    expect(await service.useGrant("g-12345678", "Sam")).toMatchObject({ ok: false, code: "unknown_grant" });
    advance(2 * HOUR);
    expect(await service.useGrant(made.value.grant_id, "Sam")).toMatchObject({ ok: false, code: "expired" });
    const denied = (await service.auditLog()).filter((entry) => entry.action === "access_denied");
    expect(denied.map((entry) => entry.reason)).toEqual(["wrong_caregiver", "unknown_grant", "expired"]);
    expect(denied.every((entry) => entry.outcome === "denied")).toBe(true);
    expect((await service.listGrants())[0]?.status).toBe("expired");
  });
});

describe("owner audit log", () => {
  it("lists every grant, change and use, in order, with nothing health-related", async () => {
    const service = make();
    const made = await service.createGrant({ caregiver_label: "Sam", scope: { kind: "equipment_snapshot", fields: ["chair_width_mm", "chair_length_mm"] } }, profile);
    if (!made.ok) throw new Error("setup");
    advance(HOUR);
    await service.narrowGrant(made.value.grant_id, { remove_fields: ["chair_length_mm"] });
    await service.caregiverView("Sam");
    await service.revokeGrant(made.value.grant_id);
    await service.useGrant(made.value.grant_id, "Sam");
    const log = await service.auditLog();
    expect(log.map((entry) => entry.action)).toEqual(["grant_created", "grant_narrowed", "grant_viewed", "grant_revoked", "access_denied"]);
    expect(log.map((entry) => entry.seq)).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(log.map((entry) => entry.entry_id)).size).toBe(5);
    expect(findForbiddenKeys(log)).toEqual([]);
    expect(findForbiddenKeys(await service.listGrants())).toEqual([]);
  });
});

describe("storage", () => {
  it("keeps grants and the log in IndexedDB across a reopen", async () => {
    const factory = new IDBFactory();
    const first = new IndexedDbStore({ factory });
    const service = make(first);
    await service.createGrant({ caregiver_label: "Sam", scope: journey }, profile);
    await first.close();
    const second = make(new IndexedDbStore({ factory }));
    expect((await second.caregiverView("Sam")).items).toHaveLength(1);
    expect((await second.auditLog()).map((entry) => entry.action)).toEqual(["grant_created", "grant_viewed"]);
  });

  it("fails closed on stored data that does not validate", async () => {
    const store = new MemoryStore();
    await store.save({ grants: [{ grant_id: "bad" } as never], audit: [] });
    const service = make(store);
    await expect(service.caregiverView("Sam")).rejects.toThrow("caregiver_state_invalid");
    await store.save({ grants: [], audit: [{ seq: 2 } as never] });
    await expect(service.auditLog()).rejects.toThrow("caregiver_state_invalid");
  });

  it("serialises overlapping calls so no log line is lost", async () => {
    const service = make();
    await Promise.all(["Sam", "Alex", "Jo"].map((name) => service.createGrant({ caregiver_label: name, scope: journey }, profile)));
    expect((await service.auditLog()).map((entry) => entry.seq)).toEqual([1, 2, 3]);
  });
});
