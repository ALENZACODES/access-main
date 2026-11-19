import { describe, expect, it } from "vitest";
import { containsForbiddenOrg, endorsedByForbiddenOrgSample, forbiddenOrgNeedles } from "../../../../../packages/shared/test/forbiddenOrg.ts";
import { auditFiles, formatFindings, nameFindings, scanFile, type Exemption, type SourceFile } from "./repoAudit";

// Violating text for the other rules is assembled from pieces so this file does not trip the audit itself.
const j = (...p: string[]): string => p.join("");
const file = (path: string, text: string): SourceFile => ({ path, text });
const rules = (path: string, text: string): string[] => scanFile(file(path, text)).map((f) => f.rule);

describe("forbidden names", () => {
  // The names are never written here: samples and needles come from the shared helper.
  const sample = endorsedByForbiddenOrgSample("en");
  it("finds a line that carries a listed name, in any case, on the right line", () => {
    expect(nameFindings(`a\nb ${sample.toUpperCase()} c`)).toEqual([{ line: 2 }]);
  });
  it("finds the French sample too", () => {
    expect(nameFindings(endorsedByForbiddenOrgSample("fr"))).toEqual([{ line: 1 }]);
  });
  it("does not flag ordinary text", () => {
    expect(nameFindings("const decision = 'precision';\nSaved places stay on this device.")).toEqual([]);
  });
  it("uses the needles it is given", () => {
    expect(nameFindings("one\ntwo", ["two"])).toEqual([{ line: 2 }]);
    expect(nameFindings("one\ntwo", [""])).toEqual([]);
  });
  it("is wired into the file scan and reports no name", () => {
    const f = scanFile(file("apps/web/src/a.ts", sample));
    expect(f.map((x) => x.rule)).toEqual(["forbidden-name"]);
    expect(f[0]?.detail).toBe("outside organisation name");
    expect(JSON.stringify(f)).not.toContain(sample);
  });
  it("agrees with the shared helper", () => {
    expect(containsForbiddenOrg(sample)).toBe(true);
    expect(forbiddenOrgNeedles().length).toBeGreaterThan(0);
  });
});

describe("third-party tiles and trackers", () => {
  it.each([j("tile.", "openstreetmap.org"), j("api.", "mapbox.com"), j("maps.", "googleapis.com"), j("basemaps.", "cartocdn.com")])(
    "flags tile host %s",
    (host) => {
      expect(rules("apps/web/src/map.ts", `fetch("https://${host}/x")`)).toContain("third-party-tiles");
    },
  );
  it.each([j("google-", "analytics.com"), j("googletag", "manager.com"), j("hot", "jar.com"), j("mix", "panel.com")])(
    "flags tracker host %s",
    (host) => {
      expect(rules("apps/web/index.html", `<script src="https://${host}/t.js"></script>`)).toContain("tracker-host");
    },
  );
  it("reports the line number", () => {
    const f = scanFile(file("apps/web/src/m.ts", `a\nb\nfetch("https://${j("tile.", "openstreetmap.org")}/1")`));
    expect(f[0]?.line).toBe(3);
  });
});

describe("secrets", () => {
  it.each([
    ["AWS key", j("AK", "IA", "ABCDEFGHIJKLMNOP")],
    ["private key", j("-----BEGIN RSA PRIV", "ATE KEY-----")],
    ["GitHub token", j("gh", "p_", "a".repeat(36))],
    ["live payment key", j("sk_", "live_", "abcdefghijklmnop1234")],
    ["Slack token", j("xo", "xb-", "1234567890-abcdef")],
    ["literal credential", j("api_", "key = '", "A".repeat(24), "'")],
  ])("flags a %s", (_name, text) => {
    expect(rules("apps/web/src/c.ts", text)).toContain("secret");
  });
  it("ignores short values and ordinary code", () => {
    expect(rules("apps/web/src/c.ts", "const token = 'abc'; const apiKeyName = 'x';")).toEqual([]);
  });
});

describe("insecure urls", () => {
  it("flags plain http to a real host", () => {
    expect(rules("apps/web/src/a.ts", j("fetch('http", "://example.org/a')"))).toContain("insecure-url");
  });
  it("allows localhost and XML namespace identifiers", () => {
    expect(rules("apps/web/src/a.ts", j("'http", "://localhost:3000' 'http", "://www.w3.org/2000/svg'"))).toEqual([]);
  });
});

describe("scheduled workflows", () => {
  const wf = ".github/workflows/ci.yml";
  it("flags a cron schedule and a schedule trigger", () => {
    expect(rules(wf, "on:\n  schedule:\n    - cron: '0 0 * * *'\n")).toEqual(["scheduled-workflow", "scheduled-workflow"]);
  });
  it("accepts push and pull_request triggers", () => {
    expect(rules(wf, "on:\n  push:\n  pull_request:\njobs:\n  t:\n    runs-on: ubuntu-latest\n")).toEqual([]);
  });
  it("does not apply to other files", () => {
    expect(rules("docs/x.yml", "cron: nothing")).toEqual([]);
  });
});

describe("claim wording in copy files", () => {
  it("flags banned words inside string literals of copy files", () => {
    expect(rules("apps/web/src/x/strings.ts", `export const a = "Verified by our team";`)).toContain("claim-wording");
    expect(rules("apps/web/src/x/strings.ts", "export const a = 'Mise à jour en temps réel';")).toContain("claim-wording");
    expect(rules("apps/web/src/i18n/messages.en.ts", "const t = `Real-time updates`;")).toContain("claim-wording");
  });
  it("ignores identifiers, comments outside strings, and test files", () => {
    expect(rules("apps/web/src/x/strings.ts", "// verified in review\nexport const verifiedFlag = 1;")).toEqual([]);
    expect(rules("apps/web/src/x/strings.test.ts", `const a = "Verified";`)).toEqual([]);
  });
  it("does not treat non-copy files as copy", () => {
    expect(rules("apps/web/src/x/copyLint.ts", `const why = "partnership claim";`)).toEqual([]);
  });
  it("does not flag clean copy", () => {
    expect(rules("apps/web/src/x/strings.ts", `export const a = "Where your data is kept";`)).toEqual([]);
  });
});

describe("exemptions", () => {
  const bad = file("apps/web/src/a.ts", `const x = "${endorsedByForbiddenOrgSample("en")}";`);
  const ex = (patch: Partial<Exemption> = {}): Exemption => ({
    path: "apps/web/src/a.ts",
    rule: "forbidden-name",
    reason: "Test fixture for the rule",
    recordedOn: "2026-11-15",
    ...patch,
  });
  it("without an exemption the finding stands", () => {
    expect(auditFiles([bad]).map((f) => f.rule)).toEqual(["forbidden-name"]);
  });
  it("an exemption silences exactly its file and rule", () => {
    expect(auditFiles([bad], [ex()])).toEqual([]);
    expect(auditFiles([bad], [ex({ rule: "secret" })]).map((f) => f.rule).sort()).toEqual(["forbidden-name", "stale-exemption"]);
  });
  it("reports an exemption whose file is missing", () => {
    const f = auditFiles([], [ex()]);
    expect(f.map((x) => x.rule)).toEqual(["stale-exemption"]);
  });
  it("reports an exemption the file no longer needs", () => {
    const f = auditFiles([file("apps/web/src/a.ts", "const x = 1;")], [ex()]);
    expect(f[0]?.detail).toContain("no longer breaks");
  });
  it("requires a real reason, a valid date and no duplicates", () => {
    const codes = (e: Exemption[]): string[] => auditFiles([bad], e).map((f) => f.rule);
    expect(codes([ex({ reason: "short" })])).toContain("bad-exemption");
    expect(codes([ex({ recordedOn: "2026-02-31" })])).toContain("bad-exemption");
    expect(codes([ex(), ex()])).toContain("bad-exemption");
  });
  it("formatFindings lists file, line and detail", () => {
    const s = formatFindings(auditFiles([bad]));
    expect(s).toContain("forbidden-name apps/web/src/a.ts:1");
  });
});
