// The real tree: the install and offline-cache settings in apps/web/vite.config.ts, the picture files they name and
// the start page, checked with the rules, the register and the comparisons. The checks read text and file headers; they
// do not build the App and say nothing about what the built files contain.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assetPath, compareAccepted, compareAssets, compareSettings, flattenConfig, formatPwaProblems, namedAssets } from "./pwaCompare";
import { loadPwa, PWA_CONFIG_PATH, readConfigText } from "./pwaFiles";
import { compareHead, readPageHead } from "./pwaHtml";
import { parsePwaConfig, setValue } from "./pwaModel";
import { assertPwaRegister, PWA_ACCEPTED, PWA_REGISTER } from "./pwaRegister";
import { pwaCsv, renderPwaReport } from "./pwaReport";
import { auditPwa, formatPwaFinding } from "./pwaRules";
import { readPngSize } from "./pngHeader";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../..");
const real = loadPwa(ROOT);
const text = readConfigText(ROOT) as string;
const findings = auditPwa(real.config);
const problems = [...compareSettings(real.config, PWA_REGISTER), ...compareAccepted(findings, PWA_ACCEPTED), ...compareAssets(real.config, real.files), ...compareHead(real.config, readPageHead(real.html ?? ""))];

describe("the real configuration", () => {
  it("is read from the file at the path the register names", () => {
    expect(PWA_CONFIG_PATH).toBe(PWA_REGISTER.path);
    expect(text.length).toBeGreaterThan(1000);
  });
  it("calls the plugin once, with options written out, and reads without a problem", () => {
    expect(real.config.found).toBe(true);
    expect(real.config.options).toBe("read");
    expect(real.config.problems).toEqual([]);
  });
  it("has a register that is valid", () => expect(() => assertPwaRegister()).not.toThrow());
  it("matches the register in every setting", () => expect(formatPwaProblems(compareSettings(real.config, PWA_REGISTER))).toBe(""));
  it("has the findings that the accepted list says, and no other", () => {
    expect(formatPwaProblems(compareAccepted(findings, PWA_ACCEPTED))).toBe("");
    expect(findings.map((f) => f.code)).toEqual(PWA_ACCEPTED.map((a) => a.code));
  });
  it("has the picture files it names, at the sizes the manifest gives", () => expect(formatPwaProblems(compareAssets(real.config, real.files))).toBe(""));
  it("has a start page that agrees with the manifest", () => {
    expect(real.html).not.toBeNull();
    expect(formatPwaProblems(compareHead(real.config, readPageHead(real.html ?? "")))).toBe("");
  });
  it("has no problem of any kind", () => expect(formatPwaProblems(problems)).toBe(""));
});

describe("what the settings say", () => {
  const c = real.config;
  it("asks the person before a new version takes over", () => {
    expect(setValue(c.registerType)).toBe("prompt");
    expect(setValue(c.workbox.skipWaiting)).toBe(false);
  });
  it("never keeps the data files in the page cache", () => {
    const r = c.workbox.runtime;
    if (r === "absent" || r === "unknown") throw new Error("no runtime rules");
    const data = r.filter((x) => x.pattern?.text === "dataPath");
    expect(data).toHaveLength(1);
    expect(setValue(data[0]?.handler ?? { state: "absent" })).toBe("NetworkOnly");
  });
  it("leaves the offline packs out of the page cache", () => {
    const r = c.workbox.runtime;
    if (r === "absent" || r === "unknown") throw new Error("no runtime rules");
    const shell = r.find((x) => x.pattern?.kind === "fn");
    expect(shell?.pattern?.text).toContain('!url.pathname.startsWith("/packs/")');
    expect(shell?.pattern?.text).toContain("sameOrigin");
  });
  it("keeps pages for a week at most, and a few of them", () => {
    const r = c.workbox.runtime;
    if (r === "absent" || r === "unknown") throw new Error("no runtime rules");
    const shell = r.find((x) => x.pattern?.kind === "fn");
    expect(setValue(shell?.maxAgeSeconds ?? { state: "absent" })).toBe(7 * 24 * 60 * 60);
    expect(setValue(shell?.maxEntries ?? { state: "absent" })).toBeLessThanOrEqual(64);
  });
  it("is installable as an app: standalone, with an any icon and a maskable icon", () => {
    expect(setValue(c.manifest.display)).toBe("standalone");
    const icons = c.manifest.icons;
    if (icons === "absent" || icons === "unknown") throw new Error("no icons");
    expect(icons.some((i) => setValue(i.purpose) === "maskable")).toBe(true);
    expect(icons.some((i) => setValue(i.sizes) === "512x512" && setValue(i.purpose) === "any")).toBe(true);
  });
  it("writes start_url and scope the same way, as a name it cannot work out", () => {
    expect(c.manifest.start_url).toMatchObject({ state: "unknown", shown: "base" });
    expect(c.manifest.scope).toMatchObject({ state: "unknown", shown: "base" });
  });
  it("does not run the service worker while developing", () => expect(setValue(c.devEnabled)).toBe(false));
  it("keeps only the file endings the policy allows at install", () => expect(findings.filter((f) => f.code === "precache-extension")).toEqual([]));
});

describe("the picture files", () => {
  it("are all in the public folder", () => {
    for (const name of namedAssets(real.config)) expect(real.files.get(assetPath(name)), name).not.toBeNull();
  });
  it("are square PNG files for the icons", () => {
    for (const name of ["icons/icon-192.png", "icons/icon-512.png"]) {
      const s = readPngSize(real.files.get(name) as Uint8Array);
      expect(s?.width).toBe(s?.height);
    }
  });
  it("are 192 and 512 on a side", () => {
    expect(readPngSize(real.files.get("icons/icon-192.png") as Uint8Array)).toEqual({ width: 192, height: 192 });
    expect(readPngSize(real.files.get("icons/icon-512.png") as Uint8Array)).toEqual({ width: 512, height: 512 });
  });
});

describe("the report", () => {
  const report = renderPwaReport({ config: real.config, accepted: PWA_ACCEPTED, findings, problems });
  it("says there is no difference from the register", () => expect(report).toContain("Differences from the register: none."));
  it("lists the accepted finding with its reason", () => expect(report).toContain("verification-wording ×1:"));
  it("lists every finding as path, line and code", () => {
    for (const f of findings) expect(report).toContain(formatPwaFinding(f));
  });
  it("makes a table with a row for each setting", () => expect(pwaCsv(real.config).split("\n")).toHaveLength(Object.keys(flattenConfig(real.config)).length + 1));
  it("does not write a path of this machine", () => expect(report).not.toContain(ROOT));
});

describe("a change to the real text is found", () => {
  const change = (from: string, to: string): string => {
    if (!text.includes(from)) throw new Error(`the configuration has no ${from}`);
    return text.replace(from, to);
  };
  const check = (changed: string) => {
    const c = parsePwaConfig(PWA_CONFIG_PATH, changed);
    return { findings: auditPwa(c), problems: compareSettings(c, PWA_REGISTER) };
  };

  it("registerType prompt to autoUpdate: a finding and a difference", () => {
    const r = check(change('registerType: "prompt"', 'registerType: "autoUpdate"'));
    expect(r.findings.map((f) => f.code)).toContain("auto-update");
    expect(r.problems.map((p) => p.key)).toEqual(["registerType"]);
  });
  it("skipWaiting false to true: a finding and a difference", () => {
    const r = check(change("skipWaiting: false", "skipWaiting: true"));
    expect(r.findings.map((f) => f.code)).toContain("skip-waiting");
    expect(r.problems.map((p) => p.key)).toEqual(["workbox.skipWaiting"]);
  });
  it("the data rule from NetworkOnly to CacheFirst: a finding and a difference", () => {
    const r = check(change('{ urlPattern: dataPath, handler: "NetworkOnly" }', '{ urlPattern: dataPath, handler: "CacheFirst", options: { expiration: { maxEntries: 9 } } }'));
    expect(r.findings.map((f) => f.code)).toContain("data-cached");
    expect(r.problems.length).toBeGreaterThan(0);
  });
  it("the data folder no longer left out of the install: a finding and a difference", () => {
    const r = check(change('"data/**", ', ""));
    expect(r.findings.map((f) => f.code)).toContain("precache-missing-ignore");
    expect(r.problems.map((p) => p.key)).toEqual(["workbox.globIgnores"]);
  });
  it("the packs let into the page cache: a finding", () => {
    const r = check(change('!url.pathname.startsWith("/packs/")', 'url.pathname.startsWith("/packs/")'));
    expect(r.findings.map((f) => f.code)).toContain("packs-cached");
  });
  it("the page cache with no limits: a finding", () => {
    const r = check(change("expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 * 7 },", ""));
    expect(r.findings.map((f) => f.code)).toContain("unbounded-cache");
  });
  it("the pages kept for a year: a finding", () => {
    const r = check(change("60 * 60 * 24 * 7", "60 * 60 * 24 * 365"));
    expect(r.findings.map((f) => f.code)).toContain("long-max-age");
    expect(r.problems.map((p) => p.key)).toEqual(["workbox.runtime.1"]);
  });
  it("the display changed: a finding and a difference", () => {
    const r = check(change('display: "standalone"', 'display: "browser"'));
    expect(r.findings.map((f) => f.code)).toContain("manifest-display");
    expect(r.problems.map((p) => p.key)).toEqual(["manifest.display"]);
  });
  it("the maskable icon dropped: a finding and a difference", () => {
    const r = check(change('  { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },\n', ""));
    expect(r.findings.map((f) => f.code)).toContain("manifest-icons");
    expect(r.problems.map((p) => p.key)).toEqual(["manifest.icons"]);
  });
  it("the accepted wording gone: the accepted list is then out of date", () => {
    const changed = change("Every record is unverified. Each shows its source, licence, date, and verification tier.", "Prototype.");
    const c = parsePwaConfig(PWA_CONFIG_PATH, changed);
    expect(compareAccepted(auditPwa(c), PWA_ACCEPTED).map((p) => p.code)).toEqual(["accepted-gone"]);
  });
  it("the plugin taken out: no call is found", () => {
    const r = check(changedWithout());
    expect(r.findings.map((f) => f.code)).toEqual(["no-pwa-call"]);
  });
  function changedWithout(): string {
    return text.replace(/VitePWA\(/g, "notThePlugin(");
  }
});
