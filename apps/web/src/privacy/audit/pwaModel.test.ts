import { describe, expect, it } from "vitest";
import { configFile, GOOD_MANIFEST, GOOD_WORKBOX, options, withManifest, withRuntime, withWorkbox } from "./pwaFixture";
import { listStrings, parsePwaConfig, setValue, showList, showVal, type PwaConfig } from "./pwaModel";

const read = (text: string): PwaConfig => parsePwaConfig("vite.config.ts", text);
const good = (): PwaConfig => read(configFile());

describe("a configuration that is written out", () => {
  const c = good();

  it("is found, with the line of the call and no problem", () => {
    expect(c.found).toBe(true);
    expect(c.options).toBe("read");
    expect(c.line).toBe(5);
    expect(c.problems).toEqual([]);
  });

  it("reads the update mode, the extra files and the development switch", () => {
    expect(setValue(c.registerType)).toBe("prompt");
    expect(listStrings(c.includeAssets)).toEqual(["favicon.svg", "icons/icon-192.png", "icons/icon-512.png"]);
    expect(setValue(c.devEnabled)).toBe(false);
  });

  it("reads the manifest", () => {
    const m = c.manifest;
    expect(m.state).toBe("read");
    expect(setValue(m.name)).toBe("the App");
    expect(setValue(m.display)).toBe("standalone");
    expect(setValue(m.lang)).toBe("en");
    expect(setValue(m.theme_color)).toBe("#083734");
    expect(setValue(m.background_color)).toBe("#f4f1ea");
  });

  it("keeps start_url and scope as unknown because they are held in a variable", () => {
    expect(c.manifest.start_url).toMatchObject({ state: "unknown", shown: "base" });
    expect(c.manifest.scope).toMatchObject({ state: "unknown", shown: "base" });
  });

  it("reads the three icons", () => {
    expect(c.manifest.icons).toHaveLength(3);
    const icons = c.manifest.icons;
    if (icons === "absent" || icons === "unknown") throw new Error("no icons");
    expect(icons.map((i) => [setValue(i.src), setValue(i.sizes), setValue(i.purpose)])).toEqual([
      ["icons/icon-192.png", "192x192", "any"],
      ["icons/icon-512.png", "512x512", "any"],
      ["icons/icon-512.png", "512x512", "maskable"],
    ]);
  });

  it("reads the workbox settings", () => {
    const w = c.workbox;
    expect(w.state).toBe("read");
    expect(listStrings(w.globPatterns)).toEqual(["**/*.{js,css,html,svg,png,webmanifest}"]);
    expect(listStrings(w.globIgnores)).toEqual(["data/**", "**/*.pmtiles", "**/maplibre-*.js", "**/NarrowAuditPage-*.js"]);
    expect(setValue(w.navigateFallback)).toBe("index.html");
    expect(setValue(w.cleanupOutdatedCaches)).toBe(true);
    expect(setValue(w.clientsClaim)).toBe(true);
    expect(setValue(w.skipWaiting)).toBe(false);
  });

  it("reads the denylist as written: a regex and a name", () => {
    const d = c.workbox.denylist;
    if (d.state !== "set") throw new Error("no denylist");
    expect(d.items.map((i) => [i.kind, i.text])).toEqual([
      ["regex", "/^\\/packs\\//"],
      ["ref", "dataPath"],
    ]);
  });

  it("reads the runtime rules, with the sum of seconds worked out", () => {
    const r = c.workbox.runtime;
    if (r === "absent" || r === "unknown") throw new Error("no rules");
    expect(r).toHaveLength(2);
    expect(r[0]?.pattern).toMatchObject({ kind: "ref", text: "dataPath" });
    expect(setValue(r[0]?.handler ?? { state: "absent" })).toBe("NetworkOnly");
    expect(r[0]?.hasExpiration).toBe(false);
    expect(r[1]?.pattern?.kind).toBe("fn");
    expect(setValue(r[1]?.cacheName ?? { state: "absent" })).toBe("shell-pages");
    expect(setValue(r[1]?.networkTimeoutSeconds ?? { state: "absent" })).toBe(4);
    expect(setValue(r[1]?.maxEntries ?? { state: "absent" })).toBe(32);
    expect(setValue(r[1]?.maxAgeSeconds ?? { state: "absent" })).toBe(604800);
    expect(r[1]?.hasExpiration).toBe(true);
  });

  it("gives lines in the file", () => {
    const r = c.workbox.runtime;
    if (r === "absent" || r === "unknown") throw new Error("no rules");
    expect(r[0]?.line).toBeGreaterThan(c.workbox.line);
    expect(r[1]?.line).toBeGreaterThan(r[0]?.line ?? 0);
  });
});

describe("a file without the plugin", () => {
  it.each([["", "empty"], ["export default {};\n", "no call"], ["// VitePWA({})\n", "only a comment"], ['const s = "VitePWA({})";\n', "only a string"]])("%j (%s) has no call", (text) => {
    const c = read(text);
    expect(c.found).toBe(false);
    expect(c.options).toBe("absent");
    expect(c.manifest.state).toBe("absent");
    expect(c.workbox.state).toBe("absent");
  });
});

describe("options that are not written out", () => {
  it("are unknown when held in a variable that is not found", () => {
    const c = read("export default { plugins: [VitePWA(pwaOptions)] };");
    expect(c.found).toBe(true);
    expect(c.options).toBe("unknown");
  });
  it("are read from a variable that is declared in the file", () => {
    const c = read(`const pwaOptions = ${options()};\nexport default { plugins: [VitePWA(pwaOptions)] };`);
    expect(c.options).toBe("read");
    expect(setValue(c.registerType)).toBe("prompt");
  });
  it("are absent when the call has no argument", () => expect(read("VitePWA()").options).toBe("absent"));
  it("are unknown when the argument is a call", () => expect(read("VitePWA(makeOptions())").options).toBe("unknown"));
  it("read the manifest and the workbox part from variables declared in the file", () => {
    const c = read(`const m = ${GOOD_MANIFEST};\nconst w = ${GOOD_WORKBOX};\nconst dataPath = /x/;\nVitePWA({ manifest: m, workbox: w });`);
    expect(setValue(c.manifest.display)).toBe("standalone");
    expect(setValue(c.workbox.skipWaiting)).toBe(false);
  });
  it("keep a manifest that is a variable not found as unknown", () => {
    const c = read("VitePWA({ manifest: someManifest, workbox: someWorkbox });");
    expect(c.manifest.state).toBe("unknown");
    expect(c.manifest.icons).toBe("unknown");
    expect(c.workbox.state).toBe("unknown");
    expect(c.workbox.runtime).toBe("unknown");
  });
});

describe("settings that are not plain values", () => {
  it("keeps a value written as an expression as unknown, with its text", () => {
    const c = read(configFile(options({ registerType: "mode === 'dev' ? 'prompt' : 'autoUpdate'" })));
    expect(c.registerType).toMatchObject({ state: "unknown", shown: "mode === 'dev' ? 'prompt' : 'autoUpdate'" });
  });
  it("keeps a number written with a variable as unknown", () => {
    const c = read(withRuntime(`[{ urlPattern: /a/, handler: "NetworkFirst", options: { expiration: { maxAgeSeconds: DAY * 7 } } }]`));
    const r = c.workbox.runtime;
    if (r === "absent" || r === "unknown") throw new Error("no rules");
    expect(r[0]?.maxAgeSeconds).toMatchObject({ state: "unknown", shown: "DAY * 7" });
  });
  it("keeps a setting that a spread may have set as unknown, not as absent", () => {
    const c = read(configFile(options({ workbox: "{ ...shared, skipWaiting: false }" })));
    expect(c.workbox.clientsClaim).toMatchObject({ state: "unknown" });
    expect(c.workbox.skipWaiting).toMatchObject({ state: "set", value: false });
  });
  it("keeps a list that is held in a variable not found as unknown", () => {
    const c = read(configFile(options({ includeAssets: "assets" })));
    expect(c.includeAssets).toMatchObject({ state: "unknown", shown: "assets" });
  });
  it("reads a list from a variable declared in the file", () => {
    const c = read(`const assets = ["a.svg"];\n${configFile(options({ includeAssets: "assets" }))}`);
    expect(listStrings(c.includeAssets)).toEqual(["a.svg"]);
  });
  it("keeps a list item that is not a string as written, and listStrings says it is not all strings", () => {
    const c = read(configFile(options({ includeAssets: '["a.svg", iconPath]' })));
    if (c.includeAssets.state !== "set") throw new Error("no list");
    expect(c.includeAssets.items.map((i) => [i.kind, i.text])).toEqual([["str", "a.svg"], ["ref", "iconPath"]]);
    expect(listStrings(c.includeAssets)).toBeNull();
  });
  it("reads a handler written as a template with no substitution", () => {
    const c = read(withRuntime("[{ urlPattern: /a/, handler: `NetworkOnly` }]"));
    const r = c.workbox.runtime;
    if (r === "absent" || r === "unknown") throw new Error("no rules");
    expect(setValue(r[0]?.handler ?? { state: "absent" })).toBe("NetworkOnly");
  });
  it("reads a rule written with options in a variable declared in the file", () => {
    const text = `const opts = { cacheName: "c", expiration: { maxEntries: 5 } };\n${withRuntime("[{ urlPattern: /a/, handler: 'NetworkFirst', options: opts }]")}`;
    const r = read(text).workbox.runtime;
    if (r === "absent" || r === "unknown") throw new Error("no rules");
    expect(setValue(r[0]?.cacheName ?? { state: "absent" })).toBe("c");
    expect(setValue(r[0]?.maxEntries ?? { state: "absent" })).toBe(5);
  });
});

describe("settings that are not written", () => {
  it("are absent, not unknown", () => {
    const c = read(configFile(options({ registerType: null, includeAssets: null, devOptions: null, manifest: null, workbox: null })));
    expect(c.registerType.state).toBe("absent");
    expect(c.includeAssets.state).toBe("absent");
    expect(c.devEnabled.state).toBe("absent");
    expect(c.manifest.state).toBe("absent");
    expect(c.manifest.icons).toBe("absent");
    expect(c.workbox.state).toBe("absent");
    expect(c.workbox.runtime).toBe("absent");
  });
  it("leave the runtime rules absent when the key is not written", () => {
    const c = read(configFile(options({ workbox: "{ skipWaiting: false }" })));
    expect(c.workbox.runtime).toBe("absent");
    expect(c.workbox.globPatterns.state).toBe("absent");
  });
  it("keep a manifest field that is not written absent", () => {
    const c = read(withManifest('  lang: "en",\n', ""));
    expect(c.manifest.lang.state).toBe("absent");
    expect(setValue(c.manifest.display)).toBe("standalone");
  });
  it("read a rule with no options at all", () => {
    const r = read(withRuntime("[{ urlPattern: /a/, handler: 'NetworkOnly' }]")).workbox.runtime;
    if (r === "absent" || r === "unknown") throw new Error("no rules");
    expect(r[0]?.cacheName.state).toBe("absent");
    expect(r[0]?.hasExpiration).toBe(false);
  });
  it("read a rule with no pattern as a rule with a null pattern", () => {
    const r = read(withRuntime("[{ handler: 'NetworkOnly' }]")).workbox.runtime;
    if (r === "absent" || r === "unknown") throw new Error("no rules");
    expect(r[0]?.pattern).toBeNull();
  });
});

describe("problems", () => {
  it("passes on the problems of the reader, with their lines", () => {
    const c = read('VitePWA({\n  registerType: "prompt,\n  workbox: {},\n});');
    expect(c.problems.map((p) => p.message)).toContain("a string is not closed");
    expect(c.problems.find((p) => p.message === "a string is not closed")?.line).toBe(2);
  });
  it("says when a key is written twice in the options", () => {
    const c = read(configFile(options({ extra: "registerType: 'autoUpdate'," })));
    expect(c.problems.map((p) => p.message)).toEqual(["the key registerType is written twice in the options"]);
    expect(setValue(c.registerType)).toBe("autoUpdate");
  });
  it("says when the plugin is called more than once, and reads the first", () => {
    const c = read(`${configFile()}\nVitePWA({ registerType: "autoUpdate" });\n`);
    expect(c.problems.map((p) => p.message)).toEqual(["VitePWA is called 2 times; the first call is read"]);
    expect(setValue(c.registerType)).toBe("prompt");
  });
  it("does not throw on odd text", () => {
    for (const s of ["VitePWA(", "VitePWA({", "VitePWA({ manifest: { icons: [", "VitePWA({ workbox: { runtimeCaching: [{", "VitePWA({ manifest: { icons: [1, 'a', null] } })"]) expect(() => read(s)).not.toThrow();
  });
  it("reads an icon that is not an object as an icon with nothing set", () => {
    const m = read(withManifest("icons: [", "icons: [\n    'icons/a.png',")).manifest;
    if (m.icons === "absent" || m.icons === "unknown") throw new Error("no icons");
    expect(m.icons).toHaveLength(4);
    expect(m.icons[0]?.src.state).toBe("absent");
  });
});

describe("showVal, showList and the accessors", () => {
  it("shows a set value, an unknown one and an absent one", () => {
    expect(showVal({ state: "set", value: "a", line: 1 })).toBe('"a"');
    expect(showVal({ state: "set", value: 3, line: 1 })).toBe("3");
    expect(showVal({ state: "set", value: false, line: 1 })).toBe("false");
    expect(showVal({ state: "unknown", shown: "x + y", line: 1 })).toBe("unknown (x + y)");
    expect(showVal({ state: "absent" })).toBe("(absent)");
  });
  it("shows a list", () => {
    const c = good();
    expect(showList(c.includeAssets)).toBe('["favicon.svg", "icons/icon-192.png", "icons/icon-512.png"]');
    expect(showList(c.workbox.denylist)).toBe('[/^\\/packs\\//, dataPath]');
    expect(showList({ state: "absent" })).toBe("(absent)");
    expect(showList({ state: "unknown", shown: "x", line: 1 })).toBe("unknown (x)");
  });
  it("gives null for a setting that is not a plain value", () => {
    expect(setValue({ state: "absent" })).toBeNull();
    expect(setValue({ state: "unknown", shown: "x", line: 1 })).toBeNull();
    expect(listStrings({ state: "absent" })).toBeNull();
  });
});

describe("the workbox part of the good file", () => {
  it("changes when one setting changes", () => {
    expect(setValue(read(withWorkbox("skipWaiting: false", "skipWaiting: true")).workbox.skipWaiting)).toBe(true);
    expect(setValue(read(withWorkbox('navigateFallback: "index.html"', 'navigateFallback: "app.html"')).workbox.navigateFallback)).toBe("app.html");
  });
});
