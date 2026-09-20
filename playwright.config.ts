import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  reporter: "list",
  use: {
    trace: "retain-on-failure",
  },
  projects: [
    {
      // Local-first / SQLite e2e. Safe to run in CI against the placeholder
      // backend because they never log into a real cloud project.
      // Run with: npm run test:e2e
      name: "local",
      testMatch: /.*\.e2e\.spec\.ts/,
      testIgnore: /.*\.cloud\.e2e\.spec\.ts/,
    },
    {
      // Real-backend e2e: these log in with a dedicated test user against the
      // live self-hosted backend, so they need a real .env and network access.
      // NOT run in CI. Run locally with: npm run test:e2e:cloud
      name: "cloud",
      testMatch: /.*\.cloud\.e2e\.spec\.ts/,
    },
  ],
});
