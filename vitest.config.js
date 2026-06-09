import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["public/**/*.test.js", "extensions/**/*.test.ts"],
  },
});
