import { defineConfig } from "vitest/config";
import path from "node:path";
// Slow balancing runs: `npm run balance`
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname) } },
  test: { environment: "node", testTimeout: 1_200_000, include: ["tests/long/*.test.ts"] },
});
