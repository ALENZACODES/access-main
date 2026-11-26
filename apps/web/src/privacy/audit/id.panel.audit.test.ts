// CI audit: the plain-words list that the privacy panel can show (panel/identifierRegister.ts) is the same as what
// the scan of the source finds and the accepted list holds: the same files, the same number of places in each, and a
// "kept" answer that fits what the accepted reason says. A new place that makes a random value or reads the browser
// fails here until the list in plain words is changed too. The list is not shown in the panel by this audit.

import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ID_ACCEPTED } from "./idRegister";
import { auditSites } from "./idRules";
import { scanIds } from "./idScan";
import { loadFiles } from "./repoFiles";
import { IDENTIFIER_REGISTER, checkIdentifierRegister, identifierKeptCounts, identifierTotal } from "../panel/identifierRegister";

const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));
const findings = auditSites(scanIds(loadFiles(ROOT, ["apps/web/src"])));
const perFile = (): Map<string, number> => {
  const m = new Map<string, number>();
  for (const f of findings) m.set(f.path, (m.get(f.path) ?? 0) + 1);
  return m;
};

describe("the plain-words list", () => {
  it("has no problem of its own", () => expect(checkIdentifierRegister(IDENTIFIER_REGISTER)).toEqual([]));
  it("lists the same files as the scan finds", () => expect(IDENTIFIER_REGISTER.map((r) => r.path)).toEqual([...perFile().keys()].sort()));
  it("has the same number of places in each file as the scan finds", () => {
    const found = perFile();
    for (const r of IDENTIFIER_REGISTER) expect(r.count, r.path).toBe(found.get(r.path));
  });
  it("adds up to the number of findings and to the accepted rows", () => {
    expect(identifierTotal(IDENTIFIER_REGISTER)).toBe(findings.length);
    expect(identifierTotal(IDENTIFIER_REGISTER)).toBe(ID_ACCEPTED.reduce((n, r) => n + r.count, 0));
  });
  it("has the same files as the accepted list", () => expect(IDENTIFIER_REGISTER.map((r) => r.path)).toEqual([...new Set(ID_ACCEPTED.map((r) => r.path))].sort()));
});

describe("what the list says is kept", () => {
  const codesOf = (path: string): string[] => ID_ACCEPTED.filter((r) => r.path === path).map((r) => r.code);
  it("says a random number is kept on the device only where the accepted reason says it is an id of a record that is kept", () => {
    for (const r of IDENTIFIER_REGISTER.filter((x) => x.kept === "on-device")) {
      const reasons = ID_ACCEPTED.filter((a) => a.path === r.path).map((a) => a.reason).join(" ");
      expect(reasons, r.path).toMatch(/kept on the device|queued report on the device|id of a report|id of a record/i);
    }
  });
  it("says a value is not kept only where the accepted reason says it is not kept or not stored", () => {
    for (const r of IDENTIFIER_REGISTER.filter((x) => x.kept === "not-kept")) {
      const reasons = ID_ACCEPTED.filter((a) => a.path === r.path).map((a) => a.reason).join(" ");
      expect(reasons, r.path).toMatch(/not kept|is not kept or sent|data attribute|only when no language|does not store/i);
    }
  });
  it("says a value is written into a copy only for the salt and the nonce", () => {
    const inCopy = IDENTIFIER_REGISTER.filter((r) => r.kept === "in-copy");
    expect(inCopy.map((r) => r.path)).toEqual(["apps/web/src/privacy/panel/protectedBackup.ts"]);
    expect(codesOf(inCopy[0]?.path ?? "")).toEqual(["id-random-bytes"]);
  });
  it("makes a device read 'shown only' or 'not kept', never 'on this device'", () => {
    for (const r of IDENTIFIER_REGISTER) if (codesOf(r.path).every((c) => c === "id-device-low")) expect(["shown-only", "not-kept"], r.path).toContain(r.kept);
  });
  it("counts the places that are kept on the device", () => {
    const k = identifierKeptCounts(IDENTIFIER_REGISTER);
    expect(k["on-device"]).toBe(5);
    expect(k["in-copy"]).toBe(2);
    expect(k["on-device"] + k["in-copy"] + k["shown-only"] + k["not-kept"]).toBe(identifierTotal(IDENTIFIER_REGISTER));
  });
});
