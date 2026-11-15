#!/usr/bin/env node
// Prints the commit that lanes.lock.json pins for one repository, e.g.
//   node deploy/lock-commit.mjs lanes.lock.json access-maps
// The lock file is owned by scripts/sync-lanes.mjs, so this reader accepts the
// shapes a lock file reasonably takes: { "<repo>": "<sha>" },
// { "<repo>": { commit | sha | ref } }, or a list of { repo | name | id, commit | sha | ref }.
// It fails unless the result is a full 40-character commit id, so a branch
// name can never slip into the Pages build.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const SHA = /^[0-9a-f]{40}$/;

function pick(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return value.commit ?? value.sha ?? value.ref ?? null;
  return null;
}

function nameMatches(name, repo) {
  return typeof name === "string" && (name === repo || name.endsWith(`/${repo}`));
}

export function findCommit(lock, repo) {
  const visit = (node) => {
    if (!node || typeof node !== "object") return null;
    if (Array.isArray(node)) {
      for (const item of node) {
        if (item && typeof item === "object" && [item.repo, item.name, item.id].some((n) => nameMatches(n, repo))) {
          const direct = pick(item);
          if (direct) return direct;
        }
        const nested = visit(item);
        if (nested) return nested;
      }
      return null;
    }
    for (const [key, value] of Object.entries(node)) {
      if (nameMatches(key, repo)) {
        const direct = pick(value);
        if (direct) return direct;
      }
    }
    for (const value of Object.values(node)) {
      const nested = visit(value);
      if (nested) return nested;
    }
    return null;
  };
  const commit = visit(lock);
  if (!commit) throw new Error(`lanes.lock.json has no entry for ${repo}`);
  if (!SHA.test(commit)) throw new Error(`lanes.lock.json pins ${repo} to "${commit}", which is not a 40-character commit id`);
  return commit;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [file, repo] = process.argv.slice(2);
  if (!file || !repo) {
    console.error("usage: node deploy/lock-commit.mjs <lanes.lock.json> <repo>");
    process.exit(2);
  }
  try {
    process.stdout.write(`${findCommit(JSON.parse(readFileSync(file, "utf8")), repo)}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
