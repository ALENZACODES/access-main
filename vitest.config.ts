import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@access/shared": path.resolve(root, "packages/shared/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["packages/shared/src/**/*.test.ts", "apps/web/src/**/*.test.ts", "apps/web/src/**/*.test.tsx", "apps/web/scripts/**/*.test.ts"],
  },
});
