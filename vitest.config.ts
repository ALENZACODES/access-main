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
const SHELL_ENTRY = new Set(["@access-tools/games", "@access-tools/navigator"]);
const laneAliases = Object.fromEntries(
  lock.packages.map((pkg) => {
    const repo = pkg.repo.split("/")[1];
    if (!repo) throw new Error(`lanes.lock.json repo must look like owner/name, got ${pkg.repo}`);
    const pkgRoot = path.join(root, ".lanes", repo, ...pkg.path.split("/"));
    const shell = path.join(pkgRoot, "src", "shell.ts");
    const real = path.join(pkgRoot, "src", "index.ts");
    const resolved = SHELL_ENTRY.has(pkg.alias) && existsSync(shell) ? shell : existsSync(real) ? real : laneFallback;
    return [pkg.alias, resolved];
  }),
);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@access/shared": path.resolve(root, "packages/shared/src/index.ts"),
      "@access-main/data-client": dataClient,
      ...laneAliases,
    },
  },
  test: {
    environment: "node",
    include: ["packages/shared/src/**/*.test.ts", "packages/shared/test/**/*.test.ts", "packages/*/test/**/*.test.ts", "packages/*/test/**/*.test.tsx", "apps/web/src/**/*.test.ts", "apps/web/src/**/*.test.tsx", "apps/web/scripts/**/*.test.ts", "scripts/**/*.test.mjs"],
    exclude: ["**/*.spec.tsx", "**/node_modules/**", "**/.git/**"],
  },
});
