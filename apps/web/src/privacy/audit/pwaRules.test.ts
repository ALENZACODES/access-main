import { describe, expect, it } from "vitest";
import { forbiddenOrgNeedles } from "../../../../../packages/shared/test/forbiddenOrg.ts";
import { configFile, GOOD_MANIFEST, GOOD_RUNTIME, GOOD_WORKBOX, options, withManifest, withRuntime, withWorkbox } from "./pwaFixture";
import { parsePwaConfig } from "./pwaModel";
import { auditPwa, formatPwaFinding, PWA_CODES, PWA_POLICY, type PwaCode, type PwaFinding } from "./pwaRules";

const audit = (text: string, path = "vite.config.ts"): PwaFinding[] => auditPwa(parsePwaConfig(path, text));
const codes = (text: string): PwaCode[] => audit(text).map((f) => f.code);

describe("the good configuration", () => {
  it("has no finding", () => expect(audit(configFile())).toEqual([]));
  it("lists 27 codes, each once, in the order the rules are written in", () => {
    expect(PWA_CODES).toHaveLength(27);
    expect(new Set(PWA_CODES).size).toBe(PWA_CODES.length);
  });
});

describe("a file with no plugin, or options that cannot be read", () => {
  it("has one finding when the plugin is not called", () => {
    expect(audit("export default {};\n")).toEqual([{ code: "no-pwa-call", path: "vite.config.ts", line: 0, detail: "no call of VitePWA is written in the file" }]);
  });
  it("has one finding when the options are held in a variable that is not found", () => expect(codes("VitePWA(opts);")).toEqual(["options-unknown"]));
  it("has one finding when the call has no options", () => expect(codes("VitePWA();")).toEqual(["options-unknown"]));
  it("passes on the problems of reading as findings", () => {
    const f = audit(configFile(options({ extra: "registerType: 'prompt'," })));
    expect(f.map((x) => x.code)).toEqual(["read-problem"]);
    expect(f[0]?.detail).toBe("the key registerType is written twice in the options");
  });
});

describe("the update mode", () => {
  it("accepts prompt", () => expect(codes(configFile(options({ registerType: '"prompt"' })))).toEqual([]));
  it("finds autoUpdate", () => {
    const f = audit(configFile(options({ registerType: '"autoUpdate"' })));
    expect(f.map((x) => x.code)).toEqual(["auto-update"]);
    expect(f[0]?.detail).toContain('"autoUpdate"');
  });
  it("finds another value as unknown update mode", () => expect(codes(configFile(options({ registerType: '"other"' })))).toEqual(["update-mode-unknown"]));
  it("finds a value that is not a plain string as unknown update mode", () => expect(codes(configFile(options({ registerType: "mode" })))).toEqual(["update-mode-unknown"]));
  it("does not judge a mode that is not written", () => expect(codes(configFile(options({ registerType: null })))).toEqual([]));
  it("finds skipWaiting true", () => expect(codes(withWorkbox("skipWaiting: false", "skipWaiting: true"))).toEqual(["skip-waiting"]));
  it("does not judge a skipWaiting that is not a plain value", () => expect(codes(withWorkbox("skipWaiting: false", "skipWaiting: flag"))).toEqual([]));
  it("finds the service worker switched on in development", () => expect(codes(configFile(options({ devOptions: "{ enabled: true }" })))).toEqual(["dev-enabled"]));
  it("accepts development switched off or not written", () => {
    expect(codes(configFile(options({ devOptions: null })))).toEqual([]);
    expect(codes(configFile(options({ devOptions: "{}" })))).toEqual([]);
  });
});

describe("the files kept at install", () => {
  it.each([
    ["**/*.{js,css,html,svg,png,webmanifest}", []],
    ["**/*.js", []],
    ["**/*.{js, css}", []],
    ["**/*.json", ["precache-extension"]],
    ["**/*.{js,pmtiles}", ["precache-extension"]],
    ["**/*", ["precache-extension"]],
    ["**/*.{js,css", ["precache-extension"]],
    ["data/**", ["precache-extension"]],
    ["**/*.{png,jpg,webp}", ["precache-extension", "precache-extension"]],
  ])("the pattern %s gives %j", (glob, want) => {
    const text = withWorkbox('["**/*.{js,css,html,svg,png,webmanifest}"]', `["${glob}"]`);
    expect(codes(text)).toEqual(want);
  });

  it("names the ending in the detail", () => {
    const f = audit(withWorkbox('["**/*.{js,css,html,svg,png,webmanifest}"]', '["**/*.wasm"]'));
    expect(f[0]?.detail).toBe('.wasm files are kept at install ("**/*.wasm")');
  });
  it("finds a pattern that is not a plain string", () => expect(codes(withWorkbox('["**/*.{js,css,html,svg,png,webmanifest}"]', "[pattern]"))).toEqual(["precache-extension"]));
  it("does not judge patterns that are held in a variable that is not found", () => expect(codes(withWorkbox('["**/*.{js,css,html,svg,png,webmanifest}"]', "patterns"))).toEqual([]));

  it.each([
    ["the data folder", '"data/**", ', '["data/**", "**/*.pmtiles", "**/maplibre-*.js", "**/NarrowAuditPage-*.js"]'],
    ["the map files", '"**/*.pmtiles", ', '["data/**", "**/*.pmtiles", "**/maplibre-*.js", "**/NarrowAuditPage-*.js"]'],
  ])("finds %s no longer left out", (_name, drop, whole) => {
    const f = audit(withWorkbox(whole, whole.replace(drop, "")));
    expect(f.map((x) => x.code)).toEqual(["precache-missing-ignore"]);
  });
  it("finds both missing when the ignore list is empty, and when it is not written", () => {
    expect(codes(withWorkbox('["data/**", "**/*.pmtiles", "**/maplibre-*.js", "**/NarrowAuditPage-*.js"]', "[]"))).toEqual(["precache-missing-ignore", "precache-missing-ignore"]);
    expect(codes(withWorkbox('  globIgnores: ["data/**", "**/*.pmtiles", "**/maplibre-*.js", "**/NarrowAuditPage-*.js"],\n', ""))).toEqual(["precache-missing-ignore", "precache-missing-ignore"]);
  });
  it("does not judge an ignore list that is held in a variable that is not found", () => {
    expect(codes(withWorkbox('["data/**", "**/*.pmtiles", "**/maplibre-*.js", "**/NarrowAuditPage-*.js"]', "ignores"))).toEqual([]);
  });
  it("accepts more patterns left out than the policy asks for", () => {
    expect(codes(withWorkbox('"**/NarrowAuditPage-*.js"]', '"**/NarrowAuditPage-*.js", "**/extra/**"]'))).toEqual([]);
  });
});

describe("the fallback page", () => {
  it("finds a fallback page with a denylist that does not mention the packs", () => {
    expect(codes(withWorkbox("navigateFallbackDenylist: [/^\\/packs\\//, dataPath]", "navigateFallbackDenylist: [dataPath]"))).toEqual(["no-navigate-denylist"]);
  });
  it("finds a fallback page with no denylist", () => {
    expect(codes(withWorkbox("  navigateFallbackDenylist: [/^\\/packs\\//, dataPath],\n", ""))).toEqual(["no-navigate-denylist"]);
  });
  it("accepts a fallback page with a denylist that names the packs", () => expect(codes(withWorkbox("[/^\\/packs\\//, dataPath]", '[/^\\/packs\\//]'))).toEqual([]));
  it("does not judge a denylist held in a variable not found", () => expect(codes(withWorkbox("[/^\\/packs\\//, dataPath]", "deny"))).toEqual([]));
  it("accepts no fallback page and no denylist", () => {
    expect(codes(withWorkbox('  navigateFallback: "index.html",\n  navigateFallbackDenylist: [/^\\/packs\\//, dataPath],\n', ""))).toEqual([]);
  });
});

describe("the rules for pages fetched later", () => {
  it("accepts data that is never kept, and pages kept for a week", () => expect(codes(withRuntime(GOOD_RUNTIME))).toEqual([]));

  it.each([
    ["NetworkFirst"],
    ["CacheFirst"],
    ["StaleWhileRevalidate"],
    ["CacheOnly"],
  ])("finds the data address handled by %s", (h) => {
    const f = audit(withRuntime(`[{ urlPattern: dataPath, handler: "${h}", options: { expiration: { maxEntries: 5 } } }]`));
    expect(f.map((x) => x.code)).toEqual(["data-cached"]);
    expect(f[0]?.detail).toContain(h);
  });
  it("finds a data address written out as a pattern", () => {
    expect(codes(withRuntime(`[{ urlPattern: /^\\/data\\//, handler: "CacheFirst", options: { expiration: { maxEntries: 5 } } }]`))).toEqual(["data-cached"]);
  });
  it("does not take a word that only ends in data for the data address", () => {
    expect(codes(withRuntime(`[{ urlPattern: /metadata/, handler: "CacheFirst", options: { expiration: { maxEntries: 5 } } }]`))).toEqual([]);
  });

  it("finds the offline packs handled by a keeping handler", () => {
    const f = audit(withRuntime(`[{ urlPattern: ({ sameOrigin, url }) => sameOrigin && url.pathname.startsWith("/packs/"), handler: "CacheFirst", options: { expiration: { maxEntries: 5 } } }]`));
    expect(f.map((x) => x.code)).toEqual(["packs-cached"]);
  });
  it("accepts a rule that leaves the packs out", () => {
    expect(codes(withRuntime(`[{ urlPattern: ({ sameOrigin, url }) => sameOrigin && !url.pathname.includes("/packs/"), handler: "NetworkFirst", options: { expiration: { maxEntries: 5 } } }]`))).toEqual([]);
  });
  it("accepts the packs handled by NetworkOnly", () => {
    expect(codes(withRuntime(`[{ urlPattern: /^\\/packs\\//, handler: "NetworkOnly" }]`))).toEqual([]);
  });

  it("finds a pattern that names another address", () => {
    const f = audit(withRuntime(`[{ urlPattern: /^https:\\/\\/tiles\\.example\\.org\\//, handler: "CacheFirst", options: { expiration: { maxEntries: 5 } } }]`));
    expect(f.map((x) => x.code)).toEqual(["third-party-cache"]);
  });
  it("finds a pattern written as a string with an address", () => {
    expect(codes(withRuntime(`[{ urlPattern: "https://api.example.org/", handler: "StaleWhileRevalidate", options: { expiration: { maxEntries: 5 } } }]`))).toEqual(["third-party-cache"]);
  });
  it("accepts another address handled by NetworkOnly, which keeps nothing", () => {
    expect(codes(withRuntime(`[{ urlPattern: "https://api.example.org/", handler: "NetworkOnly" }]`))).toEqual([]);
  });

  it("finds a function pattern that does not check sameOrigin", () => {
    const f = audit(withRuntime(`[{ urlPattern: ({ url }) => url.pathname.endsWith(".js"), handler: "NetworkFirst", options: { expiration: { maxEntries: 5 } } }]`));
    expect(f.map((x) => x.code)).toEqual(["any-origin-cache"]);
  });

  it("finds a keeping handler with no limit at all", () => {
    expect(codes(withRuntime(`[{ urlPattern: /a/, handler: "NetworkFirst" }]`))).toEqual(["unbounded-cache"]);
    expect(codes(withRuntime(`[{ urlPattern: /a/, handler: "NetworkFirst", options: { cacheName: "c", expiration: {} } }]`))).toEqual(["unbounded-cache"]);
  });
  it("accepts a limit on the number alone, or on the time alone", () => {
    expect(codes(withRuntime(`[{ urlPattern: /a/, handler: "NetworkFirst", options: { expiration: { maxEntries: 10 } } }]`))).toEqual([]);
    expect(codes(withRuntime(`[{ urlPattern: /a/, handler: "NetworkFirst", options: { expiration: { maxAgeSeconds: 3600 } } }]`))).toEqual([]);
  });
  it("does not call a limit that is not a plain value missing", () => {
    expect(codes(withRuntime(`[{ urlPattern: /a/, handler: "NetworkFirst", options: { expiration: { maxEntries: LIMIT } } }]`))).toEqual([]);
  });

  it.each([
    [60 * 60 * 24 * 30, []],
    [60 * 60 * 24 * 30 + 1, ["long-max-age"]],
    [60 * 60 * 24 * 365, ["long-max-age"]],
  ])("a time of %i s gives %j", (age, want) => {
    expect(codes(withRuntime(`[{ urlPattern: /a/, handler: "NetworkFirst", options: { expiration: { maxAgeSeconds: ${age} } } }]`))).toEqual(want);
  });
  it.each([
    [200, []],
    [201, ["many-entries"]],
    [5000, ["many-entries"]],
  ])("%i entries gives %j", (n, want) => {
    expect(codes(withRuntime(`[{ urlPattern: /a/, handler: "NetworkFirst", options: { expiration: { maxEntries: ${n} } } }]`))).toEqual(want);
  });
  it("works out a time written as a product", () => {
    expect(codes(withRuntime(`[{ urlPattern: /a/, handler: "NetworkFirst", options: { expiration: { maxAgeSeconds: 60 * 60 * 24 * 90 } } }]`))).toEqual(["long-max-age"]);
  });

  it("does not judge a rule whose handler is not a plain string, and says so", () => {
    const f = audit(withRuntime(`[{ urlPattern: /a/, handler: pick() }]`));
    expect(f.map((x) => x.code)).toEqual(["runtime-unknown"]);
    expect(f[0]?.detail).toBe("the handler of a rule is unknown (pick(…))");
  });
  it("says so when a rule has no pattern that can be read", () => {
    expect(codes(withRuntime(`[{ handler: "NetworkOnly" }]`))).toEqual(["runtime-unknown"]);
  });
  it("says so when the rules are not written out as a list", () => {
    expect(codes(withWorkbox(GOOD_RUNTIME, "rules"))).toEqual(["runtime-unknown"]);
  });
  it("says so when the whole workbox part cannot be read", () => {
    expect(codes(configFile(options({ workbox: "makeWorkbox()" })))).toEqual(["runtime-unknown"]);
  });
  it("gives a finding for each rule", () => {
    const f = audit(withRuntime(`[\n{ urlPattern: /a/, handler: "NetworkFirst" },\n{ urlPattern: /b/, handler: "CacheFirst" },\n]`));
    expect(f.map((x) => x.code)).toEqual(["unbounded-cache", "unbounded-cache"]);
    expect(f[0]?.line).toBeLessThan(f[1]?.line ?? 0);
  });
});

describe("the manifest", () => {
  it("finds a manifest that is not written, and one that is not written out", () => {
    expect(codes(configFile(options({ manifest: null })))).toEqual(["manifest-missing"]);
    expect(codes(configFile(options({ manifest: "makeManifest()" })))).toEqual(["manifest-missing"]);
  });

  it.each([["name"], ["short_name"], ["description"], ["theme_color"], ["background_color"], ["display"], ["start_url"], ["scope"]])("finds %s not written", (field) => {
    const text = GOOD_MANIFEST.split("\n").filter((l) => !l.trimStart().startsWith(`${field}:`)).join("\n");
    const f = audit(configFile(options({ manifest: text })));
    expect(f.map((x) => x.code)).toEqual(["manifest-field"]);
    expect(f[0]?.detail).toBe(`the manifest has no ${field}`);
  });
  it("finds a manifest with no icons", () => {
    const text = GOOD_MANIFEST.slice(0, GOOD_MANIFEST.indexOf("  icons:")) + "}";
    expect(audit(configFile(options({ manifest: text }))).map((f) => f.detail)).toEqual(["the manifest has no icons"]);
  });

  it.each([["standalone", []], ["browser", ["manifest-display"]], ["fullscreen", ["manifest-display"]], ["minimal-ui", ["manifest-display"]]])("display %s gives %j", (d, want) => {
    expect(codes(withManifest('display: "standalone"', `display: "${d}"`))).toEqual(want);
  });
  it("does not judge a display that is not a plain value", () => expect(codes(withManifest('display: "standalone"', "display: mode"))).toEqual([]));

  it("finds start_url and scope written out differently, but not one plain and one unknown, which stays unknown", () => {
    expect(codes(withManifest('scope: base', 'scope: "/app/"'))).toEqual([]);
    expect(codes(withManifest('start_url: base', 'start_url: "/a/"').replace("scope: base", 'scope: "/b/"'))).toEqual(["manifest-scope"]);
  });
  it("accepts start_url and scope written the same, as text or as a name", () => {
    expect(codes(withManifest("scope: base", 'scope: "/"').replace("start_url: base", 'start_url: "/"'))).toEqual([]);
  });
  it("finds one a name and the other a text, as written differently, only when both are plain or both are unknown", () => {
    expect(codes(withManifest("start_url: base", 'start_url: "/"'))).toEqual([]);
    expect(codes(withManifest("scope: base", "scope: root"))).toEqual(["manifest-scope"]);
  });

  it.each([
    ["theme_color", '"#083734"', '"#083734"', []],
    ["theme_color", '"#083734"', '"#fff"', ["manifest-color"]],
    ["theme_color", '"#083734"', '"teal"', ["manifest-color"]],
    ["theme_color", '"#083734"', '"#08373G"', ["manifest-color"]],
    ["background_color", '"#f4f1ea"', '"rgb(1,2,3)"', ["manifest-color"]],
    ["background_color", '"#f4f1ea"', '"#F4F1EA"', []],
  ])("%s %s written as %s gives %j", (field, from, to, want) => {
    expect(codes(withManifest(`${field}: ${from}`, `${field}: ${to}`))).toEqual(want);
  });

  it.each([["en", []], ["fr", []], ["en-CA", []], ["fr-CA", []], ["EN", ["manifest-lang"]], ["english", ["manifest-lang"]], ["en_CA", ["manifest-lang"]], ["", ["manifest-lang"]]])("lang %j gives %j", (lang, want) => {
    expect(codes(withManifest('lang: "en"', `lang: "${lang}"`))).toEqual(want);
  });
  it("finds a lang that is not written", () => expect(codes(withManifest('  lang: "en",\n', ""))).toEqual(["manifest-lang"]));
});

describe("the icons", () => {
  const icons = (...rows: string[]): string => GOOD_MANIFEST.replace(/icons: \[[\s\S]*\],\n}/, `icons: [\n${rows.join(",\n")},\n  ],\n}`);
  const row = (src: string, sizes: string, purpose?: string, type = "image/png"): string => `    { src: "${src}", sizes: "${sizes}", type: "${type}"${purpose === undefined ? "" : `, purpose: "${purpose}"`} }`;
  const run = (m: string): string[] => audit(configFile(options({ manifest: m }))).map((f) => f.detail);

  it("accepts the three icons the App has", () => expect(run(icons(row("icons/a.png", "192x192", "any"), row("icons/b.png", "512x512", "any"), row("icons/b.png", "512x512", "maskable")))).toEqual([]));
  it("takes an icon with no purpose as for any purpose", () => expect(run(icons(row("a.png", "192x192"), row("b.png", "512x512"), row("b.png", "512x512", "maskable")))).toEqual([]));
  it("finds a missing 192 icon", () => expect(run(icons(row("b.png", "512x512", "any"), row("b.png", "512x512", "maskable")))).toEqual(["no icon of 192x192 for any purpose"]));
  it("finds a missing 512 icon", () => expect(run(icons(row("a.png", "192x192", "any"), row("b.png", "512x512", "maskable")))).toEqual(["no icon of 512x512 for any purpose"]));
  it("finds a missing maskable icon", () => expect(run(icons(row("a.png", "192x192", "any"), row("b.png", "512x512", "any")))).toEqual(["no maskable icon of 512x512"]));
  it("finds all three missing when there are no icons in the list", () => expect(run(icons())).toHaveLength(3));
  it("does not take a combined purpose for either", () => expect(run(icons(row("a.png", "192x192", "any maskable"), row("b.png", "512x512", "any"), row("b.png", "512x512", "maskable")))).toEqual(["no icon of 192x192 for any purpose"]));
  it("finds an icon with no src", () => {
    const m = icons(row("a.png", "192x192", "any"), row("b.png", "512x512", "any"), row("b.png", "512x512", "maskable"), '    { sizes: "48x48" }');
    expect(run(m)).toEqual(["an icon has no src"]);
  });
  it.each([["https://cdn.example.org/a.png"], ["//cdn.example.org/a.png"], ["data:image/png;base64,AA"]])("finds an icon at another address: %s", (src) => {
    const m = icons(row(src, "192x192", "any"), row("b.png", "512x512", "any"), row("b.png", "512x512", "maskable"));
    expect(run(m).filter((d) => d.includes("another address"))).toHaveLength(1);
  });
  it("finds an icon type that is not an image type the App ships", () => {
    const m = icons(row("a.png", "192x192", "any", "image/gif"), row("b.png", "512x512", "any"), row("b.png", "512x512", "maskable"));
    expect(run(m)).toEqual(['the icon type "image/gif" is not an image type the App ships']);
  });
  it("accepts an svg icon next to the png ones", () => {
    const m = icons(row("a.png", "192x192", "any"), row("b.png", "512x512", "any"), row("b.png", "512x512", "maskable"), row("c.svg", "any", "any", "image/svg+xml"));
    expect(run(m)).toEqual([]);
  });
  it("does not judge icons that are held in a variable not found", () => expect(run(GOOD_MANIFEST.replace(/icons: \[[\s\S]*\],\n}/, "icons: iconList,\n}"))).toEqual([]));
});

describe("the words in the manifest", () => {
  const withText = (field: string, value: string): string => withManifest(`${field}: "${field === "name" || field === "short_name" ? "the App" : "Prototype for people in Ontario."}"`, `${field}: ${JSON.stringify(value)}`);

  it.each([["name"], ["short_name"], ["description"]])("finds a verification word in %s", (field) => {
    const f = audit(withText(field, "Verified places"));
    expect(f.map((x) => x.code)).toEqual(["verification-wording"]);
    expect(f[0]?.detail.startsWith(field)).toBe(true);
  });
  it.each([["unverified"], ["Verification"], ["vérifié"], ["Vérification"], ["VERIFIED"]])("finds %s", (w) => expect(codes(withText("description", `Records are ${w}.`))).toEqual(["verification-wording"]));
  it("does not find a word that only looks alike", () => expect(codes(withText("description", "Very ready for people in Ontario."))).toEqual([]));
  it("finds the wording once for each field that has it", () => {
    const text = withManifest('name: "the App"', 'name: "Verified"').replace('description: "Prototype for people in Ontario."', 'description: "Not verified."');
    expect(codes(text)).toEqual(["verification-wording", "verification-wording"]);
  });
  it("does not judge a field that is not a plain string", () => expect(codes(withManifest('name: "the App"', "name: appName"))).toEqual([]));
  it("finds a body that the App does not name, in each field, using the shared list of names", () => {
    const needles = forbiddenOrgNeedles();
    expect(needles.length).toBeGreaterThan(0);
    for (const needle of needles) {
      for (const field of ["name", "short_name", "description"]) {
        const f = audit(withText(field, `Made with ${needle} help`));
        expect(f.map((x) => x.code)).toEqual(["manifest-org"]);
      }
    }
  });
});

describe("the order and the text of findings", () => {
  const messy = configFile(options({ registerType: '"autoUpdate"', manifest: GOOD_MANIFEST.replace('display: "standalone"', 'display: "browser"').replace('lang: "en"', 'lang: "x"'), workbox: GOOD_WORKBOX.replace("skipWaiting: false", "skipWaiting: true") }));

  it("is by line, then code", () => {
    const f = audit(messy);
    expect(f.map((x) => x.code).sort()).toEqual(["auto-update", "manifest-display", "manifest-lang", "skip-waiting"]);
    const lines = f.map((x) => x.line);
    expect(lines).toEqual([...lines].sort((a, b) => a - b));
  });
  it("is the same on a second run", () => expect(audit(messy)).toEqual(audit(messy)));
  it("gives a line that is a line of the file", () => {
    const n = messy.split("\n").length;
    for (const f of audit(messy)) {
      expect(f.line).toBeGreaterThan(0);
      expect(f.line).toBeLessThanOrEqual(n);
    }
  });
  it("puts the path and line first", () => {
    const f = audit(messy, "apps/web/vite.config.ts")[0] as PwaFinding;
    expect(formatPwaFinding(f)).toBe(`apps/web/vite.config.ts:${f.line} ${f.code}: ${f.detail}`);
  });
  it("uses a policy that can be changed for a test", () => {
    const c = parsePwaConfig("v.ts", configFile());
    expect(auditPwa(c, { ...PWA_POLICY, display: ["browser"] }).map((f) => f.code)).toEqual(["manifest-display"]);
    expect(auditPwa(c, { ...PWA_POLICY, registerType: "autoUpdate" }).map((f) => f.code)).toEqual(["update-mode-unknown"]);
    expect(auditPwa(c, { ...PWA_POLICY, maxEntries: 10 }).map((f) => f.code)).toEqual(["many-entries"]);
  });
});
