import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFERENCES, ROUTE_NAMES, SLUGS, assertAccessiblePage, auditPage, createQueue, handleRequest, hrefFor, initialConnectivity,
  type AppDeps, type AppRequest, type Locale, type PlacesLoad, type Preferences,
} from "./index";
import { LOC_PROV, MemoryStore, mkRecord } from "./testHelpers";

const places = [
  mkRecord("hall-1", "Alpha Hall", { elevator: "yes", "step-free-entrance": "yes", "automatic-door": "no" }, { lat: 43.88, lon: -79.44, provenance: LOC_PROV }),
  mkRecord("cafe-2", "Café Nord", { elevator: "unknown", "step-free-entrance": "partial" }),
  mkRecord("blank-3", "Blank <Place>", {}),
];

function deps(over: Partial<AppDeps> & { load?: PlacesLoad } = {}): AppDeps & { store: MemoryStore; saved: Preferences[] } {
  const store = new MemoryStore();
  const saved: Preferences[] = [];
  let n = 0;
  return {
    store,
    saved,
    loadPlaces: async () => over.load ?? { status: "ok", places, fromSavedCopy: false },
    connectivity: initialConnectivity(true),
    today: "2026-11-15",
    savedIds: ["hall-1", "cafe-2"],
    preferences: DEFAULT_PREFERENCES,
    queue: createQueue(store),
    newId: () => `sub-${String(++n).padStart(8, "0")}`,
    savePreferences: (p) => void saved.push(p),
    ...over,
  };
}

const get = (url: string, extra: Partial<AppRequest> = {}): AppRequest => ({ url, ...extra });

describe("every page of the app passes the page audit", () => {
  const urls = (l: Locale): string[] => {
    const slug = (n: (typeof ROUTE_NAMES)[number]) => `/${l}/${SLUGS[n][l]}`;
    return [
      slug("search"), `${slug("search")}?need=elevator`, `${slug("search")}?need=elevator&unk=1`, `${slug("search")}?need=teleporter`, `${slug("search")}?q=zzz`,
      slug("map"), `${slug("map")}?near=43.88,-79.44`, slug("saved"), slug("sources"), slug("settings"),
      `${slug("compare")}?ids=hall-1,cafe-2`, `${slug("compare")}?ids=hall-1`, slug("compare"),
      `${slug("place")}/hall-1`, `${slug("place")}/blank-3`, `${slug("place")}/missing`, `${slug("report")}/hall-1`, `/${l}/nope`,
    ];
  };
  const loads: [string, PlacesLoad][] = [
    ["ok", { status: "ok", places, fromSavedCopy: false }],
    ["saved copy", { status: "ok", places, fromSavedCopy: true }],
    ["empty", { status: "ok", places: [], fromSavedCopy: false }],
    ["error", { status: "error", httpStatus: 503 }],
  ];
  const prefs: Preferences[] = [DEFAULT_PREFERENCES, { locale: "auto", theme: "dark", textScale: 200, reduceMotion: true }];

  for (const locale of ["en", "fr"] as const) {
    for (const [label, load] of loads) {
      for (const [ci, connectivity] of [initialConnectivity(true), { status: "offline", lastSavedOn: "2026-11-01" } as const].entries()) {
        it(`${locale} / ${label} / ${ci === 0 ? "online" : "offline"}`, async () => {
          for (const preferences of prefs) {
            for (const url of urls(locale)) {
              const res = await handleRequest(get(url), deps({ load, connectivity, preferences }));
              expect(res.status, url).toBeGreaterThanOrEqual(200);
              if (res.status === 302) continue;
              try {
                assertAccessiblePage(res.html, locale);
              } catch (e) {
                throw new Error(`${url} (${res.status}): ${(e as Error).message}`);
              }
            }
          }
        });
      }
    }
  }
});

describe("routing and status codes", () => {
  it("redirects the root using the saved language, else Accept-Language", async () => {
    expect((await handleRequest(get("/", { acceptLanguage: "fr-CA" }), deps()))).toMatchObject({ status: 302, headers: { location: "/fr/recherche" } });
    expect((await handleRequest(get("/", { acceptLanguage: "fr" }), deps({ preferences: { ...DEFAULT_PREFERENCES, locale: "en" } })))).toMatchObject({
      headers: { location: "/en/search" },
    });
  });
  it("returns 404 for unknown pages and places, with the right language", async () => {
    const nf = await handleRequest(get("/fr/zzz"), deps());
    expect(nf.status).toBe(404);
    expect(nf.html).toContain('<html lang="fr"');
    expect(nf.html).toContain("Cette page est introuvable");
    expect((await handleRequest(get("/en/place/missing"), deps())).status).toBe(404);
    expect((await handleRequest(get("/en/report/missing"), deps())).status).toBe(404);
  });
  it("returns 503 when data cannot be loaded, and the offline message when offline", async () => {
    const d = deps({ load: { status: "error" }, connectivity: initialConnectivity(false) });
    for (const path of ["search", "map", "saved", "compare", "sources", "place/hall-1", "report/hall-1"]) {
      const res = await handleRequest(get(`/en/${path}`), d);
      expect(res.status, path).toBe(503);
      expect(res.html, path).toContain("You are offline");
    }
  });
  it("serves settings even when data cannot load", async () => {
    expect((await handleRequest(get("/en/settings"), deps({ load: { status: "error" } }))).status).toBe(200);
  });
});

describe("search", () => {
  it("shows matches only, with links to place pages, and a control for the UNKNOWN places", async () => {
    const res = await handleRequest(get("/en/search?need=elevator"), deps());
    expect(res.html).toContain('href="/en/place/hall-1"');
    expect(res.html).not.toContain('href="/en/place/cafe-2"');
    expect(res.html).toContain("2 more places have UNKNOWN details");
    expect(res.html).toContain('data-include-unknown="1"');
  });
  it("includes UNKNOWN places, labelled, when asked", async () => {
    const res = await handleRequest(get("/en/search?need=elevator&unk=1"), deps());
    expect(res.html).toContain('href="/en/place/cafe-2"');
    expect(res.html).toContain("UNKNOWN: Elevator");
  });
  it("links the language switch to the same filtered page", async () => {
    const res = await handleRequest(get("/en/search?need=elevator&unk=1"), deps());
    expect(res.html).toContain('href="/fr/recherche?need=elevator&amp;unk=1" hreflang="fr"');
  });
});

describe("place page", () => {
  it("shows reported details with sources, UNKNOWN for the rest, and a suggest link", async () => {
    const res = await handleRequest(get("/en/place/hall-1"), deps());
    expect(res.status).toBe(200);
    expect(res.html).toContain("<h1>Alpha Hall</h1>");
    expect(res.html).toContain("Yes (reported)");
    expect(res.html).toContain("No (reported)");
    expect(res.html).toContain("Source: Test source");
    expect(res.html).toContain('href="/en/report/hall-1"');
  });
  it("escapes the place name in the heading and title", async () => {
    const res = await handleRequest(get("/en/place/blank-3"), deps());
    expect(res.html).toContain("<h1>Blank &lt;Place&gt;</h1>");
    expect(res.html).toContain("<title>Blank &lt;Place&gt; – the App</title>");
    expect(res.html).toContain("Accessibility: UNKNOWN");
  });
  it("notes when it comes from a saved copy", async () => {
    const res = await handleRequest(get("/fr/lieu/hall-1"), deps({ load: { status: "ok", places, fromSavedCopy: true } }));
    expect(res.html).toContain("copie enregistrée sur cet appareil");
  });
});

describe("saved, map, compare and sources", () => {
  it("lists only saved places", async () => {
    const res = await handleRequest(get("/en/saved"), deps());
    expect(res.html).toContain("Alpha Hall");
    expect(res.html).toContain("Café Nord");
    expect(res.html).not.toContain("Blank");
  });
  it("uses the empty state when nothing is saved", async () => {
    expect((await handleRequest(get("/en/saved"), deps({ savedIds: [] }))).html).toContain("No saved places yet");
  });
  it("sorts the map by distance and keeps UNKNOWN locations unplaced", async () => {
    const res = await handleRequest(get("/en/map?near=43.88,-79.44"), deps());
    expect(res.html).toContain("geo:43.88000,-79.44000");
    expect(res.html.match(/Location UNKNOWN/g)).toHaveLength(2);
    expect(res.html).not.toMatch(/https?:\/\/|mapbox|googleapis/i);
  });
  it("compares places and lists sources", async () => {
    const cmp = await handleRequest(get("/en/compare?ids=hall-1,cafe-2"), deps());
    expect(cmp.html).toContain("<table>");
    expect(cmp.html).toContain("Not the same for every place");
    const src = await handleRequest(get("/fr/sources"), deps());
    expect(src.html).toContain("Sources et licences");
    expect(src.html).toContain("OpenStreetMap contributors");
  });
});

describe("page shell", () => {
  it("has a skip link first, one h1, labelled navigation and a language switch", async () => {
    const res = await handleRequest(get("/en/map"), deps());
    expect(res.html.indexOf('href="#main"')).toBeLessThan(res.html.indexOf("<nav"));
    expect(res.html.match(/<h1>/g)).toHaveLength(1);
    expect(res.html).toContain('<nav aria-label="Main">');
    expect(res.html).toContain('aria-current="page"');
    expect(res.html).toContain('hreflang="fr"');
  });
  it("applies text size and reduced motion preferences", async () => {
    const res = await handleRequest(get("/en/map"), deps({ preferences: { ...DEFAULT_PREFERENCES, textScale: 200, reduceMotion: true, theme: "dark" } }));
    expect(res.html).toContain('<html lang="en" style="font-size:200%">');
    expect(res.html).toContain("animation:none!important");
    expect(res.html).toContain("color:#F2F2F2;background:#121212");
  });
  it("audit fails if a page loses its skip link", async () => {
    const res = await handleRequest(get("/en/map"), deps());
    expect(() => assertAccessiblePage(res.html.replace('href="#main"', 'href="/"'), "en")).toThrow(/skip link/);
    expect(auditPage(res.html, "en")).toEqual([]);
  });
});

describe("suggest a correction", () => {
  const post = (form: Record<string, string>, d = deps(), url = "/en/report/hall-1") =>
    handleRequest({ url, method: "POST", form }, d).then((res) => ({ res, d }));

  it("shows the form", async () => {
    const res = await handleRequest(get("/en/report/hall-1"), deps());
    expect(res.status).toBe(200);
    expect(res.html).toContain('<form method="post"');
  });
  it("saves a valid suggestion to the offline queue and confirms", async () => {
    const { res, d } = await post({ feature: "elevator", suggested: "no", note: "Out of service", contact: "a@b.co", consent: "on" });
    expect(res.status).toBe(200);
    expect(res.html).toContain("Suggestion saved on this device.");
    const [item] = d.queue.list();
    expect(item).toMatchObject({ id: "sub-00000001", status: "pending", payload: { placeId: "hall-1", feature: "elevator", suggested: "no", contact: "a@b.co" } });
    assertAccessiblePage(res.html, "en");
  });
  it("does not store contact details without consent", async () => {
    const { res } = await post({ feature: "elevator", suggested: "yes", contact: "a@b.co" });
    expect(res.status).toBe(422);
    expect(res.html).toContain("Tick the box");
  });
  it("re-renders with errors, keeps what was typed, and stores nothing", async () => {
    const { res, d } = await post({ feature: "", suggested: "yes", note: "keep this" });
    expect(res.status).toBe(422);
    expect(res.html).toContain("Choose a detail.");
    expect(res.html).toContain("keep this");
    expect(d.queue.list()).toEqual([]);
    assertAccessiblePage(res.html, "en");
  });
  it("ignores a place id forged in the form body", async () => {
    const { d } = await post({ placeId: "cafe-2", feature: "elevator", suggested: "yes" });
    expect(d.queue.list()[0]!.payload.placeId).toBe("hall-1");
  });
  it("reports a full queue without losing the form", async () => {
    const d = deps();
    const filler = (n: number) => ({ id: `fill-${String(n).padStart(8, "0")}`, createdOn: "2026-11-15", status: "pending" as const, attempts: 0, nextAttemptAt: 0, payload: { placeId: "hall-1", feature: "elevator" as const, suggested: "yes" as const, note: "", contact: null } });
    for (let i = 0; i < 50; i++) d.queue.enqueue(filler(i));
    const { res } = await post({ feature: "elevator", suggested: "yes" }, d);
    expect(res.status).toBe(429);
    expect(res.html).toContain("Too many suggestions");
  });
  it("works in French", async () => {
    const { res } = await post({ feature: "elevator", suggested: "yes" }, deps(), "/fr/signaler/hall-1");
    expect(res.html).toContain("Suggestion enregistrée sur cet appareil.");
  });
});

describe("settings", () => {
  it("saves valid settings and shows the page in the chosen language", async () => {
    const d = deps();
    const res = await handleRequest({ url: "/en/settings", method: "POST", form: { locale: "fr", theme: "dark", textScale: "150", reduceMotion: "on" } }, d);
    expect(res.status).toBe(200);
    expect(d.saved).toEqual([{ locale: "fr", theme: "dark", textScale: 150, reduceMotion: true }]);
    expect(res.html).toContain("Paramètres enregistrés sur cet appareil.");
    expect(res.html).toContain('<html lang="fr" style="font-size:150%">');
    assertAccessiblePage(res.html, "fr");
  });
  it("resets tampered settings and says so", async () => {
    const d = deps();
    const res = await handleRequest({ url: "/en/settings", method: "POST", form: { locale: "de", textScale: "9999" } }, d);
    expect(res.status).toBe(422);
    expect(res.html).toContain("Some settings were not valid and were reset.");
    expect(d.saved[0]).toEqual(DEFAULT_PREFERENCES);
  });
});

describe("wiring", () => {
  it("every nav link in the shell resolves to a page that exists", async () => {
    const res = await handleRequest(get("/en/search"), deps());
    const hrefs = [...res.html.matchAll(/<li[^>]*><a href="([^"]+)"/g)].map((m) => m[1]!);
    expect(hrefs).toEqual(["search", "map", "saved", "compare", "sources", "settings"].map((n) => hrefFor("en", n as never)));
    for (const h of hrefs) expect((await handleRequest(get(h), deps())).status).toBe(200);
  });
});
