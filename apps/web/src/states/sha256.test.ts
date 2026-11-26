import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { lcg } from "./placeFixtures";
import { sha256, sha256Hex, toHex, utf8Bytes } from "./sha256";

const node = (data: Uint8Array | string): string => createHash("sha256").update(data).digest("hex");

describe("sha256 against published vectors", () => {
  it("hashes the empty string", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
  it("hashes abc", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("hashes the 448-bit message from FIPS 180-4", () => {
    expect(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
  });
  it("hashes the 896-bit message from FIPS 180-4", () => {
    const m = "abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu";
    expect(sha256Hex(m)).toBe("cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1");
  });
  it("hashes one million letters a", () => {
    expect(sha256Hex("a".repeat(1_000_000))).toBe("cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0");
  });
  it("hashes the pangram, and is sensitive to a single character", () => {
    expect(sha256Hex("The quick brown fox jumps over the lazy dog")).toBe("d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592");
    expect(sha256Hex("The quick brown fox jumps over the lazy dog.")).toBe("ef537f25c895bfa782526529a9b63d97aa631564d5d789c2b765448c8635fb6c");
  });
});

describe("sha256 padding edges", () => {
  // 55 bytes fits one block, 56 needs a second for the length, 64 and 119/120 are the next edges.
  it.each([0, 1, 54, 55, 56, 57, 63, 64, 65, 118, 119, 120, 121, 127, 128, 129, 191, 192, 1000])("matches Node for %i bytes", (n) => {
    const data = Uint8Array.from({ length: n }, (_, i) => (i * 31 + 7) & 0xff);
    expect(toHex(sha256(data))).toBe(node(data));
  });
  it("matches Node for random lengths and contents", () => {
    const next = lcg(20261121);
    for (let i = 0; i < 200; i += 1) {
      const data = Uint8Array.from({ length: Math.floor(next() * 400) }, () => Math.floor(next() * 256));
      expect(toHex(sha256(data)), `case ${i} (${data.length} bytes)`).toBe(node(data));
    }
  });
  it("does not change its input", () => {
    const data = Uint8Array.from([1, 2, 3, 4, 5]);
    sha256(data);
    expect(Array.from(data)).toEqual([1, 2, 3, 4, 5]);
  });
  it("always returns 32 bytes and 64 lowercase hex characters", () => {
    expect(sha256(new Uint8Array(0))).toHaveLength(32);
    expect(sha256Hex("x")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("utf8Bytes", () => {
  const enc = new TextEncoder();
  it.each(["", "abc", "café", "東京カフェ", "😀 emoji", "a\u0000b", "\u00a0\u202f", "Tom & Jerry's <b>\"x\"</b>"])("matches the platform encoder for %j", (s) => {
    expect(Array.from(utf8Bytes(s))).toEqual(Array.from(enc.encode(s)));
  });
  it("turns a lone surrogate into U+FFFD like the platform does", () => {
    for (const s of ["\ud800", "\udc00", "a\ud800b", "\ud800\ud800", "\udc00\ud800"]) {
      expect(Array.from(utf8Bytes(s)), JSON.stringify(s)).toEqual(Array.from(enc.encode(s)));
    }
  });
  it("hashes text the same as Node does for the same string", () => {
    for (const s of ["café", "東京", "😀", "x".repeat(300)]) expect(sha256Hex(s)).toBe(node(s));
  });
});

describe("toHex", () => {
  it("pads every byte to two characters", () => {
    expect(toHex(Uint8Array.from([0, 1, 15, 16, 255]))).toBe("00010f10ff");
    expect(toHex(new Uint8Array(0))).toBe("");
  });
});
