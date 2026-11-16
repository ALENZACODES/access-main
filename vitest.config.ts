import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));
const dataClientReal = path.resolve(root, "packages/data-client/src/index.ts");
const dataClient = existsSync(dataClientReal) ? dataClientReal : path.resolve(root, "apps/web/src/modules/data-client-fallback.ts");
const laneFallback = path.resolve(root, "apps/web/src/modules/lane-fallbacks.ts");

interface LanePackage {
  repo: string;
  path: string;
  alias: string;
}

const lock = JSON.parse(readFileSync(path.join(root, "lanes.lock.json"), "utf8")) as { packages: LanePackage[] };
const UNLINKED = new Set(["@access-tools/games", "@access-tools/navigator"]);
const laneAliases = Object.fromEntries(
  lock.packages
    .filter((pkg) => pkg.alias !== "@access-tools/place")
    .map((pkg) => {
      const repo = pkg.repo.split("/")[1];
      if (!repo) throw new Error(`lanes.lock.json repo must look like owner/name, got ${pkg.repo}`);
      const pkgRoot = path.join(root, ".lanes", repo, ...pkg.path.split("/"));
      const real = path.join(pkgRoot, "src", "index.ts");
      const resolved = UNLINKED.has(pkg.alias) ? laneFallback : existsSync(real) ? real : laneFallback;
      return [pkg.alias, resolved];
    }),
);
function slimLane(find: string, repo: string, pkgPath: string, file: string, fallback: string): [string, string] {
  const real = path.join(root, ".lanes", repo, ...pkgPath.split("/"), file);
  return [find, existsSync(real) ? real : fallback];
}

/** See placeLaneAlias in apps/web/vite.config.ts — keep Ajv off the finders search graph. */
function placeLaneAlias() {
  const full = path.join(root, ".lanes", "access-tools", "packages", "place", "src", "index.ts");
  const slim = path.join(root, ".lanes", "access-tools", "packages", "place", "src", "pack", "alias-resolve.ts");
  const resolvedFull = existsSync(full) ? full : laneFallback;
  const resolvedSlim = existsSync(slim) ? slim : resolvedFull;
  return {
    find: /^@access-tools\/place$/,
    replacement: resolvedFull,
    customResolver(_id: string, importer: string | undefined) {
      if (importer && /[/\\]packages[/\\]finders[/\\]/.test(importer)) return resolvedSlim;
      return resolvedFull;
    },
  };
}

const slimLaneAliases = Object.fromEntries([
  slimLane("@access-tools/finders/shell", "access-tools", "packages/finders", "src/shell.ts", path.resolve(root, "apps/web/src/modules/finders-shell-fallback.ts")),
  slimLane("@access/help/shell", "access-help", "packages/help", "src/shell.ts", path.resolve(root, "apps/web/src/modules/help-shell-fallback.ts")),
]);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: "@access/shared", replacement: path.resolve(root, "packages/shared/src/index.ts") },
      { find: "@access-main/data-client", replacement: dataClient },
      ...Object.entries(slimLaneAliases).map(([find, replacement]) => ({ find, replacement })),
      placeLaneAlias(),
      ...Object.entries(laneAliases).map(([find, replacement]) => ({ find, replacement })),
    ],
  },
  test: {
    environment: "node",
    include: ["packages/shared/src/**/*.test.ts", "packages/shared/test/**/*.test.ts", "packages/*/test/**/*.test.ts", "packages/*/test/**/*.test.tsx", "apps/web/src/**/*.test.ts", "apps/web/src/**/*.test.tsx", "apps/web/scripts/**/*.test.ts", "scripts/**/*.test.mjs"],
    exclude: ["**/*.spec.tsx", "**/node_modules/**", "**/.git/**"],
  },
});
