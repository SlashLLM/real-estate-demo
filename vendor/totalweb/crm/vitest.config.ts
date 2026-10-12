import { defineConfig } from "vitest/config";

// Local config so vitest does not walk up to unrelated configs outside the repo.
export default defineConfig({ test: { environment: "node", include: ["src/**/*.test.ts"] } });
