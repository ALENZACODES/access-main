import { describe, expect, it } from "vitest";
import indexHtml from "../../index.html?raw";
import viteConfig from "../../vite.config.ts?raw";
import { en } from "./en.ts";
import { fr } from "./fr.ts";

/**
 * Day 24 endorsement sweep for the shell. Every user-facing string, the page
 * description, and the install manifest are scanned in both languages.
 * A hit is a confirmed overclaim to fix, not a style note.
 */
function leaves(value: unknown, prefix = ""): Array<[string, string]> {
  if (typeof value === "string") return [[prefix, value]];
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => leaves(child, prefix ? `${prefix}.${key}` : key));
}

function between(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  return from < 0 ? "" : source.slice(from, source.indexOf(end, from));
}

const SURFACES: Array<[string, string]> = [
  ...leaves(en).map(([key, text]): [string, string] => [`en.${key}`, text]),
  ...leaves(fr).map(([key, text]): [string, string] => [`fr.${key}`, text]),
  ["index.html", between(indexHtml, "<head>", "</head>")],
  ["webmanifest", between(viteConfig, "manifest: {", "icons:")],
];

const RULES: Array<{ id: string; pattern: RegExp }> = [
  { id: "endorsement", pattern: /\b(endorsed by|approved by|in partnership with|official (partner|app)|partnered with)\b/i },
  { id: "endorsement-fr", pattern: /\b(approuvée? par|en partenariat avec|partenaire officiel|application officielle)\b/i },
  { id: "verified-claim", pattern: /(?<!un)(?<!not )\bverified (place|places|data|record|records|accessible|entrance)\b/i },
  { id: "verified-claim-fr", pattern: /(?<!non )\b(lieu|lieux|données|enregistrement)s? vérifiée?s?\b/i },
  { id: "guarantee", pattern: /\b(guaranteed|always accessible|fully accessible|100% accessible|garanti(e|s)?|entièrement accessible)\b/i },
  { id: "live-claim", pattern: /\b(real-time|live status is (on|shown|current))\b|\ben temps réel\b/i },
  { id: "medical-instruction", pattern: /\b(you should (take|stop|change)|consult your doctor before|dosage|medication schedule|pressure relief every|vous devriez prendre|posologie)\b/i },
  { id: "eligibility", pattern: /\b(you are eligible|vous êtes admissible|vous avez droit)\b|(?<!whether )(?<!if )\byou qualify\b/i },
  { id: "ai-mention", pattern: /\b(AI|A\.I\.|IA|artificial intelligence|intelligence artificielle|machine learning|chatbot|LLM|GPT|Claude)\b/ },
];

describe("endorsement and overclaim sweep", () => {
  it("covers every shell string and the install surfaces", () => {
    expect(SURFACES.length).toBeGreaterThan(400);
    expect(SURFACES.find(([where]) => where === "index.html")?.[1]).toContain("description");
    expect(SURFACES.find(([where]) => where === "webmanifest")?.[1]).toContain("description");
  });

  it("finds no endorsement, verification, guarantee, live, medical, eligibility, or AI claim", () => {
    const hits: string[] = [];
    for (const [where, text] of SURFACES) {
      for (const rule of RULES) {
        if (rule.pattern.test(text)) hits.push(`${where} [${rule.id}] ${text.slice(0, 120)}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("keeps the no-endorsement, no-medical-advice, and unverified statements in both languages", () => {
    expect(en.noEndorsement).toMatch(/^No organisation/);
    expect(fr.noEndorsement).toMatch(/^Aucune organisation/);
    expect(en.noMedical).toContain("does not give medical advice");
    expect(fr.noMedical).toContain("ne donne pas de conseil médical");
    expect(en.prototypeBanner).toContain("unverified");
    expect(fr.prototypeBanner).toContain("non vérifié");
  });

  it("catches the overclaims it is meant to catch", () => {
    const samples = [
      "Endorsed by Spinal Cord Injury Ontario",
      "Approuvé par un partenaire",
      "Verified accessible entrance",
      "Données vérifiées",
      "Fully accessible washroom",
      "Real-time elevator status",
      "You qualify for this program",
      "Powered by AI",
      "Propulsé par l'IA",
    ];
    for (const sample of samples) {
      expect(RULES.some((rule) => rule.pattern.test(sample)), sample).toBe(true);
    }
    for (const fine of ["Every record is unverified.", "Chaque enregistrement est non vérifié.", "the App does not decide whether you qualify."]) {
      expect(RULES.some((rule) => rule.pattern.test(fine)), fine).toBe(false);
    }
  });
});
