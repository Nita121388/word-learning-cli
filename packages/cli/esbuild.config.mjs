import esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  outfile: "dist/main.cjs",
  format: "cjs",
  platform: "node",
  target: "node25",
  external: ["node:sqlite"],
  sourcemap: true,
  treeShaking: true
});
