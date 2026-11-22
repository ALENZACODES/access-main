// Behaviour audit for the three places in the App that make an identifier or read the browser's language on their
// own: the queue of reports (randomUUID), the protected copy (getRandomValues for the salt and the nonce) and the
// choice of the first language (navigator.language). It runs the real code and checks what comes out: that an id is
// random and does not hold the note, that two protected copies of the same text share nothing, and that the language
// read picks French or English and keeps nothing. It checks those three, not every caller of them.

import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detectLanguage } from "../../i18n/index";
import { db } from "../../storage/db";
import { enqueueReport, listOutbox } from "../../storage/repository";
import { DEFAULT_ITERATIONS, MIN_ITERATIONS, protect, unprotect } from "../panel/protectedBackup";
import type { CryptoLike } from "../panel/protectedBackup";

const NOW = "2026-11-21T12:00:00.000Z";
const CANARY = "zq7canary-note";
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("the id of a queued report", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("is a version 4 UUID", async () => expect((await enqueueReport(`${CANARY} one`, null, NOW)).id).toMatch(UUID_V4));
  it("is not the same for two reports with the same note and the same record", async () => {
    const a = await enqueueReport(CANARY, "record-1", NOW);
    const b = await enqueueReport(CANARY, "record-1", NOW);
    expect(a.id).not.toBe(b.id);
  });
  it("is different for 200 reports made at the same moment", async () => {
    const ids = new Set<string>();
    for (let i = 0; i < 200; i++) ids.add((await enqueueReport(`note ${i}`, null, NOW)).id);
    expect(ids.size).toBe(200);
  });
  it("does not hold the note, the record id or the time", async () => {
    const item = await enqueueReport(CANARY, "record-zq7", NOW, { observedAt: "2026-11-20T10:00:00.000Z" });
    const id = item.id.toLowerCase();
    expect(id).not.toContain("zq7");
    expect(id).not.toContain("canary");
    expect(id).not.toContain("2026");
    expect(id).not.toContain("1763");
  });
  it("is the id that is kept: the stored report has the returned id", async () => {
    const item = await enqueueReport(CANARY, null, NOW);
    const stored = await listOutbox();
    expect(stored.map((s) => s.id)).toEqual([item.id]);
  });
  it("is made before the note is read: a note that is refused leaves nothing in the queue", async () => {
    await expect(enqueueReport("", null, NOW)).rejects.toBeTruthy();
    expect(await listOutbox()).toEqual([]);
  });
  it("is the only identifier in the kept report: no other field looks like an id of the device", async () => {
    const item = await enqueueReport(CANARY, null, NOW);
    for (const [key, value] of Object.entries(item)) {
      if (key === "id") continue;
      expect(typeof value === "string" ? UUID_V4.test(value) : false, key).toBe(false);
    }
  });
  it("uses the randomUUID of the browser, once for each report", async () => {
    const spy = vi.spyOn(globalThis.crypto, "randomUUID");
    await enqueueReport("a", null, NOW);
    await enqueueReport("b", null, NOW);
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});

describe("the salt and the nonce of a protected copy", () => {
  const PASS = "a long passphrase that is fine";
  const PLAIN = `{"note":"${CANARY}"}`;
  const OPTS = { iterations: MIN_ITERATIONS };
  const fields = (text: string): { salt: string; iv: string; data: string; iterations: number } => JSON.parse(text) as never;
  const sealed = async (c: CryptoLike = globalThis.crypto): Promise<string> => {
    const r = await protect(PLAIN, PASS, "p", c, OPTS);
    if (!r.ok) throw new Error(`protect failed: ${r.code}`);
    return r.text;
  };

  it("asks the browser for exactly 16 bytes and then 12 bytes, and nothing else", async () => {
    const sizes: number[] = [];
    const spy: CryptoLike = {
      subtle: globalThis.crypto.subtle,
      getRandomValues: ((a: ArrayBufferView) => {
        sizes.push(a.byteLength);
        return globalThis.crypto.getRandomValues(a as Uint8Array);
      }) as Crypto["getRandomValues"],
    };
    await sealed(spy);
    expect(sizes).toEqual([16, 12]);
  });
  it("gives a different salt, nonce and body for the same text and passphrase", async () => {
    const a = fields(await sealed());
    const b = fields(await sealed());
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(a.data).not.toBe(b.data);
  });
  it("writes a salt and a nonce that are not all zero and not the same as each other", async () => {
    const f = fields(await sealed());
    expect(atob(f.salt)).toHaveLength(16);
    expect(atob(f.iv)).toHaveLength(12);
    expect(/^A+=*$/.test(f.salt)).toBe(false);
    expect(f.salt).not.toBe(f.iv);
  });
  it("does not write the text or the passphrase into the copy", async () => {
    const text = await sealed();
    expect(text).not.toContain(CANARY);
    expect(text).not.toContain(PASS);
    expect(text).not.toContain(btoa(CANARY));
  });
  it("opens with the passphrase and gives the text back, whatever the salt", async () => {
    for (let i = 0; i < 3; i++) {
      const r = await unprotect(await sealed(), PASS, "p", globalThis.crypto, { minIterations: MIN_ITERATIONS });
      expect(r).toEqual({ ok: true, plaintext: PLAIN });
    }
  });
  it("does not open with a different passphrase", async () => expect(await unprotect(await sealed(), `${PASS} x`, "p", globalThis.crypto)).toEqual({ ok: false, code: "cannot-open" }));
  it("a copy made with a fixed random source is the same each time, so the salt is the only thing that changes it", async () => {
    const fixed: CryptoLike = { subtle: globalThis.crypto.subtle, getRandomValues: ((a: ArrayBufferView) => (new Uint8Array(a.buffer, a.byteOffset, a.byteLength).fill(7), a)) as Crypto["getRandomValues"] };
    expect(await sealed(fixed)).toBe(await sealed(fixed));
  });
  it("says what it cannot do when the browser has no crypto", async () => expect(await protect(PLAIN, PASS, "p", undefined, OPTS)).toEqual({ ok: false, code: "unsupported" }));
  it("uses at least the lowest accepted number of rounds when none is given", () => expect(DEFAULT_ITERATIONS).toBeGreaterThanOrEqual(MIN_ITERATIONS));
});

describe("the first language read from the browser", () => {
  const stub = (language: unknown, stored: string | null = null): { reads: string[]; writes: string[] } => {
    const reads: string[] = [];
    const writes: string[] = [];
    vi.stubGlobal("navigator", { get language() { reads.push("language"); return language; } });
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => (k === "access.language" ? stored : null),
      setItem: (k: string) => void writes.push(k),
      removeItem: (k: string) => void writes.push(k),
    });
    return { reads, writes };
  };
  afterEach(() => vi.unstubAllGlobals());

  it.each([["fr", "fr"], ["fr-CA", "fr"], ["FR-ca", "fr"], ["en-CA", "en"], ["en", "en"], ["de", "en"], ["", "en"]])("%j gives %s", (language, expected) => {
    stub(language);
    expect(detectLanguage()).toBe(expected);
  });
  it("gives English when the browser gives no language, or a language that is not text", () => {
    stub(undefined);
    expect(detectLanguage()).toBe("en");
  });
  it("does not read the browser language when a language was chosen", () => {
    const s = stub("fr", "en");
    expect(detectLanguage()).toBe("en");
    expect(s.reads).toEqual([]);
  });
  it("reads it once when none was chosen", () => {
    const s = stub("fr");
    detectLanguage();
    expect(s.reads).toEqual(["language"]);
  });
  it("keeps nothing: it writes no storage key", () => {
    const s = stub("fr");
    detectLanguage();
    expect(s.writes).toEqual([]);
  });
  it("gives English when there is no navigator at all", () => {
    vi.stubGlobal("navigator", undefined);
    vi.stubGlobal("localStorage", undefined);
    expect(detectLanguage()).toBe("en");
  });
});
