import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
    alias: {
      obsidian: new URL("./src/__mocks__/obsidian.ts", import.meta.url).pathname,
    },
  },
});
