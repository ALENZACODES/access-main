#!/usr/bin/env node
/**
 * Post-build honesty check: scan the shipped dist (not only en.ts/fr.ts)
 * for endorsement and overclaim wording that would otherwise reach users
 * through feature, hub, or bundled copy.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(here, "../dist");

const RULES = [
  { id: "endorsement", pattern: /\b(endorsed by|approved by|in partnership with|official (partner|app)|partnered with)\b/i },
  { id: "endorsement-fr", pattern: /\b(approuvée? par|en partenariat avec|partenaire officiel|application officielle)\b/i },
  { id: "verified-claim", pattern: /(?<!un)(?<!not )\bverified (place|places|data|record|records|accessible|entrance|source|sources)\b/i },
  { id: "verified-claim-fr", pattern: /(?<!non )\b(lieu|lieux|données|enregistrement)s? vérifiée?s?(?![a-zà-ÿ])/i },
  { id: "verified-source-fr", pattern: /sources vérifiées/i },
  { id: "guarantee", pattern: /(?<!not )(?<!no )(?<!pas une )(?<!pas de )\b(guaranteed|always accessible|fully accessible|100% accessible|garanti(?:e|s)?|entièrement accessible)\b/i },
  { id: "live-claim", pattern: /(?<!or )(?<!not )\b(real-time|live status is (on|shown|current))\b|(?<!pas en )\ben temps réel\b/i },
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!fs.existsSync(distDir)) {
  fail("apps/web/dist is missing. Run npm run build first so shipped copy can be scanned.");
}

function* walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) {
      yield* walk(full);
      continue;
    }
    if (name.endsWith(".map")) continue;
    if (/\.(html|js|css|json|webmanifest|txt|svg)$/i.test(name)) yield full;
  }
}

function decodeEscapes(text) {
  return text
    .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
}

const hits = [];
for (const file of walk(distDir)) {
  const raw = fs.readFileSync(file, "utf8");
  const text = decodeEscapes(raw);
  const where = path.relative(path.resolve(here, "../.."), file);
  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    const match = rule.pattern.exec(text);
    if (match) hits.push(`${where} [${rule.id}] ${match[0]}`);
  }
}

if (hits.length > 0) {
  console.error("Overclaim wording found in the built dist:");
  for (const hit of hits) console.error(`  ${hit}`);
  process.exit(1);
}

console.log(`No overclaim wording found in ${path.relative(path.resolve(here, "../.."), distDir)}.`);
