import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import {
  compareSnapshots,
  renderBuildCard,
  sessionBuildVerdict,
  validateBuildCard,
  type BuildCardInput,
  type BuildSnapshot,
  type SessionChangeRecord,
} from "../../../packages/shared/src/postdemo/index.ts";

/**
 * Day 25 tools for the presenter and the reviewer.
 *
 *   node apps/web/scripts/postdemo.ts snapshot apps/web/dist --build <id> --out before.json
 *   node apps/web/scripts/postdemo.ts compare before.json after.json [--record change.json]
 *   node apps/web/scripts/postdemo.ts card card.json [--lang en|fr]
 *
 * snapshot hashes every built file. compare exits 1 when the build changed
 * without a recorded fallback change. card exits 1 when the card is incomplete.
 */
export function snapshotDirectory(dir: string, buildId: string, takenAt = new Date().toISOString()): BuildSnapshot {
  const root = resolve(dir);
  const files: Record<string, string> = {};
  const walk = (current: string) => {
    for (const name of readdirSync(current).sort()) {
      const full = join(current, name);
      if (statSync(full).isDirectory()) walk(full);
      else files[relative(root, full).split(sep).join("/")] = createHash("sha256").update(readFileSync(full)).digest("hex");
    }
  };
  walk(root);
  if (Object.keys(files).length === 0) throw new Error(`${dir} has no built files. Run the build first.`);
  return { format: "build-snapshot-1.0.0", buildId, takenAt, files };
}

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`--${name} needs a value.`);
  return value;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function run(args: string[], write: (text: string) => void = (text) => process.stdout.write(text)): number {
  const [command, first, second] = args;
  if (command === "snapshot" && first) {
    const buildId = flag(args, "build");
    if (!buildId) throw new Error("snapshot needs --build with the identifier the build shows.");
    const snapshot = snapshotDirectory(first, buildId);
    const out = flag(args, "out");
    if (out) writeFileSync(out, `${JSON.stringify(snapshot, null, 2)}\n`);
    else write(`${JSON.stringify(snapshot, null, 2)}\n`);
    return 0;
  }
  if (command === "compare" && first && second) {
    const comparison = compareSnapshots(readJson<BuildSnapshot>(first), readJson<BuildSnapshot>(second));
    const recordPath = flag(args, "record");
    const verdict = sessionBuildVerdict(comparison, recordPath ? readJson<SessionChangeRecord>(recordPath) : undefined);
    write(`${verdict.pass ? "PASS" : "FAIL"}: ${verdict.detail}\n`);
    for (const path of [...comparison.added.map((p) => `added ${p}`), ...comparison.removed.map((p) => `removed ${p}`), ...comparison.changed.map((p) => `changed ${p}`)]) {
      write(`  ${path}\n`);
    }
    return verdict.pass ? 0 : 1;
  }
  if (command === "card" && first) {
    const language = flag(args, "lang") ?? "en";
    if (language !== "en" && language !== "fr") throw new Error("--lang is en or fr.");
    const input = readJson<BuildCardInput>(first);
    write(renderBuildCard(input, language));
    return validateBuildCard(input).length === 0 ? 0 : 1;
  }
  throw new Error("Usage: postdemo.ts snapshot <dist> --build <id> [--out file] | compare <before> <after> [--record change.json] | card <card.json> [--lang en|fr]");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  try {
    process.exitCode = run(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exitCode = 2;
  }
}
