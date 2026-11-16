import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));
const dataClientReal = path.resolve(root, "packages/data-client/src/index.ts");
const dataClient = existsSync(dataClientReal) ? dataClientReal : path.resolve(root, "apps/web/src/modules/data-client-fallback.ts");
const laneFallback = path.resolve(root, "apps/web/src/modules/lane-fallbacks.ts");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@access/shared": path.resolve(root, "packages/shared/src/index.ts"),
      "@access-main/data-client": dataClient,
      "@access-maps/places-shell": laneFallback,
      "@access-maps/journey-data": laneFallback,
      "@access-tools/finders": laneFallback,
      "@access-tools/navigator": laneFallback,
      "@access-tools/games": laneFallback,
      "@access/help": laneFallback,
    },
  },
  test: {
    environment: "node",
    include: ["packages/shared/src/**/*.test.ts", "packages/shared/test/**/*.test.ts", "packages/*/test/**/*.test.ts", "packages/*/test/**/*.test.tsx", "apps/web/src/**/*.test.ts", "apps/web/src/**/*.test.tsx", "apps/web/scripts/**/*.test.ts", "scripts/**/*.test.mjs"],
    exclude: ["**/*.spec.tsx", "**/node_modules/**", "**/.git/**", "scripts/release/**"],
  },
});
