import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { fr as advocacyFr } from "../../../../packages/advocacy/src/i18n/fr.ts";
import { fr as consentFr } from "../../../../packages/consent/src/catalog/fr.ts";
import { PURPOSES } from "../../../../packages/consent/src/purposes.ts";
import { COPY as freshnessCopy } from "../../../../packages/freshness/src/copy.ts";
import { fr as proposalsFr } from "../../../../packages/proposals/src/i18n.ts";
import { fr as sourceStatusFr } from "../../../../packages/source-status/src/catalogs/fr.ts";
import { catalogs as syncCatalogs } from "../../../../packages/sync/src/catalogs.ts";
import { PROMPTS } from "../../../../packages/trip-check/src/catalog.ts";
import { STRINGS as tripCheckStrings } from "../../../../packages/trip-check/src/strings.ts";
import { copy as contributeCopy } from "../contribute/catalog.ts";
import { formatRate, provenanceLine } from "../data-status/dataStatus.ts";
import { buildSourceList, renderSourceListHtml } from "../data-status/sourceList.ts";
import { messages as featureMessages } from "../features/i18n.ts";
import { hubText } from "../hub/i18n.ts";
import { formatIssue } from "../input/voiceAudit.messages.ts";
import { mapMessages } from "../map/i18n.ts";
import { LANE_STRINGS } from "../modules/strings.ts";
import { offlineCatalog } from "../offline/catalog.ts";
import { OFFLINE_STRINGS } from "../offline/robust/regionDownload.ts";
import { PRESSURE_COPY, pressureView } from "../offline/robust/storagePressure.ts";
import { exportPhrases } from "../profile/exportCopy.ts";
import { renderOnDeviceNoticeHtml } from "../privacy/onDeviceNotice/index.ts";
import { EMPTY_KINDS, ERROR_KINDS, getEmptyState, getErrorState } from "../states/stateCopy.ts";
import { en } from "./en.ts";
import { fr } from "./fr.ts";

function leaves(value: unknown, prefix = ""): Array<[string, string]> {
  if (typeof value === "string") return [[prefix, value]];
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => leaves(child, prefix ? `${prefix}.${key}` : key));
}

const SAME_ON_PURPOSE = new Set([
  "appName",
  "language.english",
  "language.french",
  "language.provisional",
]);

describe("shell strings", () => {
  const english = leaves(en);
  const french = new Map(leaves(fr));

  it("has a French string for every English string, with the same placeholders", () => {
    for (const [key, value] of english) {
      const translated = french.get(key);
      expect(translated, key).toBeTypeOf("string");
      const placeholders = (input: string) => [...input.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort();
      expect(placeholders(translated ?? "")).toEqual(placeholders(value));
    }
    expect(french.size).toBe(english.length);
  });

  it("translates sentences instead of copying English, and keeps the product name", () => {
    expect(fr.appName).toBe("the App");
    expect(en.noEndorsement.toLowerCase()).toContain("has endorsed");
    expect(en.noEndorsement.toLowerCase()).toContain("no organisation");
    for (const [key, value] of english) {
      if (SAME_ON_PURPOSE.has(key) || value.length < 40) continue;
      expect(french.get(key), key).not.toBe(value);
    }
  });

  it("puts a no-break space before a French colon", () => {
    for (const [key, value] of french) {
      expect(value, key).not.toMatch(/ :/);
      expect(value, key).not.toContain("\u202f:");
      if (value.includes(":")) expect(value, key).toContain("\u00a0:");
    }
  });

  it("puts a narrow no-break space before French ; ! ? and inside guillemets", () => {
    for (const [key, value] of french) {
      expect(value, key).not.toMatch(/ [;!?]/);
      for (const mark of [";", "!", "?"]) {
        if (value.includes(mark)) expect(value, key).toContain(`\u202f${mark}`);
      }
      if (value.includes("«") || value.includes("»")) {
        expect(value, key).toContain("«\u202f");
        expect(value, key).toContain("\u202f»");
      }
    }
  });

  it("does not claim a partnership, a clinical interval, or a verified place", () => {
    const blob = JSON.stringify({ en, fr }).toLowerCase();
    expect(blob).not.toContain("wheelchair-bound");
    expect(blob).not.toContain("official partner");
    expect(blob).not.toContain("you are eligible");
    expect(blob).not.toContain("vous êtes admissible à");
    expect(blob).not.toContain("clinically proven");
    expect(blob).not.toContain("guaranteed accessible");
    expect(blob).not.toContain("every 15");
    expect(blob).not.toContain("15 to 30");
  });
});


const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

const FR_CATALOG_FILES = [
  "apps/web/src/i18n/fr.ts",
  "packages/advocacy/src/i18n/fr.ts",
  "packages/budgets/catalogs/fr.json",
  "packages/caregiver/src/i18n/fr.json",
  "packages/consent/src/catalog/fr.ts",
  "packages/controls/src/i18n/fr.json",
  "packages/source-status/src/catalogs/fr.ts",
  "packages/sr-switch/src/catalogs/fr.json",
] as const;

function jsonCatalog(rel: string): unknown {
  return JSON.parse(readFileSync(join(REPO_ROOT, rel), "utf8")) as unknown;
}

function listNamedFrCatalogs(root: string): string[] {
  const skip = new Set(["node_modules", ".git", "dist", ".vite", "coverage", ".lanes"]);
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      if (skip.has(name)) continue;
      const path = join(dir, name);
      const stat = statSync(path);
      if (stat.isDirectory()) walk(path);
      else if (name === "fr.ts" || name === "fr.json") found.push(relative(root, path).replaceAll("\\", "/"));
    }
  };
  walk(join(root, "apps"));
  walk(join(root, "packages"));
  return found.sort();
}

function decodeTsStringBody(body: string): string {
  const escapes: Record<string, string> = { n: "\n", r: "\r", t: "\t", "\\": "\\", '"': '"', "'": "'" };
  return body
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\([nrt"'\\])/g, (_, ch: string) => escapes[ch] ?? ch);
}

function torontoPackFrStrings(): Array<[string, string]> {
  const source = readFileSync(join(REPO_ROOT, "apps/web/scripts/build-toronto-pack.ts"), "utf8");
  const out: Array<[string, string]> = [];
  const pattern = /\bfr:\s*"((?:\\.|[^"\\])*)"/g;
  for (const match of source.matchAll(pattern)) {
    out.push([`toronto-pack[${out.length}]`, decodeTsStringBody(match[1] ?? "")]);
  }
  return out;
}

/** Skip URL schemes so https:// in FR copy is not treated as typography. */
function frColonIssues(value: string): string[] {
  const issues: string[] = [];
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] !== ":") continue;
    if (/^[a-z][a-z0-9+.-]*$/i.test(value.slice(Math.max(0, value.lastIndexOf(" ", i) + 1), i)) && value.slice(i, i + 3) === "://") {
      continue;
    }
    if (value.startsWith("http:", i - 4) || value.startsWith("https:", i - 5)) continue;
    const prev = i > 0 ? value[i - 1] : "";
    if (prev !== "\u00a0") {
      issues.push(`U+${prev ? prev.codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0") : "NONE"} before ':' in ${JSON.stringify(value)}`);
    }
  }
  return issues;
}

function productionFilesWithNarrowColon(root: string): string[] {
  const skipDirs = new Set(["node_modules", ".git", "dist", ".vite", "coverage", ".lanes"]);
  const hits: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      if (skipDirs.has(name)) continue;
      const path = join(dir, name);
      const stat = statSync(path);
      if (stat.isDirectory()) {
        walk(path);
        continue;
      }
      if (/\.(test|spec)\.(ts|tsx|js|mjs)$/.test(name) || name === "package-lock.json") continue;
      if (!/\.(ts|tsx|js|mjs|json)$/.test(name)) continue;
      const text = readFileSync(path, "utf8");
      if (text.includes("\u202f:") || text.includes("\\u202f:") || text.includes("\\u202F:")) {
        hits.push(relative(root, path).replaceAll("\\", "/"));
      }
    }
  };
  walk(join(root, "apps"));
  walk(join(root, "packages"));
  return hits.sort();
}

describe("French colon typography across catalogs", () => {
  const catalogLeaves: Array<[string, string]> = [
    ...leaves(fr).map(([key, value]): [string, string] => [`shell.${key}`, value]),
    ...leaves(hubText.fr).map(([key, value]): [string, string] => [`hub.${key}`, value]),
    ...leaves(mapMessages.fr).map(([key, value]): [string, string] => [`map.${key}`, value]),
    ...leaves(featureMessages.fr).map(([key, value]): [string, string] => [`features.${key}`, value]),
    ...leaves(LANE_STRINGS.fr).map(([key, value]): [string, string] => [`lanes.${key}`, value]),
    ...leaves(contributeCopy.fr).map(([key, value]): [string, string] => [`contribute.${key}`, value]),
    ...leaves(offlineCatalog.fr).map(([key, value]): [string, string] => [`offline.${key}`, value]),
    ...leaves(OFFLINE_STRINGS.fr).map(([key, value]): [string, string] => [`regionDownload.${key}`, value]),
    ...leaves(PRESSURE_COPY.fr).map(([key, value]): [string, string] => [`storagePressure.${key}`, value]),
    ...leaves(advocacyFr).map(([key, value]): [string, string] => [`advocacy.${key}`, value]),
    ...leaves(consentFr).map(([key, value]): [string, string] => [`consent.${key}`, value]),
    ...leaves(proposalsFr).map(([key, value]): [string, string] => [`proposals.${key}`, value]),
    ...leaves(sourceStatusFr).map(([key, value]): [string, string] => [`source-status.${key}`, value]),
    ...leaves(syncCatalogs.fr).map(([key, value]): [string, string] => [`sync.${key}`, value]),
    ...leaves(tripCheckStrings.fr).map(([key, value]): [string, string] => [`trip-check.ui.${key}`, value]),
    ...leaves(freshnessCopy.fr).map(([key, value]): [string, string] => [`freshness.${key}`, value]),
    ...leaves(jsonCatalog("packages/budgets/catalogs/fr.json")).map(([key, value]): [string, string] => [`budgets.${key}`, value]),
    ...leaves(jsonCatalog("packages/caregiver/src/i18n/fr.json")).map(([key, value]): [string, string] => [`caregiver.${key}`, value]),
    ...leaves(jsonCatalog("packages/controls/src/i18n/fr.json")).map(([key, value]): [string, string] => [`controls.${key}`, value]),
    ...leaves(jsonCatalog("packages/sr-switch/src/catalogs/fr.json")).map(([key, value]): [string, string] => [`sr-switch.${key}`, value]),
  ];

  const computed: Array<[string, string]> = [
    ...PURPOSES.flatMap((purpose) => leaves({ title: purpose.title.fr, description: purpose.description.fr }, `consent.purpose.${purpose.id}`)),
    ...PROMPTS.map((prompt): [string, string] => [`trip-check.prompt.${prompt.id}`, prompt.text.fr]),
    ...ERROR_KINDS.flatMap((kind) => {
      const view = getErrorState(kind, "fr");
      return leaves({ title: view.title, description: view.description, actions: view.actions.map((action) => action.label) }, `state.error.${kind}`);
    }),
    ...EMPTY_KINDS.flatMap((kind) => {
      const view = getEmptyState(kind, "fr");
      return leaves({ title: view.title, description: view.description, actions: view.actions.map((action) => action.label) }, `state.empty.${kind}`);
    }),
    ...(["label-not-in-name", "target-too-small", "target-size-unknown"] as const).map(
      (kind): [string, string] => [`voiceAudit.${kind}`, formatIssue("fr", kind, "OK")],
    ),
    ["export.separator", exportPhrases("fr").separator],
    ["dataStatus.rate", formatRate(12.5, "fr").ariaLabel],
    ["dataStatus.rateUnknown", formatRate(null, "fr").ariaLabel],
    [
      "dataStatus.provenance",
      provenanceLine({ source: "OpenStreetMap", licence: "ODbL-1.0", retrievedAt: "2026-11-15" }, "fr"),
    ],
    [
      "privacy.notice",
      renderOnDeviceNoticeHtml({
        locale: "fr",
        items: [{ id: "a", label: { en: "Saved places", fr: "Lieux enregistrés" }, where: "on-device" }],
        reviewedOn: "2026-11-15",
      }),
    ],
    ["sourceList.empty", renderSourceListHtml(buildSourceList([], "fr", new Date("2026-11-15T00:00:00Z")), "fr")],
    [
      "sourceList.row",
      renderSourceListHtml(
        buildSourceList(
          [{ id: "osm", name: "OpenStreetMap", licence: "ODbL-1.0", retrievedAt: "2026-11-15", source: "OpenStreetMap" }],
          "fr",
          new Date("2026-11-15T00:00:00Z"),
        ),
        "fr",
      ),
    ],
    [
      "storagePressure.details",
      pressureView(
        {
          phase: "stopped",
          result: {
            regionId: "demo",
            completed: false,
            reason: "quota",
            available: ["a"],
            missing: ["b"],
          },
        },
        "fr",
      ).details,
    ],
    ...torontoPackFrStrings(),
  ];

  it("lists every fr.ts and fr.json catalog in the repo", () => {
    expect(listNamedFrCatalogs(REPO_ROOT)).toEqual([...FR_CATALOG_FILES]);
  });

  it("puts a no-break space, never a narrow no-break space or a regular space, before every French colon", () => {
    const surfaces = [...catalogLeaves, ...computed];
    expect(surfaces.length).toBeGreaterThan(400);
    const hits = surfaces.flatMap(([where, value]) => frColonIssues(value).map((issue) => `${where}: ${issue}`));
    expect(hits).toEqual([]);
  });

  it("fails when production sources still write U+202F before a colon", () => {
    expect(productionFilesWithNarrowColon(REPO_ROOT)).toEqual([]);
  });
});
