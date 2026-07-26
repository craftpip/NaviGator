import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "cloakbrowser/dist/download.js": "/workspace/__mocks__/cloakbrowser/dist/download.js",
    },
  },
  test: {
    globals: false,
    environment: "node",
    include: ["tests/**/*.test.js"],
    testTimeout: 10000,
    hookTimeout: 10000,
  },
});
