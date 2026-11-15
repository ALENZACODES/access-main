/**
 * Compares a built shell with the tag a rehearsal or demonstration expects.
 *
 *   npm run verify:build -w @access/web -- --expect rc-2026-11-20 [--commit 5dcd003] [--dir dist]
 *
 * Exits 0 when they match and 1 with one line per problem when they do not.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { BUILD_MANIFEST_FILE, checkReleaseCandidate, describeReleaseProblem } from "../src/release/manifest.ts";

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const expected = option("expect");
if (!expected) {
  console.error("Pass --expect <build id>.");
  process.exit(2);
}

const dir = resolve(option("dir") ?? "dist");
let parsed: unknown;
try {
  parsed = JSON.parse(readFileSync(join(dir, BUILD_MANIFEST_FILE), "utf8"));
} catch {
  console.error(`No readable ${BUILD_MANIFEST_FILE} in ${dir}. Run the build first.`);
  process.exit(1);
}

const problems = checkReleaseCandidate(parsed, { buildId: expected, commit: option("commit") });
if (problems.length === 0) {
  console.log(`Build ${expected} matches ${join(dir, BUILD_MANIFEST_FILE)}.`);
} else {
  for (const problem of problems) console.error(describeReleaseProblem(problem));
  process.exit(1);
}
