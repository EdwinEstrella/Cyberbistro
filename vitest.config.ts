import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "./src") },
      // Edge functions import `npm:pkg@x.y.z`; resolve those to node_modules when testing from Node.
      { find: /^npm:(@[^/@]+\/[^/@]+|[^/@]+)(?:@[^/]+)?$/, replacement: "$1" },
    ],
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "test/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: [...configDefaults.exclude, "**/*.e2e.spec.ts"],
  },
});
