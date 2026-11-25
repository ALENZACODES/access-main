import { describe, expect, it } from "vitest";
import { compareAccepted, compareSettings } from "./pwaCompare";
import { configFile, options, withWorkbox } from "./pwaFixture";
import { parsePwaConfig } from "./pwaModel";
import { PWA_ACCEPTED, PWA_REGISTER, type PwaAcceptRow } from "./pwaRegister";
import { pwaCsv, renderPwaReport } from "./pwaReport";
import { auditPwa } from "./pwaRules";

const run = (text: string, accepted: readonly PwaAcceptRow[] = PWA_ACCEPTED) => {
  const config = parsePwaConfig(PWA_REGISTER.path, text);
  const findings = auditPwa(config);
  return { config, findings, accepted, problems: [...compareSettings(config, PWA_REGISTER), ...compareAccepted(findings, accepted)] };
};

describe("renderPwaReport", () => {
  it("says there is no difference and no finding for a file that matches", () => {
    const text = renderPwaReport(run(configFile(), []));
    expect(text).toContain("Findings: 0.");
    expect(text).toContain("Findings accepted as they stand: 0.");
    expect(text).toContain("Differences from the register: none.");
  });
  it("gives the line of the call and the number of settings", () => {
    const first = renderPwaReport(run(configFile())).split("\n")[0];
    expect(first).toMatch(/^apps\/web\/vite\.config\.ts: VitePWA called at line 5; \d+ settings read\.$/);
  });
  it("lists each setting, sorted, with two spaces in front", () => {
    const lines = renderPwaReport(run(configFile())).split("\n").filter((l) => l.startsWith("  ") && l.includes(" = "));
    const keys = lines.map((l) => l.slice(2, l.indexOf(" = ")));
    expect(keys).toEqual([...keys].sort());
    expect(keys).toContain("registerType");
  });
  it("lists the findings and the accepted ones with their reasons", () => {
    const text = renderPwaReport(run(configFile(options({ registerType: '"autoUpdate"' }))));
    expect(text).toContain("Findings: 1.");
    expect(text).toContain("auto-update:");
    expect(text).toContain("Findings accepted as they stand: 1.");
    expect(text).toContain("verification-wording ×1:");
  });
  it("lists the differences", () => {
    const text = renderPwaReport(run(withWorkbox("skipWaiting: false", "skipWaiting: true")));
    expect(text).toContain("Differences from the register:");
    expect(text).toContain("setting-changed workbox.skipWaiting: register false; file true");
  });
  it("says so when there is no call", () => {
    const text = renderPwaReport(run("export default {};"));
    expect(text.split("\n")[0]).toBe("apps/web/vite.config.ts: no call of VitePWA found.");
  });
  it("does not end with a line break", () => expect(renderPwaReport(run(configFile())).endsWith("\n")).toBe(false));
  it("is the same on a second run", () => expect(renderPwaReport(run(configFile()))).toBe(renderPwaReport(run(configFile()))));
});

describe("pwaCsv", () => {
  it("starts with the heading and has a row for each setting", () => {
    const rows = pwaCsv(parsePwaConfig("x.ts", configFile())).split("\n");
    expect(rows[0]).toBe("setting,value");
    expect(rows.length).toBeGreaterThan(10);
  });
  it("puts a value with a comma or a quote in quotes", () => {
    const csv = pwaCsv(parsePwaConfig("x.ts", configFile()));
    expect(csv).toContain('"[""favicon.svg"",""icons/icon-192.png"",""icons/icon-512.png""]"');
  });
  it("is only the heading when nothing can be read", () => expect(pwaCsv(parsePwaConfig("x.ts", ""))).toBe("setting,value"));
});
