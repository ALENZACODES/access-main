// CI audit for the network, restore, support and printable features: wording
// lint, EN/FR parity, and the HTML audit over every state they add.

import { describe, expect, it } from "vitest";
import { createPrivacyController } from "../panel/controller";
import { lintTable, type Locale } from "../panel/copyLint";
import { MORE_STRINGS, type MoreStatus } from "../panel/copyMore";
import { createEgressPolicy } from "../panel/egress";
import { recordBlocked } from "../panel/egressLog";
import { FIXTURE, PREFIX } from "../panel/fixtures.test-util";
import { exportLocalData } from "../panel/localData";
import { renderPrivacyPanelHtml } from "../panel/panel";
import { IMPORT_PROBLEM_CODES } from "../panel/importData";
import { createMemoryStorage } from "../panel/storage";
import { assertParity, checkParity } from "./parity";
import { auditHtml, formatViolations } from "./htmlAudit";

const LOCALES: readonly Locale[] = ["en", "fr"];
const NOW = new Date(2026, 10, 15, 9, 0, 0);
const DATE: ReadonlyArray<readonly [string]> = [["2026-11-15"]];

const STATUSES: readonly MoreStatus[] = [
  { kind: "import-ready", additions: 0, overwrites: 0, unchanged: 0 },
  { kind: "import-ready", additions: 2, overwrites: 1, unchanged: 3 },
  { kind: "import-done", count: 0 },
  { kind: "import-done", count: 1 },
  { kind: "import-done", count: 5 },
  { kind: "import-rolled-back" },
  { kind: "import-stuck", failed: 1 },
  { kind: "import-stuck", failed: 4 },
  { kind: "import-cancelled" },
  { kind: "support-prepared" },
  { kind: "printable-prepared" },
  ...IMPORT_PROBLEM_CODES.map((code): MoreStatus => ({ kind: "import-problem", code })),
];

describe.each(LOCALES)("wording lint (%s)", (loc) => {
  it("static copy passes", () => {
    const { status: _s, printable, network, ...rest } = MORE_STRINGS[loc];
    const { generated: _g, reviewed: _r, ...printableText } = printable;
    const { summary: _sum, ...networkText } = network;
    expect(lintTable(loc, { ...rest, printable: printableText, network: networkText })).toEqual([]);
  });
  it("every status and generated line passes", () => {
    for (const s of STATUSES) expect(lintTable(loc, MORE_STRINGS[loc].status(s)), JSON.stringify(s)).toEqual([]);
    expect(lintTable(loc, MORE_STRINGS[loc].network.summary(1, 1))).toEqual([]);
    expect(lintTable(loc, MORE_STRINGS[loc].network.summary(5, 3))).toEqual([]);
    expect(lintTable(loc, MORE_STRINGS[loc].printable.generated("2026-11-15"))).toEqual([]);
  });
});

describe("EN and FR parity", () => {
  const samples = {
    status: STATUSES.map((s) => [s] as const),
    "network.summary": [[0, 0], [1, 1], [2, 1], [5, 3]] as ReadonlyArray<readonly [number, number]>,
    "printable.generated": DATE,
    "printable.reviewed": DATE,
  };
  it("matches", () => {
    expect(() => assertParity(MORE_STRINGS.en, MORE_STRINGS.fr, { samples, allowIdentical: [] })).not.toThrow();
  });
  it("is not vacuous: an untranslated line and a missing key are caught", () => {
    const untranslated = { ...MORE_STRINGS.fr, buttons: MORE_STRINGS.en.buttons };
    expect(checkParity(MORE_STRINGS.en, untranslated, { samples }).map((p) => p.code)).toContain("identical");
    const { buttons: _b, ...dropped } = MORE_STRINGS.fr;
    expect(checkParity(MORE_STRINGS.en, dropped, { samples }).map((p) => p.code)).toContain("missing-in-fr");
  });
  it("has one problem message per code in both languages", () => {
    for (const code of IMPORT_PROBLEM_CODES) {
      for (const loc of LOCALES) {
        expect(MORE_STRINGS[loc].status({ kind: "import-problem", code }).length, `${loc} ${code}`).toBeGreaterThan(10);
      }
    }
  });
});

describe("HTML audit of every new state", () => {
  const policy = createEgressPolicy({ selfOrigin: "https://app.example.ca", allowedOrigins: ["https://data.example.ca", "https://b.example.ca"] });
  const hosts = ["a.example.net", "b.example.net:8443"];
  function storageWithBlocks() {
    const s = createMemoryStorage({ [`${PREFIX}a`]: "1" });
    for (const h of hosts) recordBlocked(s, PREFIX, { at: NOW.toISOString(), host: h, scheme: "https:", via: "fetch", reason: "not-listed" }, NOW);
    return s;
  }
  const cases: Array<[string, Locale, (c: ReturnType<typeof createPrivacyController>) => void, boolean]> = [];
  for (const loc of LOCALES) {
    cases.push([`${loc} start`, loc, () => undefined, true]);
    cases.push([`${loc} start without guard`, loc, () => undefined, false]);
    cases.push([`${loc} file waiting`, loc, (c) => c.dispatch({ type: "import-load", text: exportLocalData(createMemoryStorage({ [`${PREFIX}z`]: "1" }), PREFIX, NOW, loc).text }), true]);
    cases.push([`${loc} bad file`, loc, (c) => c.dispatch({ type: "import-load", text: "nope" }), true]);
    cases.push([`${loc} restored`, loc, (c) => {
      c.dispatch({ type: "import-load", text: exportLocalData(createMemoryStorage({ [`${PREFIX}z`]: "1" }), PREFIX, NOW, loc).text });
      c.dispatch({ type: "import-confirm" });
    }, true]);
    cases.push([`${loc} cancelled`, loc, (c) => {
      c.dispatch({ type: "import-load", text: exportLocalData(createMemoryStorage({ [`${PREFIX}z`]: "1" }), PREFIX, NOW, loc).text });
      c.dispatch({ type: "import-cancel" });
    }, true]);
    cases.push([`${loc} support`, loc, (c) => c.dispatch({ type: "export-support" }), true]);
    cases.push([`${loc} printable`, loc, (c) => c.dispatch({ type: "export-printable" }), true]);
  }
  it.each(cases)("passes: %s", (_n, loc, act, guard) => {
    const c = createPrivacyController({
      storage: storageWithBlocks(),
      prefix: PREFIX,
      inventory: FIXTURE,
      now: () => NOW,
      logActivity: true,
      trackChanges: true,
      languages: [loc],
      ...(guard ? { egress: policy } : {}),
    });
    c.dispatch({ type: "set-locale", locale: loc });
    act(c);
    const found = auditHtml(c.html());
    expect(found, formatViolations(found)).toEqual([]);
  });
  it("the network section has labelled structure and sized targets", () => {
    const html = renderPrivacyPanelHtml({
      locale: "en",
      inventory: FIXTURE,
      confirmingErase: false,
      status: null,
      network: { selfOrigin: "https://app.example.ca", allowedOrigins: [], blocked: { hosts: [{ host: "a.example.net", count: 2, lastAt: NOW.toISOString() }] } },
    });
    expect(auditHtml(html)).toEqual([]);
    expect(html).toContain("<caption");
    expect(html).toContain('scope="row"');
  });
  it("is not vacuous: a 30 px file chooser is caught", () => {
    const c = createPrivacyController({ storage: createMemoryStorage(), prefix: PREFIX, inventory: FIXTURE, now: () => NOW });
    const mutated = c.html().replace('data-import-file style="min-width:44px;min-height:44px"', 'data-import-file style="min-width:30px;min-height:30px"');
    expect(auditHtml(mutated).map((v) => v.code)).toContain("target-too-small");
    const unlabelled = c.html().replace(/<label for="privacy-import-file"[^>]*>[^<]*<\/label>/, "");
    expect(auditHtml(unlabelled).map((v) => v.code)).toContain("input-no-name");
  });
});
