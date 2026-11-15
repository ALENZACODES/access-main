import { describe, expect, it } from "vitest";
import { ConsentError, createConsentEngine, type ConsentErrorCode } from "./engine.ts";
import { PURPOSES } from "./purposes.ts";
import { createLocalStorageStore, createMemoryStore, type ConsentStore } from "./store.ts";
import type { Purpose } from "./types.ts";

const ID = "store-preferences-on-device";

function clock(start = Date.UTC(2026, 0, 2, 3, 4, 5)) {
  let tick = start;
  return () => new Date((tick += 1000));
}

function expectCode(fn: () => unknown, code: ConsentErrorCode) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ConsentError);
    expect((error as ConsentError).code).toBe(code);
    return;
  }
  throw new Error(`expected ConsentError ${code}`);
}

function bump(purposes: readonly Purpose[], id: string): Purpose[] {
  return purposes.map((p) =>
    p.id === id ? { ...p, version: p.version + 1, description: { ...p.description, en: `${p.description.en} Now also something new.` } } : p,
  );
}

describe("default state", () => {
  it("is not granted for every purpose, and nothing is recorded", () => {
    const engine = createConsentEngine({ purposes: PURPOSES, store: createMemoryStore() });
    for (const purpose of engine.listPurposes()) {
      const state = engine.currentState(purpose.id);
      expect(state.status).toBe("not_asked");
      expect(state.granted).toBe(false);
      expect(state.decidedAt).toBeNull();
    }
    expect(engine.auditLog()).toEqual([]);
  });

  it("rejects an unknown purpose, a bad purpose and duplicate ids", () => {
    const engine = createConsentEngine({ purposes: PURPOSES, store: createMemoryStore() });
    expectCode(() => engine.currentState("nope"), "unknown_purpose");
    expectCode(() => engine.grant("nope", 1), "unknown_purpose");
    expectCode(() => createConsentEngine({ purposes: [{ ...PURPOSES[0]!, version: 0 }], store: createMemoryStore() }), "invalid_purpose");
    expectCode(() => createConsentEngine({ purposes: [PURPOSES[0]!, PURPOSES[0]!], store: createMemoryStore() }), "duplicate_purpose");
  });
});

describe("grant, refuse and revoke", () => {
  it("grants only the version the person was shown", () => {
    const engine = createConsentEngine({ purposes: PURPOSES, store: createMemoryStore(), now: clock() });
    expectCode(() => engine.grant(ID, 2), "version_mismatch");
    expect(engine.currentState(ID).granted).toBe(false);
    const record = engine.grant(ID, 1);
    expect(record).toMatchObject({ decision: "granted", purpose_id: ID, purpose_version: 1, seq: 1 });
    expect(engine.currentState(ID)).toMatchObject({ status: "granted", granted: true, decidedVersion: 1 });
    expectCode(() => engine.grant(ID, 1), "already_granted");
  });

  it("records an explicit refusal and does not repeat it", () => {
    const engine = createConsentEngine({ purposes: PURPOSES, store: createMemoryStore(), now: clock() });
    engine.refuse(ID);
    expect(engine.currentState(ID)).toMatchObject({ status: "refused", granted: false });
    expectCode(() => engine.refuse(ID), "already_refused");
    engine.grant(ID, 1);
    expect(engine.currentState(ID).granted).toBe(true);
  });

  it("revokes a grant and then needs a new grant", () => {
    const engine = createConsentEngine({ purposes: PURPOSES, store: createMemoryStore(), now: clock() });
    expectCode(() => engine.revoke(ID), "not_granted");
    engine.grant(ID, 1);
    expectCode(() => engine.refuse(ID), "currently_granted");
    const revocation = engine.revoke(ID);
    expect(revocation).toMatchObject({ revokes_seq: 1, purpose_version: 1, seq: 2 });
    expect(engine.currentState(ID)).toMatchObject({ status: "revoked", granted: false });
    expectCode(() => engine.revoke(ID), "not_granted");
    engine.grant(ID, 1);
    expect(engine.currentState(ID).granted).toBe(true);
  });

  it("keeps purposes independent", () => {
    const engine = createConsentEngine({ purposes: PURPOSES, store: createMemoryStore(), now: clock() });
    engine.grant(ID, 1);
    expect(engine.currentState("keep-places-offline").granted).toBe(false);
  });
});

describe("changed purpose text", () => {
  it("invalidates a prior grant until the person grants again", () => {
    const store = createMemoryStore();
    const v1 = createConsentEngine({ purposes: PURPOSES, store, now: clock() });
    v1.grant(ID, 1);
    expect(v1.currentState(ID).granted).toBe(true);

    const v2 = createConsentEngine({ purposes: bump(PURPOSES, ID), store, now: clock(Date.UTC(2026, 1, 1)) });
    expect(v2.currentState(ID)).toMatchObject({ status: "outdated", granted: false, decidedVersion: 1, currentVersion: 2 });
    expectCode(() => v2.grant(ID, 1), "version_mismatch");

    v2.grant(ID, 2);
    expect(v2.currentState(ID)).toMatchObject({ status: "granted", granted: true, decidedVersion: 2 });
    // Other purposes are untouched.
    expect(v2.currentState("keep-places-offline").status).toBe("not_asked");
  });

  it("lets the person revoke or refuse an outdated grant", () => {
    const store = createMemoryStore();
    createConsentEngine({ purposes: PURPOSES, store, now: clock() }).grant(ID, 1);
    const revoked = createConsentEngine({ purposes: bump(PURPOSES, ID), store, now: clock() });
    expect(revoked.revoke(ID).purpose_version).toBe(1);
    expect(revoked.currentState(ID).granted).toBe(false);

    const store2 = createMemoryStore();
    createConsentEngine({ purposes: PURPOSES, store: store2, now: clock() }).grant(ID, 1);
    const refused = createConsentEngine({ purposes: bump(PURPOSES, ID), store: store2, now: clock() });
    refused.refuse(ID);
    expect(refused.currentState(ID)).toMatchObject({ status: "refused", decidedVersion: 2 });
  });
});

describe("audit log", () => {
  it("is append-only, ordered, and holds only ids, versions and times", () => {
    const engine = createConsentEngine({ purposes: PURPOSES, store: createMemoryStore(), now: clock() });
    engine.grant(ID, 1);
    engine.refuse("keep-places-offline");
    engine.revoke(ID);
    const log = engine.auditLog();
    expect(log.map((e) => [e.seq, e.action, e.purpose_id])).toEqual([
      [1, "grant", ID],
      [2, "refuse", "keep-places-offline"],
      [3, "revoke", ID],
    ]);
    expect(Object.keys(log[0]!).sort()).toEqual(["action", "at", "purpose_id", "purpose_version", "record_type", "schema_version", "seq"]);
    expect(engine.auditLog(ID)).toHaveLength(2);
    log.pop();
    log[0]!.action = "revoke";
    expect(engine.auditLog()).toHaveLength(3);
    expect(engine.auditLog()[0]!.action).toBe("grant");
  });

  it("does not log a failed action", () => {
    const engine = createConsentEngine({ purposes: PURPOSES, store: createMemoryStore(), now: clock() });
    expectCode(() => engine.grant(ID, 9), "version_mismatch");
    expectCode(() => engine.revoke(ID), "not_granted");
    expect(engine.auditLog()).toEqual([]);
  });
});

describe("storage", () => {
  it("restores state from a new engine on the same store", () => {
    const store = createMemoryStore();
    const first = createConsentEngine({ purposes: PURPOSES, store, now: clock() });
    first.grant(ID, 1);
    first.revoke(ID);
    first.grant(ID, 1);
    const second = createConsentEngine({ purposes: PURPOSES, store, now: clock() });
    expect(second.currentState(ID).granted).toBe(true);
    expect(second.auditLog()).toHaveLength(3);
    second.revoke(ID);
    expect(second.auditLog().at(-1)?.seq).toBe(4);
  });

  it("round-trips through localStorage and keeps the data on the device", () => {
    const data = new Map<string, string>();
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    createConsentEngine({ purposes: PURPOSES, store: createLocalStorageStore(storage), now: clock() }).grant(ID, 1);
    expect([...data.keys()]).toEqual(["app.consent.v1"]);
    const again = createConsentEngine({ purposes: PURPOSES, store: createLocalStorageStore(storage) });
    expect(again.persistent).toBe(true);
    expect(again.currentState(ID).granted).toBe(true);
  });

  it("fails closed on unreadable or tampered data", () => {
    for (const raw of ["unreadable", { schema_version: "x" }, 42]) {
      const engine = createConsentEngine({ purposes: PURPOSES, store: createMemoryStore(raw) });
      expect(engine.currentState(ID).granted).toBe(false);
      expect(engine.integrityIssues()).toEqual(["store_unreadable"]);
    }
    // A dropped revocation must not bring an older grant back.
    const store = createMemoryStore();
    const first = createConsentEngine({ purposes: PURPOSES, store, now: clock() });
    first.grant(ID, 1);
    first.revoke(ID);
    const saved = store.load() as { events: Array<Record<string, unknown>> };
    saved.events[1] = { ...saved.events[1], revoked_at: "not a time" };
    const tampered = createConsentEngine({ purposes: PURPOSES, store: createMemoryStore(saved) });
    expect(tampered.currentState(ID).granted).toBe(false);
    expect(tampered.integrityIssues()).toEqual(["event_1_invalid"]);
    // New choices still work, and numbering does not reuse a number.
    expect(tampered.grant(ID, 1).seq).toBe(3);
  });

  it("does not change state or log when saving fails", () => {
    let failing = false;
    const inner = createMemoryStore();
    const store: ConsentStore = {
      persistent: true,
      load: () => inner.load(),
      save: (state) => {
        if (failing) throw new Error("quota");
        inner.save(state);
      },
    };
    const engine = createConsentEngine({ purposes: PURPOSES, store, now: clock() });
    failing = true;
    expectCode(() => engine.grant(ID, 1), "storage_failed");
    expect(engine.currentState(ID).granted).toBe(false);
    expect(engine.auditLog()).toEqual([]);
    failing = false;
    expect(engine.grant(ID, 1).seq).toBe(1);
  });
});
