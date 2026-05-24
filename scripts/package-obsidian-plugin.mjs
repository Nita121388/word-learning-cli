import { mkdirSync, cpSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pluginDir = join(root, "packages", "obsidian-plugin");
const outDir = join(root, "dist", "obsidian-plugin", "word-learning");
mkdirSync(outDir, { recursive: true });

for (const file of ["manifest.json", "styles.css"]) {
  cpSync(join(pluginDir, file), join(outDir, file));
}
cpSync(join(pluginDir, "dist", "main.js"), join(outDir, "main.js"));

const zipPath = join(root, "dist", "obsidian-plugin", "word-learning.zip");
try {
  execFileSync("zip", ["-r", zipPath, "word-learning"], {
    cwd: join(root, "dist", "obsidian-plugin"),
    stdio: "inherit"
  });
} catch {
  writeFileSync(join(root, "dist", "obsidian-plugin", "README.txt"), "Install by copying the word-learning folder to your Obsidian plugins directory.\n");
}

