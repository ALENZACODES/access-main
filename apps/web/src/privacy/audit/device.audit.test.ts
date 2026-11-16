// CI audit for browser signals, offline storage and protected copies: wording
// lint, EN/FR parity, the HTML audit of every state, and the rule that a
// passphrase is never stored.

import { describe, expect, it } from "vitest";
import { createPrivacyController, type PrivacyController } from "../panel/controller";
import { DEVICE_STRINGS, type DeviceStatus } from "../panel/copyDevice";
import { lintTable, type Locale } from "../panel/copyLint";
import type { DeviceHost } from "../panel/deviceStorage";
import { FIXTURE, PREFIX } from "../panel/fixtures.test-util";
import { listKeys } from "../panel/localData";
import { createMemoryStorage } from "../panel/storage";
import { PROTECTED_PROBLEMS } from "./copyCorpus";
import { auditHtml, formatViolations } from "./htmlAudit";
import { assertParity, checkParity } from "./parity";

const LOCALES: readonly Locale[] = ["en", "fr"];
const NOW = new Date(2026, 10, 15, 9, 0, 0);
const PASS = "correct horse battery";

const STATUSES: readonly DeviceStatus[] = [
  { kind: "scan-done" },
  { kind: "device-cleared", caches: 0, databases: 0 },
  { kind: "device-cleared", caches: 1, databases: 1 },
  { kind: "device-cleared", caches: 3, databases: 2 },
  { kind: "device-clear-partial", failed: 1 },
  { kind: "device-nothing" },
  { kind: "protected-prepared", count: 1 },
  { kind: "protected-prepared", count: 4 },
  ...PROTECTED_PROBLEMS.map((code): DeviceStatus => ({ kind: "protected-problem", code })),
];

/** Copy of an object without the named keys (functions that need arguments are linted separately). */
function without(o: object, ...keys: string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));
}

describe.each(LOCALES)("wording lint (%s)", (loc) => {
  it("static copy passes", () => {
    const { signals, device, copy } = DEVICE_STRINGS[loc];
    const sig = without(signals, "usage");
    const dev = without(device, "checkedAt", "confirmBody");
    expect(lintTable(loc, { sig, dev, copy })).toEqual([]);
  });
  it("every generated line passes", () => {
    const d = DEVICE_STRINGS[loc];
    for (const s of STATUSES) expect(lintTable(loc, d.status(s)), JSON.stringify(s)).toEqual([]);
    for (const [u, q] of [[null, null], [10, null], [1500, 5_000_000]] as const) expect(lintTable(loc, d.signals.usage(u, q))).toEqual([]);
    expect(lintTable(loc, d.device.confirmBody(1, 1))).toEqual([]);
    expect(lintTable(loc, d.device.confirmBody(2, 0))).toEqual([]);
    expect(lintTable(loc, d.device.checkedAt("2026-11-15"))).toEqual([]);
  });
  it("makes no promise it cannot keep: no security claim, no claim about what the App does with signals", () => {
    const all = JSON.stringify(DEVICE_STRINGS[loc].copy) + JSON.stringify(DEVICE_STRINGS[loc].signals.note);
    expect(all).not.toMatch(/unbreakable|uncrackable|military|100\s?%|inviolable|incassable|infaillible/i);
  });
});

describe("EN and FR parity", () => {
  const samples = {
    status: STATUSES.map((s) => [s] as const),
    "signals.usage": [[null, null], [10, null], [1500, 5_000_000]] as ReadonlyArray<readonly [number | null, number | null]>,
    "device.checkedAt": [["2026-11-15"]] as ReadonlyArray<readonly [string]>,
    "device.confirmBody": [[0, 0], [1, 1], [2, 3]] as ReadonlyArray<readonly [number, number]>,
  };
  const allowIdentical = ["signals.rows.gpc", "signals.rows.secure"];
  it("matches", () => {
    expect(() => assertParity(DEVICE_STRINGS.en, DEVICE_STRINGS.fr, { samples, allowIdentical })).not.toThrow();
  });
  it("is not vacuous", () => {
    const untranslated = { ...DEVICE_STRINGS.fr, copy: DEVICE_STRINGS.en.copy };
    expect(checkParity(DEVICE_STRINGS.en, untranslated, { samples, allowIdentical }).map((p) => p.code)).toContain("identical");
  });
  it("has a message for every problem code in both languages", () => {
    for (const code of PROTECTED_PROBLEMS) {
      for (const loc of LOCALES) expect(DEVICE_STRINGS[loc].status({ kind: "protected-problem", code }).length, `${loc} ${code}`).toBeGreaterThan(10);
    }
  });
});

function host(): DeviceHost {
  const caches = new Set(["app-v1"]);
  return {
    caches: { keys: () => Promise.resolve([...caches]), delete: (n) => Promise.resolve(caches.delete(n)) },
    document: { cookie: "theme=dark" },
  };
}

function make(loc: Locale): PrivacyController {
  const c = createPrivacyController({
    storage: createMemoryStorage({ [`${PREFIX}a`]: "1" }),
    prefix: PREFIX,
    inventory: FIXTURE,
    now: () => NOW,
    logActivity: true,
    languages: [loc],
    crypto: globalThis.crypto,
    protectedIterations: 1000,
    minProtectedIterations: 1000,
    signals: { navigator: { globalPrivacyControl: true, doNotTrack: "0", cookieEnabled: true, storage: { estimate: () => Promise.resolve({ usage: 2048, quota: 9_000_000 }) } }, isSecureContext: true },
    device: { host: host(), cachePrefix: "app-" },
  });
  c.dispatch({ type: "set-locale", locale: loc });
  return c;
}

describe("HTML audit of every new state", () => {
  const steps: ReadonlyArray<[string, (c: PrivacyController) => Promise<unknown>]> = [
    ["start", async () => undefined],
    ["signals read", (c) => c.dispatchAsync({ type: "read-signals" })],
    ["scanned", (c) => c.dispatchAsync({ type: "scan-device" })],
    ["asking to remove", async (c) => {
      await c.dispatchAsync({ type: "scan-device" });
      c.dispatch({ type: "clear-device-ask" });
    }],
    ["removed", async (c) => {
      await c.dispatchAsync({ type: "scan-device" });
      c.dispatch({ type: "clear-device-ask" });
      await c.dispatchAsync({ type: "clear-device-confirm" });
    }],
    ["protected made", (c) => c.dispatchAsync({ type: "protected-export", passphrase: PASS, confirm: PASS })],
    ["protected mismatch", (c) => c.dispatchAsync({ type: "protected-export", passphrase: PASS, confirm: "x" })],
    ["protected wrong file", (c) => c.dispatchAsync({ type: "protected-import", text: "nope", passphrase: PASS })],
  ];
  const cases = LOCALES.flatMap((loc) => steps.map(([n, f]) => [`${loc} ${n}`, loc, f] as const));
  it.each(cases)("passes: %s", async (_n, loc, f) => {
    const c = make(loc);
    await f(c);
    const found = auditHtml(c.html());
    expect(found, formatViolations(found)).toEqual([]);
  });
  it("is not vacuous: an unlabelled passphrase field and a 20 px field are caught", () => {
    const html = make("en").html();
    expect(auditHtml(html.replace(/<label for="privacy-protected-pass"[^>]*>[^<]*<\/label>/, "")).map((v) => v.code)).toContain("input-no-name");
    expect(auditHtml(html.replace('data-protected-pass aria-describedby="privacy-protected-hint" style="min-width:44px;min-height:44px"', 'data-protected-pass style="min-width:20px;min-height:20px"')).map((v) => v.code)).toContain("target-too-small");
  });
});

describe("a passphrase is never stored", () => {
  it("storage and the page hold no trace after a full flow", async () => {
    const secret = "never-stored passphrase 5530";
    const storage = createMemoryStorage({ [`${PREFIX}a`]: "1" });
    const c = createPrivacyController({
      storage, prefix: PREFIX, inventory: FIXTURE, now: () => NOW, logActivity: true, trackChanges: true,
      crypto: globalThis.crypto, protectedIterations: 1000, minProtectedIterations: 1000,
    });
    const s = await c.dispatchAsync({ type: "protected-export", passphrase: secret, confirm: secret });
    await c.dispatchAsync({ type: "protected-import", text: s.lastExport!.text, passphrase: secret });
    c.dispatch({ type: "import-confirm" });
    const dump = [c.html(), ...listKeys(storage, "").map((k) => storage.getItem(k) ?? "")].join("\n");
    expect(dump).not.toContain(secret);
    expect(listKeys(storage, "").every((k) => k.startsWith(PREFIX))).toBe(true);
  });
});
