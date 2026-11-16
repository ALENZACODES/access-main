import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // The review screen is checked whole by axe-core, which is slow on a shared runner.
    testTimeout: 30_000,
  },
});
