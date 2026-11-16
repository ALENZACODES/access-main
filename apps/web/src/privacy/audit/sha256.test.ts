import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "./sha256";

const node = (s: string): string => createHash("sha256").update(s).digest("hex");

describe("sha256Hex", () => {
  it.each(["", "abc", "The quick brown fox jumps over the lazy dog", "é ’ « » 日本語 😀", "x".repeat(55), "x".repeat(56), "x".repeat(64), "x".repeat(1000)])(
    "matches Node for %#",
    (text) => {
      expect(sha256Hex(text)).toBe(node(text));
    },
  );
});
