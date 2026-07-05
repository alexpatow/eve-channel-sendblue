import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node24",
  dts: true,
  sourcemap: true,
  clean: true,
  // eve, ai, and sendblue are resolved by the consumer; keep them external.
  external: ["eve", "ai", "sendblue"],
});
