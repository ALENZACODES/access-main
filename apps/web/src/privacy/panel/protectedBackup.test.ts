import { describe, expect, it } from "vitest";
import { DEFAULT_ITERATIONS, MAX_ITERATIONS, MAX_PROTECTED_BYTES, passphraseProblem, protect, unprotect, type CryptoLike } from "./protectedBackup";

const c: CryptoLike = globalThis.crypto;
const P = "app.";
const PASS = "correct horse battery";
const FAST = { iterations: 1000 };
const OPEN = { minIterations: 1000 };
const PLAIN = JSON.stringify({ format: "app-local-data", version: 1, prefix: P, items: { "app.a": "héllo ✓" } });

async function sealed(pass = PASS, plain = PLAIN): Promise<string> {
  const r = await protect(plain, pass, P, c, FAST);
  if (!r.ok) throw new Error(r.code);
  return r.text;
}

describe("passphraseProblem", () => {
  it.each([
    ["", "empty"],
    ["short", "too-short"],
    ["123456789", "too-short"],
    ["aaaaaaaaaaaa", "repeated"],
    ["Password123", "common"],
    ["MOTDEPASSE1", "common"],
    ["1234567890", "common"],
    ["correct horse", null],
    ["éééééééééé", "repeated"],
  ])("%j is %s", (p, want) => {
    expect(passphraseProblem(p)).toBe(want);
  });
  it("counts what a person sees, not UTF-16 units", () => {
    expect(passphraseProblem("😀😀😀😀😀😀😀😀😀")).toBe("too-short");
    expect(passphraseProblem("😀😁😂😃😄😅😆😇😈😉")).toBeNull();
  });
  it("treats composed and decomposed accents as the same", () => {
    expect(passphraseProblem("éééééééééé")).toBe("repeated");
  });
});

describe("protect and unprotect", () => {
  it("round-trips, including non-ASCII text", async () => {
    const r = await unprotect(await sealed(), PASS, P, c, OPEN);
    expect(r).toEqual({ ok: true, plaintext: PLAIN });
  });
  it("the file does not contain the plain text or the passphrase", async () => {
    const t = await sealed();
    expect(t).not.toContain("héllo");
    expect(t).not.toContain("app.a");
    expect(t).not.toContain(PASS);
    expect(JSON.parse(t)).toMatchObject({ format: "app-protected-data", version: 1, prefix: P, kdf: "PBKDF2-SHA-256", cipher: "AES-GCM-256", iterations: 1000 });
  });
  it("uses a new salt and nonce each time", async () => {
    const a = JSON.parse(await sealed()) as { salt: string; iv: string; data: string };
    const b = JSON.parse(await sealed()) as { salt: string; iv: string; data: string };
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(a.data).not.toBe(b.data);
  });
  it("a wrong passphrase cannot open it", async () => {
    expect(await unprotect(await sealed(), "wrong passphrase", P, c, OPEN)).toEqual({ ok: false, code: "cannot-open" });
  });
  it("the same text typed with composed or decomposed accents opens it", async () => {
    const t = await sealed("café au lait!");
    expect((await unprotect(t, "café au lait!", P, c, OPEN)).ok).toBe(true);
  });
  it("any change to the data, salt, iv, prefix or iteration count stops it opening", async () => {
    const f = JSON.parse(await sealed()) as Record<string, unknown>;
    const flip = (b64: string): string => {
      const bytes = atob(b64).split("");
      bytes[bytes.length - 1] = String.fromCharCode(bytes[bytes.length - 1]!.charCodeAt(0) ^ 1);
      return btoa(bytes.join(""));
    };
    for (const k of ["data", "salt", "iv"] as const) {
      const r = await unprotect(JSON.stringify({ ...f, [k]: flip(f[k] as string) }), PASS, P, c, OPEN);
      expect(r, k).toEqual({ ok: false, code: "cannot-open" });
    }
    expect(await unprotect(JSON.stringify({ ...f, iterations: 1001 }), PASS, P, c, OPEN)).toEqual({ ok: false, code: "cannot-open" });
  });
  it("a file made for another prefix is refused before any key work", async () => {
    expect(await unprotect(await sealed(), PASS, "other.", c, OPEN)).toEqual({ ok: false, code: "wrong-prefix" });
  });
  it("a file whose prefix was rewritten to match the opener still fails, because the prefix is covered by the integrity check", async () => {
    const f = JSON.parse(await sealed()) as Record<string, unknown>;
    expect(await unprotect(JSON.stringify({ ...f, prefix: "other." }), PASS, "other.", c, OPEN)).toEqual({ ok: false, code: "cannot-open" });
  });
  it("tells apart the ways a file can be wrong", async () => {
    const f = JSON.parse(await sealed()) as Record<string, unknown>;
    const open = (x: unknown): Promise<unknown> => unprotect(typeof x === "string" ? x : JSON.stringify(x), PASS, P, c, OPEN);
    expect(await open("{oops")).toEqual({ ok: false, code: "not-json" });
    expect(await open("[]")).toEqual({ ok: false, code: "wrong-format" });
    expect(await open({ ...f, format: "x" })).toEqual({ ok: false, code: "wrong-format" });
    expect(await open({ ...f, version: 2 })).toEqual({ ok: false, code: "wrong-version" });
    expect(await open({ ...f, kdf: "scrypt" })).toEqual({ ok: false, code: "bad-fields" });
    expect(await open({ ...f, salt: "AAAA" })).toEqual({ ok: false, code: "bad-fields" });
    expect(await open({ ...f, iv: "!!!!" })).toEqual({ ok: false, code: "bad-fields" });
    expect(await open({ ...f, data: 5 })).toEqual({ ok: false, code: "bad-fields" });
    expect(await open({ ...f, data: "AAAA" })).toEqual({ ok: false, code: "bad-fields" });
  });
  it("refuses a weak or absurd iteration count in a file", async () => {
    const f = JSON.parse(await sealed()) as Record<string, unknown>;
    expect(await unprotect(JSON.stringify({ ...f, iterations: 1000 }), PASS, P, c)).toEqual({ ok: false, code: "bad-fields" });
    for (const it of [0, -1, 1.5, "1000", MAX_ITERATIONS + 1]) {
      expect((await unprotect(JSON.stringify({ ...f, iterations: it }), PASS, P, c, OPEN)).ok, String(it)).toBe(false);
    }
  });
  it("refuses an oversized file without parsing it", async () => {
    expect(await unprotect("x".repeat(MAX_PROTECTED_BYTES + 1), PASS, P, c, OPEN)).toEqual({ ok: false, code: "too-large" });
  });
  it("refuses to make a copy with a poor passphrase or too much data", async () => {
    expect(await protect(PLAIN, "short", P, c, FAST)).toEqual({ ok: false, code: "too-short" });
    expect(await protect("x".repeat(1_000_001), PASS, P, c, FAST)).toEqual({ ok: false, code: "too-large" });
  });
  it("says so when the browser has no crypto", async () => {
    expect(await protect(PLAIN, PASS, P, undefined)).toEqual({ ok: false, code: "unsupported" });
    expect(await unprotect("{}", PASS, P, undefined)).toEqual({ ok: false, code: "unsupported" });
    expect(await protect(PLAIN, PASS, P, { getRandomValues: c.getRandomValues.bind(c), subtle: undefined as unknown as SubtleCrypto })).toEqual({ ok: false, code: "unsupported" });
  });
  it("uses a strong default iteration count", async () => {
    expect(DEFAULT_ITERATIONS).toBeGreaterThanOrEqual(300_000);
    const r = await protect(PLAIN, PASS, P, c);
    expect(r.ok && (JSON.parse(r.text) as { iterations: number }).iterations).toBe(DEFAULT_ITERATIONS);
    expect(r.ok && (await unprotect(r.text, PASS, P, c)).ok).toBe(true);
  });
});
