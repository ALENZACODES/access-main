import { describe, expect, it } from "vitest";
import { assetPath, compareAccepted, compareAssets, compareSettings, countFindings, flattenConfig, formatPwaProblem, formatPwaProblems, namedAssets } from "./pwaCompare";
import { configFile, options, withManifest, withRuntime, withWorkbox } from "./pwaFixture";
import { parsePwaConfig, type PwaConfig } from "./pwaModel";
import { PWA_ACCEPTED, PWA_REGISTER, type PwaAcceptRow, type PwaRegister } from "./pwaRegister";
import type { PwaFinding } from "./pwaRules";

const PATH = PWA_REGISTER.path;
const read = (text: string): PwaConfig => parsePwaConfig(PATH, text);
const good = (): PwaConfig => read(configFile());
const png = (w: number, h: number): Uint8Array => {
  const u32 = (n: number): number[] => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  return Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...u32(w), ...u32(h), 8, 6, 0, 0, 0]);
};
const finding = (code: PwaFinding["code"], path = PATH): PwaFinding => ({ code, path, line: 1, detail: "d" });

describe("flattenConfig", () => {
  it("gives one text per setting for the good file", () => {
    const f = flattenConfig(good());
    expect(f["registerType"]).toBe("prompt");
    expect(f["manifest.display"]).toBe("standalone");
    expect(f["manifest.start_url"]).toBe("unknown:base");
    expect(f["workbox.skipWaiting"]).toBe("false");
    expect(f["workbox.runtime.count"]).toBe("2");
    expect(f["workbox.runtime.0"]).toBe("dataPath|NetworkOnly|absent|absent|absent|absent");
    expect(f["workbox.runtime.1"]).toBe("function|NetworkFirst|shell-pages|4|32|604800");
    expect(f["manifest.icons"]).toBe('["icons/icon-192.png|192x192|any","icons/icon-512.png|512x512|any","icons/icon-512.png|512x512|maskable"]');
  });
  it("is empty when the plugin is not called or the options are not written out", () => {
    expect(flattenConfig(read("export default {};"))).toEqual({});
    expect(flattenConfig(read("VitePWA(opts)"))).toEqual({});
  });
  it("writes a setting that is not written as absent and one that cannot be worked out as unknown", () => {
    const f = flattenConfig(read(configFile(options({ registerType: "mode", includeAssets: null }))));
    expect(f["registerType"]).toBe("unknown:mode");
    expect(f["includeAssets"]).toBe("absent");
  });
  it("leaves out the manifest settings when the manifest is not written out", () => {
    const f = flattenConfig(read(configFile(options({ manifest: "m()" }))));
    expect(Object.keys(f).some((k) => k.startsWith("manifest."))).toBe(false);
  });
  it("counts no rules when the key is not written, and says unknown when it is not a list", () => {
    expect(flattenConfig(read(configFile(options({ workbox: "{ skipWaiting: false }" }))))["workbox.runtime.count"]).toBe("0");
    expect(flattenConfig(read(withWorkbox("runtimeCaching: [", "runtimeCaching: x, ignored: [")))["workbox.runtime.count"]).toBe("unknown:runtimeCaching");
  });
  it("writes the purpose of an icon with none as any", () => {
    const f = flattenConfig(read(withManifest('sizes: "192x192", type: "image/png", purpose: "any"', 'sizes: "192x192", type: "image/png"')));
    expect(f["manifest.icons"]?.startsWith('["icons/icon-192.png|192x192|any"')).toBe(true);
  });
  it("writes a rule with no cache name or limits with absent in their places", () => {
    expect(flattenConfig(read(withRuntime("[{ urlPattern: /a/, handler: 'CacheFirst' }]")))["workbox.runtime.0"]).toBe("/a/|CacheFirst|absent|absent|absent|absent");
  });
  it("writes a rule with no pattern with absent for it", () => {
    expect(flattenConfig(read(withRuntime("[{ handler: 'CacheFirst' }]")))["workbox.runtime.0"]).toBe("absent|CacheFirst|absent|absent|absent|absent");
  });
});

describe("compareSettings", () => {
  it("has no difference for the good file", () => expect(compareSettings(good(), PWA_REGISTER)).toEqual([]));

  it("says when the plugin is not called", () => {
    const p = compareSettings(read("export default {};"), PWA_REGISTER);
    expect(p).toEqual([{ code: "setting-gone", key: "VitePWA", detail: `no call of VitePWA in ${PATH}` }]);
  });

  it.each([
    ["registerType", configFile(options({ registerType: '"autoUpdate"' })), "register prompt; file autoUpdate"],
    ["workbox.skipWaiting", withWorkbox("skipWaiting: false", "skipWaiting: true"), "register false; file true"],
    ["workbox.navigateFallback", withWorkbox('"index.html"', '"other.html"'), "register index.html; file other.html"],
    ["manifest.display", withManifest("standalone", "browser"), "register standalone; file browser"],
    ["manifest.theme_color", withManifest("#083734", "#000000"), "register #083734; file #000000"],
    ["manifest.lang", withManifest('lang: "en"', 'lang: "fr"'), "register en; file fr"],
    ["workbox.runtime.1", withRuntime(GOOD_ONE("NetworkFirst", 64)), null],
  ])("finds a change in %s", (key, text, detail) => {
    const p = compareSettings(read(text), PWA_REGISTER);
    expect(p.map((x) => [x.code, x.key])).toEqual([["setting-changed", key]]);
    if (detail !== null) expect(p[0]?.detail).toBe(detail);
  });

  it("finds a start_url that stops being unknown, because it is now written out", () => {
    const p = compareSettings(read(withManifest("start_url: base", 'start_url: "/"')), PWA_REGISTER);
    expect(p).toEqual([{ code: "setting-changed", key: "manifest.start_url", detail: "register unknown:base; file /" }]);
  });

  it("finds a rule added, and the count that changes with it", () => {
    const p = compareSettings(read(withRuntime(`[{ urlPattern: dataPath, handler: "NetworkOnly" }, ${GOOD_ONE_BODY("NetworkFirst", 32)}, { urlPattern: /b/, handler: "NetworkOnly" }]`)), PWA_REGISTER);
    expect(p.map((x) => [x.code, x.key])).toEqual([["setting-added", "workbox.runtime.2"], ["setting-changed", "workbox.runtime.count"]]);
  });
  it("finds a rule gone, and the count that changes with it", () => {
    const p = compareSettings(read(withRuntime(`[{ urlPattern: dataPath, handler: "NetworkOnly" }]`)), PWA_REGISTER);
    expect(p.map((x) => [x.code, x.key])).toEqual([["setting-gone", "workbox.runtime.1"], ["setting-changed", "workbox.runtime.count"]]);
  });
  it("finds a pattern added to the install list", () => {
    const p = compareSettings(read(withWorkbox('"**/*.{js,css,html,svg,png,webmanifest}"', '"**/*.{js,css,html,svg,png,webmanifest}", "**/*.json"')), PWA_REGISTER);
    expect(p.map((x) => x.key)).toEqual(["workbox.globPatterns"]);
  });
  it("finds a setting that is no longer written, as gone", () => {
    const p = compareSettings(read(withWorkbox("  clientsClaim: true,\n", "")), PWA_REGISTER);
    expect(p.map((x) => [x.code, x.key, x.detail])).toEqual([["setting-changed", "workbox.clientsClaim", "register true; file absent"]]);
  });
  it("finds the manifest settings gone when the manifest is no longer written out", () => {
    const p = compareSettings(read(configFile(options({ manifest: "m()" }))), PWA_REGISTER);
    expect(p.every((x) => x.code === "setting-gone" && x.key.startsWith("manifest."))).toBe(true);
    expect(p).toHaveLength(7);
  });
  it("finds a setting that the register does not list", () => {
    const reg: PwaRegister = { ...PWA_REGISTER, settings: Object.fromEntries(Object.entries(PWA_REGISTER.settings).filter(([k]) => k !== "includeAssets")) };
    expect(compareSettings(good(), reg).map((x) => [x.code, x.key])).toEqual([["setting-added", "includeAssets"]]);
  });
  it("finds a configuration read from another path", () => {
    expect(compareSettings(parsePwaConfig("other.ts", configFile()), PWA_REGISTER).map((x) => x.key)).toEqual(["path"]);
  });
  it("gives the problems in key order", () => {
    const p = compareSettings(read(withManifest("standalone", "browser").replace("skipWaiting: false", "skipWaiting: true")), PWA_REGISTER);
    expect(p.map((x) => x.key)).toEqual(["manifest.display", "workbox.skipWaiting"]);
  });
});

function GOOD_ONE_BODY(handler: string, entries: number): string {
  return `{ urlPattern: ({ sameOrigin, url }) => sameOrigin && !url.pathname.startsWith("/packs/"), handler: "${handler}", options: { cacheName: "shell-pages", networkTimeoutSeconds: 4, expiration: { maxEntries: ${entries}, maxAgeSeconds: 60 * 60 * 24 * 7 } } }`;
}
function GOOD_ONE(handler: string, entries: number): string {
  return `[{ urlPattern: dataPath, handler: "NetworkOnly" }, ${GOOD_ONE_BODY(handler, entries)}]`;
}

describe("countFindings", () => {
  it("counts by path and code", () => {
    const m = countFindings([finding("long-max-age"), finding("long-max-age"), finding("many-entries"), finding("long-max-age", "b.ts")]);
    expect(m.get(`${PATH}\u0000long-max-age`)).toBe(2);
    expect(m.get(`${PATH}\u0000many-entries`)).toBe(1);
    expect(m.get("b.ts\u0000long-max-age")).toBe(1);
    expect(m.size).toBe(3);
  });
  it("is empty for no findings", () => expect(countFindings([]).size).toBe(0));
});

describe("compareAccepted", () => {
  const rows: PwaAcceptRow[] = [{ path: PATH, code: "verification-wording", count: 1, reason: "A real reason that is long enough." }];

  it("has no difference when the findings are exactly the accepted ones", () => expect(compareAccepted([finding("verification-wording")], rows)).toEqual([]));
  it("has no difference for no findings and no accepted rows", () => expect(compareAccepted([], [])).toEqual([]));
  it("finds a finding that is not accepted", () => {
    const p = compareAccepted([finding("verification-wording"), finding("skip-waiting")], rows);
    expect(p).toEqual([{ code: "finding-not-accepted", key: `${PATH} skip-waiting`, detail: "1 finding not on the accepted list" }]);
  });
  it("says findings in the plural", () => expect(compareAccepted([finding("auto-update"), finding("auto-update")], [])[0]?.detail).toBe("2 findings not on the accepted list"));
  it("finds an accepted finding that is gone", () => {
    expect(compareAccepted([], rows)).toEqual([{ code: "accepted-gone", key: `${PATH} verification-wording`, detail: "accepted ×1 but no longer found; remove it from the list" }]);
  });
  it("finds a count that changed", () => {
    const p = compareAccepted([finding("verification-wording"), finding("verification-wording")], rows);
    expect(p).toEqual([{ code: "count-changed", key: `${PATH} verification-wording`, detail: "accepted ×1, found ×2" }]);
  });
  it("finds a code that may not be accepted, even when it is found the right number of times", () => {
    const bad: PwaAcceptRow[] = [{ path: PATH, code: "auto-update", count: 1, reason: "A real reason that is long enough." }];
    expect(compareAccepted([finding("auto-update")], bad).map((x) => x.code)).toEqual(["unacceptable-code"]);
  });
  it("does not take a finding in another path for the accepted one", () => {
    expect(compareAccepted([finding("verification-wording", "other.ts")], rows).map((x) => x.code)).toEqual(["accepted-gone", "finding-not-accepted"].sort());
  });
  it("is sorted by key", () => {
    const p = compareAccepted([finding("skip-waiting"), finding("auto-update")], []);
    expect(p.map((x) => x.key)).toEqual([`${PATH} auto-update`, `${PATH} skip-waiting`]);
  });
  it("agrees with the real accepted list for the good file with the wording in it", () => {
    expect(compareAccepted([{ ...finding("verification-wording"), line: 149 }], PWA_ACCEPTED)).toEqual([]);
  });
});

describe("assetPath and namedAssets", () => {
  it.each([["icons/a.png", "icons/a.png"], ["./icons/a.png", "icons/a.png"], ["/icons/a.png", "icons/a.png"], ["././a.png", "a.png"], ["//a.png", "a.png"], ["a.png", "a.png"]])("%s is %s", (s, out) => expect(assetPath(s)).toBe(out));

  it("lists the extra files and the icons, each once, in order", () => expect(namedAssets(good())).toEqual(["favicon.svg", "icons/icon-192.png", "icons/icon-512.png"]));
  it("lists nothing for a file with no plugin", () => expect(namedAssets(read(""))).toEqual([]));
  it("lists the icons when the extra files are not written", () => expect(namedAssets(read(configFile(options({ includeAssets: null }))))).toEqual(["icons/icon-192.png", "icons/icon-512.png"]));
  it("leaves out a source that is not a plain string", () => expect(namedAssets(read(withManifest('src: "icons/icon-192.png"', "src: iconPath")))).toEqual(["favicon.svg", "icons/icon-192.png", "icons/icon-512.png"]));
});

describe("compareAssets", () => {
  const files = (over: Record<string, Uint8Array | null> = {}): Map<string, Uint8Array | null> =>
    new Map<string, Uint8Array | null>(Object.entries({ "favicon.svg": Uint8Array.of(60), "icons/icon-192.png": png(192, 192), "icons/icon-512.png": png(512, 512), ...over }));

  it("has no difference when the files are there at the sizes the manifest gives", () => expect(compareAssets(good(), files())).toEqual([]));
  it("finds a file that is not there, whether it is null or not in the map", () => {
    expect(compareAssets(good(), files({ "favicon.svg": null })).map((x) => [x.code, x.key])).toEqual([["asset-missing", "favicon.svg"]]);
    const m = files();
    m.delete("favicon.svg");
    expect(compareAssets(good(), m).map((x) => x.code)).toEqual(["asset-missing"]);
  });
  it("finds an icon that is not a PNG", () => {
    const p = compareAssets(good(), files({ "icons/icon-192.png": Uint8Array.of(1, 2, 3) }));
    expect(p).toEqual([{ code: "icon-not-png", key: "icons/icon-192.png", detail: "icons/icon-192.png does not start like a PNG file" }]);
  });
  it("finds an icon of another size than the manifest says", () => {
    const p = compareAssets(good(), files({ "icons/icon-512.png": png(256, 256) }));
    const one = { code: "icon-size-differs", key: "icons/icon-512.png", detail: "icons/icon-512.png is 256x256; the manifest says 512x512" };
    expect(p).toEqual([one, one]);
  });
  it("finds an icon that is not square, and that it differs", () => {
    const p = compareAssets(good(), files({ "icons/icon-192.png": png(192, 100) }));
    expect(p.map((x) => x.code)).toEqual(["icon-not-square", "icon-size-differs"]);
  });
  it("reads an icon used twice once for each use", () => {
    const p = compareAssets(good(), files({ "icons/icon-512.png": png(1, 1) }));
    expect(p.filter((x) => x.code === "icon-size-differs")).toHaveLength(2);
  });
  it("does not judge a size or a source that is not a plain string", () => {
    expect(compareAssets(read(withManifest('sizes: "192x192"', "sizes: SIZE")), files({ "icons/icon-192.png": png(5, 5) }))).toEqual([]);
  });
  it("does not read the size of an icon whose type is not png", () => {
    const c = read(withManifest('sizes: "192x192", type: "image/png"', 'sizes: "192x192", type: "image/svg+xml"'));
    expect(compareAssets(c, files({ "icons/icon-192.png": Uint8Array.of(1) }))).toEqual([]);
  });
  it("finds nothing to check for a file with no plugin", () => expect(compareAssets(read(""), new Map())).toEqual([]));
});

describe("formatting", () => {
  const p = { code: "setting-changed", key: "registerType", detail: "register prompt; file autoUpdate" } as const;
  it("writes a problem as one line", () => expect(formatPwaProblem(p)).toBe("setting-changed registerType: register prompt; file autoUpdate"));
  it("writes problems one to a line", () => expect(formatPwaProblems([p, { ...p, key: "b" }]).split("\n")).toHaveLength(2));
  it("writes no problems as nothing", () => expect(formatPwaProblems([])).toBe(""));
});
