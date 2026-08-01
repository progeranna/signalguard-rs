import path from "node:path";

import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    exclude: [...configDefaults.exclude, "scripts/check-bundle-size.test.mjs"],
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    clearMocks: true,
    mockReset: true,
    restoreMocks: true,
  },
});
