// Mutation audit: the real text of files that make identifiers or read the browser is changed in one small way, and
// the audit tools must notice. If a change that should be refused passes unseen, the tools are not looking. Each
// test starts from the real text in the tree, so it fails too if the file is moved or its line is rewritten.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compareIds, formatIdProblems } from "./idCompare";
import { flowsInFile, reachingNetwork } from "./idFlow";
import { ID_ACCEPTED } from "./idRegister";
import { auditSites } from "./idRules";
import { scanFile } from "./idScan";

const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));
const read = (path: string): { path: string; text: string } => ({ path, text: readFileSync(`${ROOT}${path}`, "utf8") });
const problems = (f: { path: string; text: string }): string[] => formatIdProblems(compareIds(auditSites(scanFile(f)), ID_ACCEPTED.filter((r) => r.path === f.path)));
const replaceOnce = (text: string, from: string, to: string): string => {
  expect(text, `the real text holds ${from}`).toContain(from);
  return text.replace(from, to);
};

describe("storage/repository.ts as it is", () => {
  const f = read("apps/web/src/storage/repository.ts");
  it("has no problem against its own rows", () => expect(problems(f)).toEqual([]));
  it("makes the id of a report with randomUUID", () => expect(scanFile(f).map((s) => s.kind)).toEqual(["uuid"]));

  it("is noticed when a second identifier is added", () => {
    const next = { ...f, text: `${f.text}\nexport const extra = (): string => crypto.randomUUID();\n` };
    expect(problems(next)).toEqual([expect.stringContaining("count-changed")]);
  });
  it("is noticed when randomUUID is swapped for Math.random on the line that makes the id", () => {
    const next = { ...f, text: replaceOnce(f.text, "id: crypto.randomUUID(),", "id: String(Math.random()),") };
    const found = problems(next).join("\n");
    expect(found).toContain("accepted-gone: id-uuid");
    expect(found).toContain("finding-not-accepted: id-math-random");
    expect(scanFile(next).map((s) => s.kind)).toEqual(["math-random"]);
  });
  it("is noticed when the id is stored with a Math.random value on one line, which is never accepted", () => {
    const next = { ...f, text: `${f.text}\nexport const bad = (): unknown => db.outbox.put({ id: Math.random() });\n` };
    const found = auditSites(scanFile(next)).map((x) => x.code);
    expect(found).toContain("id-math-random-moves");
    expect(compareIds(auditSites(scanFile(next)), ID_ACCEPTED).map((p) => p.code)).toContain("unacceptable-code");
  });
  it("is noticed when a high device read is added", () => {
    const next = { ...f, text: `${f.text}\nexport const cores = (): number => navigator.hardwareConcurrency;\n` };
    expect(problems(next).join("\n")).toContain("unacceptable-code");
  });
  it("is noticed when the id is used on a line with a network call", () => {
    const next = { ...f, text: `${f.text}\nexport const leak = async (): Promise<void> => {\n  const probe = crypto.randomUUID();\n  await fetch("/x", { body: probe });\n};\n` };
    expect(reachingNetwork(flowsInFile(next))).toHaveLength(1);
  });
  it("is not noticed as a problem when only a comment is added that names the APIs", () => {
    const next = { ...f, text: `// crypto.randomUUID() and Math.random() are described here\n${f.text}` };
    expect(problems(next)).toEqual([]);
  });
});

describe("privacy/panel/protectedBackup.ts as it is", () => {
  const f = read("apps/web/src/privacy/panel/protectedBackup.ts");
  it("has no problem against its own rows", () => expect(problems(f)).toEqual([]));
  it("makes the salt and the nonce with getRandomValues, two sites", () => expect(scanFile(f).map((s) => s.kind)).toEqual(["random-bytes", "random-bytes"]));
  it("is noticed when a third random call is added", () => expect(problems({ ...f, text: `${f.text}\nexport const x = (c: Crypto): Uint8Array => c.getRandomValues(new Uint8Array(4));\n` })).toEqual([expect.stringContaining("count-changed")]));
  it("is noticed when the nonce is made with Math.random instead", () => {
    const next = { ...f, text: replaceOnce(f.text, "const iv = c.getRandomValues(new Uint8Array(12));", "const iv = new Uint8Array(12).map(() => Math.random() * 256);") };
    expect(scanFile(next).map((s) => s.kind).sort()).toEqual(["math-random", "random-bytes"]);
    expect(problems(next).length).toBeGreaterThan(0);
  });
});

describe("privacy/panel/signals.ts as it is", () => {
  const f = read("apps/web/src/privacy/panel/signals.ts");
  it("has no problem against its own rows", () => expect(problems(f)).toEqual([]));
  it("reads three signals through the alias nav", () => expect(scanFile(f).map((s) => s.detail)).toEqual(["navigator.globalPrivacyControl", "navigator.doNotTrack", "navigator.cookieEnabled"]));
  it("is noticed when the alias is used to read the number of cores", () => {
    const next = { ...f, text: `${f.text}\nexport const cores = (h: { navigator?: Navigator }): unknown => { const nav = h.navigator; return nav?.hardwareConcurrency; };\n` };
    expect(problems(next).join("\n")).toContain("id-device-high");
  });
  it("is noticed when a fourth signal is read", () => expect(problems({ ...f, text: replaceOnce(f.text, "cookies: bool(nav?.cookieEnabled),", "cookies: bool(nav?.cookieEnabled), ua: nav?.userAgent,") })).toEqual([expect.stringContaining("count-changed")]));
});

describe("i18n/index.ts as it is", () => {
  const f = read("apps/web/src/i18n/index.ts");
  it("has no problem against its own rows", () => expect(problems(f)).toEqual([]));
  it("reads one language", () => expect(scanFile(f).map((s) => s.detail)).toEqual(["navigator.language"]));
  it("is noticed when the whole list of languages is read too", () => expect(problems({ ...f, text: `${f.text}\nexport const all = (): readonly string[] => globalThis.navigator.languages;\n` })).toEqual([expect.stringContaining("count-changed")]));
});
