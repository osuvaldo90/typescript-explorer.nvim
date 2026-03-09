import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/main.ts"],
  format: ["cjs"],
  target: "node18",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  minify: false,
  noExternal: [/.*/],
});
