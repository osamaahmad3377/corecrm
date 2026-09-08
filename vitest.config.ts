import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./tests/stubs/server-only.ts", import.meta.url),
      ),
    },
  },
  // Tests never render CSS; skip PostCSS/Tailwind entirely.
  css: { postcss: { plugins: [] } },
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["tests/e2e/**", "node_modules/**"],
    testTimeout: 20000,
    hookTimeout: 30000,
    // Integration tests share one database — run files sequentially.
    fileParallelism: false,
  },
});
