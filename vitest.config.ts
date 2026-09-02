import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// esbuild reads `paths` from tsconfig.json; vitest needs the alias spelled out.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
