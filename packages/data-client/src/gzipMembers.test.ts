import { gzipSync, gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { gzipMembers } from "./index.ts";

// The pack builder writes some parts as several gzip members joined end to end (osm-ontario *.p02 and others).
// Browsers' DecompressionStream reads only the first member, so the client splits them first.
const join = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.byteLength; }
  return out;
};

describe("gzipMembers", () => {
  it("returns a single member unchanged", async () => {
    const one = new Uint8Array(gzipSync("{\"id\":\"a\"}\n"));
    const members = await gzipMembers(one);
    expect(members).toHaveLength(1);
    expect(members[0]!.byteLength).toBe(one.byteLength);
  });

  it("splits concatenated members at their real boundaries", async () => {
    const a = new Uint8Array(gzipSync("first line\n".repeat(500)));
    const b = new Uint8Array(gzipSync("second line\n".repeat(700)));
    const c = new Uint8Array(gzipSync("third\n"));
    const members = await gzipMembers(join(a, b, c));
    expect(members.map((m) => m.byteLength)).toEqual([a.byteLength, b.byteLength, c.byteLength]);
    expect(members.map((m) => gunzipSync(m).toString()).join("")).toBe("first line\n".repeat(500) + "second line\n".repeat(700) + "third\n");
  });

  it("does not split at a gzip signature that appears inside the compressed data", async () => {
    const text = Array.from({ length: 4000 }, (_, i) => `row ${i} \u001f\u008b\u0008 ${Math.sin(i)}`).join("\n");
    const a = new Uint8Array(gzipSync(text));
    const b = new Uint8Array(gzipSync("tail\n"));
    const members = await gzipMembers(join(a, b));
    expect(members.map((m) => m.byteLength)).toEqual([a.byteLength, b.byteLength]);
  });
});
