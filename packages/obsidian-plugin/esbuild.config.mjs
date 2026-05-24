import esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  outfile: "dist/main.js",
  format: "cjs",
  platform: "node",
  target: "es2022",
  external: ["obsidian", "electron", "@codemirror/*", "node:sqlite"],
  sourcemap: "inline",
  treeShaking: true
});

