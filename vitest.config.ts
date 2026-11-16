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
  slimLane("@access-tools/games/shell", "access-tools", "packages/games", "src/shell.ts", path.resolve(root, "apps/web/src/modules/games-shell-fallback.ts")),
  slimLane("@access-tools/games/library", "access-tools", "packages/games", "src/library.ts", path.resolve(root, "apps/web/src/modules/games-shell-fallback.ts")),
  slimLane("@access-tools/navigator/shell", "access-tools", "packages/navigator", "src/shell.ts", path.resolve(root, "apps/web/src/modules/navigator-shell-fallback.ts")),
]);

/** More hub packages, synced by scripts/sync-hub.mjs. Same list as hubAliases in apps/web/vite.config.ts. */
const hubAliases = (
  [
    ["@access-tools/employment", "access-tools", "employment"],
    ["@access-tools/housing", "access-tools", "housing"],
    ["@access-tools/safety", "access-tools", "safety"],
    ["@access-tools/timing", "access-tools", "timing"],
    ["@access-tools/diary", "access-tools", "diary"],
    ["@access-tools/auditors", "access-tools", "auditors"],
    ["@access-tools/handoff", "access-tools", "handoff"],
    ["@hub/handoff-fixtures", "access-tools", "handoff", "src/fixtures.ts"],
    ["@access/peers", "access-help", "peers"],
    ["@hub/peers-ui", "access-help", "peers", "src/ui/index.ts"],
    ["@access/event-access", "access-help", "event-access"],
    ["@hub/event-access-ui", "access-help", "event-access", "src/ui/index.ts"],
    ["@access/outings", "access-help", "outings"],
    ["@access-maps/conditions", "access-maps", "conditions"],
    ["@hub/wav-dataset", "access-maps", "conditions", "datasets/wav-services.json"],
    ["@hub/games", "access-tools", "games"],
  ] as Array<[string, string, string] | [string, string, string, string]>
)
  .map(([find, repo, pkg, entry = "src/index.ts"]) => ({
    find: new RegExp(`^${find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
    replacement: path.join(root, ".lanes", repo, "packages", pkg, entry),
  }))
  .concat([
    { find: /^@hub\/advocacy-reports$/, replacement: path.join(root, "packages/advocacy/src/ui/ReportsPanel.tsx") },
    { find: /^@hub\/advocacy-demo$/, replacement: path.join(root, "packages/advocacy/src/reports/demo.ts") },
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
      ...hubAliases,
    ],
  },
  test: {
    environment: "node",
    include: ["packages/shared/src/**/*.test.ts", "packages/shared/test/**/*.test.ts", "packages/*/test/**/*.test.ts", "packages/*/test/**/*.test.tsx", "apps/web/src/**/*.test.ts", "apps/web/src/**/*.test.tsx", "apps/web/scripts/**/*.test.ts", "scripts/**/*.test.mjs"],
    // scripts/release has its own node:test suites, run by npm run test:release.
    exclude: ["**/*.spec.tsx", "**/node_modules/**", "**/.git/**", "scripts/release/**"],
  },
});
