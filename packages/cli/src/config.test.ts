import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getConfigPath, readCliConfig, resolveStorage, setCliConfigValue, unsetCliConfigValue, writeCliConfig } from "./config.js";

const dirs: string[] = [];

function createDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "wordcli-config-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("CLI config", () => {
  it("resolves the config path from WORDCLI_CONFIG or XDG_CONFIG_HOME", () => {
    expect(getConfigPath({ WORDCLI_CONFIG: "/tmp/custom-wordcli.json" })).toBe("/tmp/custom-wordcli.json");
    expect(getConfigPath({ XDG_CONFIG_HOME: "/tmp/config-home" })).toBe("/tmp/config-home/wordcli/config.json");
  });

  it("writes and reads a default vault", () => {
    const configPath = join(createDir(), "config.json");

    const saved = setCliConfigValue("vault", "/tmp/MyVault", configPath);

    expect(saved).toEqual({ vault: "/tmp/MyVault" });
    expect(readCliConfig(configPath)).toEqual({ vault: "/tmp/MyVault" });
    expect(JSON.parse(readFileSync(configPath, "utf8"))).toEqual({ vault: "/tmp/MyVault" });
  });

  it("uses db and vault as mutually exclusive storage defaults", () => {
    const configPath = join(createDir(), "config.json");

    setCliConfigValue("vault", "/tmp/MyVault", configPath);
    const saved = setCliConfigValue("db", "/tmp/user.sqlite", configPath);

    expect(saved).toEqual({ db: "/tmp/user.sqlite" });
    expect(readCliConfig(configPath)).toEqual({ db: "/tmp/user.sqlite" });
  });

  it("unsets a configured storage value", () => {
    const configPath = join(createDir(), "config.json");
    setCliConfigValue("db", "/tmp/user.sqlite", configPath);

    const saved = unsetCliConfigValue("db", configPath);

    expect(saved).toEqual({});
    expect(readCliConfig(configPath)).toEqual({});
  });

  it("resolves storage by CLI, env, config, then cwd", () => {
    const configPath = join(createDir(), "config.json");
    writeCliConfig({ vault: "/tmp/config-vault" }, configPath);

    expect(resolveStorage({ db: "/tmp/cli.sqlite" }, {}, configPath)).toEqual({ source: "cli", db: "/tmp/cli.sqlite" });
    expect(resolveStorage({ vault: "/tmp/cli-vault" }, {}, configPath)).toEqual({ source: "cli", vault: "/tmp/cli-vault" });
    expect(resolveStorage({}, { WORDCLI_DB: "/tmp/env.sqlite" }, configPath)).toEqual({ source: "env", db: "/tmp/env.sqlite" });
    expect(resolveStorage({}, { WORDCLI_VAULT: "/tmp/env-vault" }, configPath)).toEqual({ source: "env", vault: "/tmp/env-vault" });
    expect(resolveStorage({}, {}, configPath)).toEqual({ source: "config", vault: "/tmp/config-vault" });
    expect(resolveStorage({}, {}, join(createDir(), "missing.json"))).toEqual({ source: "cwd" });
  });
});
