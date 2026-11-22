// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { discoverShellFiles } from "./assets";

const origin = window.location.origin;
const base = "/app/";
const entry = "/app/assets/main-H3k.js";

function script(src: string, type = "module"): HTMLScriptElement {
  const node = document.createElement("script");
  node.type = type;
  node.setAttribute("src", src);
  return node;
}

function link(rel: string, href: string): HTMLLinkElement {
  const node = document.createElement("link");
  node.rel = rel;
  node.setAttribute("href", href);
  return node;
}

function read() {
  return discoverShellFiles(document, base);
}

function paths() {
  return read().files.map((file) => file.path);
}

beforeEach(() => {
  window.history.replaceState(null, "", "/app/");
  document.head.replaceChildren();
  document.body.replaceChildren();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.head.replaceChildren();
  document.body.replaceChildren();
});

describe("discovering app shell resources", () => {
  it("collects the document, module, preload and stylesheet from a deployed Vite head", () => {
    document.head.append(
      script(entry),
      link("modulepreload", "/app/assets/vendor-H3k.js"),
      link("stylesheet", "/app/assets/main-H3k.css"),
    );
    const result = read();
    expect(result).toEqual({
      scope: origin + "/app/",
      files: [
        { kind: "document", path: "index.html", url: origin + "/app/index.html" },
        { kind: "script", path: "assets/main-H3k.js", url: origin + entry },
        { kind: "preload", path: "assets/vendor-H3k.js", url: origin + "/app/assets/vendor-H3k.js" },
        { kind: "style", path: "assets/main-H3k.css", url: origin + "/app/assets/main-H3k.css" },
      ],
      limited: false,
    });
  });

  it("anchors index.html to the deployment directory when the user opened a deep link", () => {
    window.history.replaceState(null, "", "/app/nested/route?note=private#fragment");
    document.head.append(script(entry));
    const result = read();
    expect(result.scope).toBe(origin + base);
    expect(result.files[0]?.url).toBe(origin + "/app/index.html");
    expect(result.limited).toBe(false);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/nested|private|fragment/);
  });

  it("also handles a deployment at the origin root", () => {
    window.history.replaceState(null, "", "/offline");
    document.head.append(script("/assets/root.js"));
    const result = discoverShellFiles(document, "/");
    expect(result.scope).toBe(origin + "/");
    expect(result.files.map((file) => file.url)).toEqual([
      origin + "/index.html",
      origin + "/assets/root.js",
    ]);
    expect(result.limited).toBe(false);
  });

  it("uses the browser's effective base for relative resource tags", () => {
    window.history.replaceState(null, "", "/app/deep/article");
    const htmlBase = document.createElement("base");
    htmlBase.href = base;
    document.head.append(htmlBase, script("./assets/main-H3k.js"));
    expect(paths()).toEqual(["index.html", "assets/main-H3k.js"]);
    expect(read().limited).toBe(false);
  });

  it("keeps the build's scope when the HTML base would send relative requests off-site", () => {
    const htmlBase = document.createElement("base");
    htmlBase.href = "https://other.invalid/app/";
    document.head.append(htmlBase, script("assets/offsite.js"), script(origin + entry));
    const result = read();
    expect(result.scope).toBe(origin + "/app/");
    expect(result.files.map((file) => file.path)).toEqual(["index.html", "assets/main-H3k.js"]);
    expect(result.limited).toBe(true);
    expect(JSON.stringify(result)).not.toContain("other.invalid");
  });

  it("resolves a relative deployment base against the page, independently of HTML base", () => {
    window.history.replaceState(null, "", "/some/app/index.html?ref=private");
    const htmlBase = document.createElement("base");
    htmlBase.href = "/some/";
    document.head.append(htmlBase, script("app/assets/main.mjs"));
    const result = discoverShellFiles(document, "./");
    expect(result.scope).toBe(origin + "/some/app/");
    expect(result.files.at(-1)?.url).toBe(origin + "/some/app/assets/main.mjs");
    expect(result.limited).toBe(false);
  });

  it.each([base, "/app", origin + base])("normalizes build base %s to a directory", (value) => {
    window.history.replaceState(null, "", "/app");
    document.head.append(script(entry));
    const result = discoverShellFiles(document, value);
    expect(result.scope).toBe(origin + base);
    expect(result.files[1]?.path).toBe("assets/main-H3k.js");
  });

  it.each([
    "",
    "/outside/",
    "/app?owner=private",
    "/app/#section",
    "/app/%2e%2e/",
    "/app/../",
    "/app//",
    "/app/\u0000",
    " http://localhost/",
    "https://user:password@host.invalid/app/",
    "https://other.invalid/app/",
    "data:text/plain,assets",
    "file:///app/",
    "https://[",
  ])("returns no cache addresses for an unusable build base %j", (value) => {
    document.head.append(script(entry));
    expect(discoverShellFiles(document, value)).toEqual({
      scope: null,
      files: [],
      limited: true,
    });
  });

  it("requires a web document even if the caller knows an absolute deployment URL", () => {
    const detached = document.implementation.createHTMLDocument("preview");
    detached.head.append(script(entry));
    expect(discoverShellFiles(detached, origin + base)).toEqual({
      scope: null,
      files: [],
      limited: true,
    });
  });

  it("uses only the module and stylesheet resources in the supported shell surface", () => {
    const legacy = script("/app/assets/fallback.js", "text/javascript");
    legacy.setAttribute("nomodule", "");
    const inPage = document.createElement("script");
    inPage.type = "module";
    inPage.textContent = "/* inline module */";
    const options = document.createElement("script");
    options.type = "importmap";
    options.textContent = JSON.stringify({ imports: { dependency: "/app/assets/elsewhere.js" } });
    document.head.append(
      legacy, inPage, options, script(entry),
      link("icon", "/app/assets/icon.svg"),
      link("manifest", "/app/manifest.webmanifest"),
      link("prefetch", "/app/assets/later.js"),
      link("preload", "/app/assets/possible.css"),
      link("canonical", "/app/article"),
    );
    document.body.append(script("/app/assets/body.js"), link("stylesheet", "/app/assets/body.css"));
    expect(paths()).toEqual(["index.html", "assets/main-H3k.js"]);
    expect(read().limited).toBe(false);
  });

  it("avoids resources inside inert templates, noscript or foreign metadata", () => {
    const template = document.createElement("template");
    template.content.append(script("/app/assets/example.js"));
    const noscript = document.createElement("noscript");
    noscript.append(link("stylesheet", "/app/assets/no-scripting.css"));
    const foreign = document.createElementNS("http://www.w3.org/2000/svg", "script");
    foreign.setAttribute("src", "/app/assets/foreign.js");
    foreign.setAttribute("type", "module");
    document.head.append(template, noscript, foreign, script(entry));
    expect(paths()).toEqual(["index.html", "assets/main-H3k.js"]);
    expect(read().limited).toBe(false);
  });

  it("accepts module semantics with mixed case and recognizes tokenized link relations", () => {
    const module = script(entry, " MoDuLe ");
    module.setAttribute("nomodule", "");
    const preload = link("dns-prefetch\tMODULEPRELOAD", "/app/assets/shared.mjs");
    preload.setAttribute("as", " SCRIPT ");
    const stylesheet = link("STYLESHEET", "/app/assets/shell/main.css");
    stylesheet.type = "text/CSS";
    document.head.append(module, preload, stylesheet);
    expect(read().files.map((file) => [file.kind, file.path])).toEqual([
      ["document", "index.html"],
      ["script", "assets/main-H3k.js"],
      ["preload", "assets/shared.mjs"],
      ["style", "assets/shell/main.css"],
    ]);
    expect(read().limited).toBe(false);
  });

  it("does not treat worker preloads as page module dependencies", () => {
    const worker = link("modulepreload", "/app/assets/worker.js");
    worker.setAttribute("as", "worker");
    document.head.append(script(entry), worker);
    expect(paths()).toEqual(["index.html", "assets/main-H3k.js"]);
    expect(read().limited).toBe(false);
  });
});

describe("stylesheet applicability", () => {
  it("uses only enabled default stylesheets and understood MIME types", () => {
    const alternate = link("alternate stylesheet", "/app/assets/high-contrast.css");
    alternate.title = "Optional";
    const disabled = link("stylesheet", "/app/assets/disabled.css");
    disabled.setAttribute("disabled", "");
    const switchedOff = link("stylesheet", "/app/assets/switched-off.css");
    switchedOff.disabled = true;
    const unsupported = link("stylesheet", "/app/assets/experimental.css");
    unsupported.type = "text/example";
    document.head.append(script(entry), alternate, disabled, switchedOff, unsupported);
    expect(paths()).toEqual(["index.html", "assets/main-H3k.js"]);
    expect(read().limited).toBe(false);
  });

  it("respects an attached sheet disabled through its CSSOM state", () => {
    const sheet = link("stylesheet", "/app/assets/toggled.css");
    Object.defineProperty(sheet, "sheet", { value: { disabled: true } });
    document.head.append(script(entry), sheet);
    expect(paths()).toEqual(["index.html", "assets/main-H3k.js"]);
  });

  it("measures applicability for the current media rather than counting print-only files", () => {
    const matches = vi.fn((query: string) => ({ matches: query === "screen" }));
    vi.stubGlobal("matchMedia", matches);
    const screen = link("stylesheet", "/app/assets/screen.css");
    screen.media = "screen";
    const print = link("stylesheet", "/app/assets/print.css");
    print.media = "print";
    const preload = link("modulepreload", "/app/assets/printed.mjs");
    preload.media = "print";
    const every = link("stylesheet", "/app/assets/all.css");
    every.media = "ALL";
    document.head.append(script(entry), screen, print, preload, every);
    const result = read();
    expect(result.files.map((file) => file.path)).toEqual([
      "index.html",
      "assets/main-H3k.js",
      "assets/screen.css",
      "assets/all.css",
    ]);
    expect(matches.mock.calls).toEqual([["screen"], ["print"], ["print"]]);
    expect(result.limited).toBe(false);
  });

  it.each(["unavailable", "throws"])("keeps other evidence if a media query API %s", (mode) => {
    vi.stubGlobal("matchMedia", mode === "unavailable" ? undefined : () => {
      throw new Error("media inaccessible");
    });
    const conditional = link("stylesheet", "/app/assets/conditional.css");
    conditional.media = "(min-width: 40rem)";
    document.head.append(conditional, script(entry));
    const result = read();
    expect(result.files.map((file) => file.path)).toEqual(["index.html", "assets/main-H3k.js"]);
    expect(result.limited).toBe(true);
  });
});

describe("file identity and incomplete evidence", () => {
  it("promotes a preload hint to an entry in place and deduplicates equivalent URLs", () => {
    document.head.append(
      link("modulepreload", "./assets/main-H3k.js"),
      link("modulepreload", "/app/assets/vendor.js"),
      script(origin + entry),
      script(entry),
      link("modulepreload", entry),
      link("stylesheet", "/app/assets/main-H3k.css"),
      link("stylesheet", "./assets/main-H3k.css"),
    );
    const result = read();
    expect(result.files.slice(1).map((file) => [file.path, file.kind])).toEqual([
      ["assets/main-H3k.js", "script"],
      ["assets/vendor.js", "preload"],
      ["assets/main-H3k.css", "style"],
    ]);
    expect(result.limited).toBe(false);
  });

  it("retains distinct entrypoints even when files share the same basename", () => {
    document.head.append(
      script("/app/assets/primary/index.mjs"),
      script("/app/assets/secondary/index.mjs"),
    );
    expect(paths()).toEqual(["index.html", "assets/primary/index.mjs", "assets/secondary/index.mjs"]);
    expect(read().limited).toBe(false);
  });

  it.each([
    ["outside the app", "/assets/sensitive.js"],
    ["similar deployment prefix", "/app-old/assets/sensitive.js"],
    ["sibling asset directory", "/app/assets-private/sensitive.js"],
    ["a region pack", "/app/packs/sensitive.js"],
    ["a source file", "/app/src/sensitive.ts"],
    ["a source map", "/app/assets/sensitive.js.map"],
    ["a JSON module", "/app/assets/sensitive.json"],
    ["private query", "/app/assets/sensitive.js?token=secret"],
    ["empty query", "/app/assets/sensitive.js?"],
    ["fragment", "/app/assets/sensitive.js#private"],
    ["empty fragment", "/app/assets/sensitive.js#"],
    ["traversal", "/app/profile/../assets/sensitive.js"],
    ["encoded slash", "/app/assets/one%2fsensitive.js"],
    ["encoded query delimiter", "/app/assets/sensitive%3ftoken.js"],
    ["hidden asset path", "/app/assets/.internal/sensitive.js"],
    ["whitespace", "/app/assets/sens itive.js"],
    ["control character", "/app/assets/\nsensitive.js"],
    ["backslash", "/app/assets\\sensitive.js"],
    ["duplicate slashes", "/app/assets//sensitive.js"],
    ["unrelated origin", "https://third.invalid/app/assets/sensitive.js"],
    ["data URL", "data:application/javascript,sensitive.js"],
    ["blob URL", "blob:https://third.invalid/sensitive.js"],
    ["malformed host", "http://["],
    ["empty src", ""],
  ])("omits %s without exposing its reference in the report", (_reason, src) => {
    document.head.append(script(src), script(entry));
    const result = read();
    expect(result.files.map((file) => file.path)).toEqual(["index.html", "assets/main-H3k.js"]);
    expect(result.limited).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/sensitive|secret|third\.invalid/);
  });

  it("rejects a credential-bearing resource even when it otherwise has the app's origin", () => {
    const address = new URL(entry, origin);
    address.username = "visitor";
    address.password = "personal";
    document.head.append(script(entry), script(address.href));
    const result = read();
    expect(result.limited).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/visitor|personal/);
  });

  it("requires the tag to match the asset kind and preserves other valid addresses", () => {
    document.head.append(
      script(entry),
      script("/app/assets/theme.css"),
      link("stylesheet", "/app/assets/program.js"),
      link("modulepreload", "/app/assets/theme.css"),
    );
    expect(paths()).toEqual(["index.html", "assets/main-H3k.js"]);
    expect(read().limited).toBe(true);
  });

  it("reports missing entry evidence even when index and a hint were observed", () => {
    document.head.append(
      link("modulepreload", entry),
      link("stylesheet", "/app/assets/main-H3k.css"),
    );
    const result = read();
    expect(result.files.map((file) => file.kind)).toEqual(["document", "preload", "style"]);
    expect(result.limited).toBe(true);
  });

  it("reports only index.html when an existing page has no inspectable head", () => {
    document.head.remove();
    try {
      expect(read()).toEqual({
        scope: origin + base,
        files: [{ path: "index.html", kind: "document", url: origin + "/app/index.html" }],
        limited: true,
      });
    } finally {
      document.documentElement.prepend(document.createElement("head"));
    }
  });

  it("discards an overlong resource reference before exposing or matching its path", () => {
    const path = "/app/assets/" + "s".repeat(2100) + ".js";
    document.head.append(script(path), script(entry));
    expect(paths()).toEqual(["index.html", "assets/main-H3k.js"]);
    expect(read().limited).toBe(true);
  });

  it("reflects head changes in a new snapshot without modifying an earlier result", () => {
    document.head.append(script(entry));
    const first = read();
    document.head.firstElementChild?.remove();
    document.head.append(script("/app/assets/rebuilt.js"));
    const second = read();
    expect(first.files[1]?.url).toBe(origin + entry);
    expect(second.files[1]?.url).toBe(origin + "/app/assets/rebuilt.js");
    expect([first.limited, second.limited]).toEqual([false, false]);
  });
});

describe("bounded inspection", () => {
  it("retains all evidence at the resource cap and marks overflow only once an extra file appears", () => {
    document.head.append(script(entry));
    for (let i = 0; i < 62; i++) document.head.append(link("modulepreload", `/app/assets/part-${i}.js`));
    expect(read().files).toHaveLength(64);
    expect(read().limited).toBe(false);

    document.head.append(script(entry));
    expect(read().limited).toBe(false);

    document.head.append(link("modulepreload", "/app/assets/overflow.js"));
    const overflow = read();
    expect(overflow.limited).toBe(true);
    expect(overflow.files).toHaveLength(64);
    expect(overflow.files.at(-1)?.path).toBe("assets/part-61.js");
  });

  it("still upgrades a seen preload after the distinct-file limit is reached", () => {
    document.head.append(link("modulepreload", entry));
    for (let i = 0; i < 63; i++) document.head.append(link("stylesheet", `/app/assets/part-${i}.css`));
    document.head.append(script(entry));
    const result = read();
    expect(result.files).toHaveLength(64);
    expect(result.files[1]?.kind).toBe("script");
    expect(result.limited).toBe(true);
  });

  it("bounds the head traversal itself, including when most elements are unrelated", () => {
    document.head.append(script(entry));
    for (let i = 0; i < 255; i++) document.head.append(document.createElement("meta"));
    expect(read().limited).toBe(false);
    document.head.append(script("/app/assets/beyond-limit.js"));
    const result = read();
    expect(result.files.map((file) => file.path)).toEqual(["index.html", "assets/main-H3k.js"]);
    expect(result.limited).toBe(true);
  });
});
