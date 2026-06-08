import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface StorageOptions {
  db?: string;
  vault?: string;
}

export interface CliConfig extends StorageOptions {}

export type ConfigKey = "db" | "vault";

export interface StorageResolution extends StorageOptions {
  source: "cli" | "env" | "config" | "cwd";
}

export function getConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  const configuredPath = clean(env.WORDCLI_CONFIG);
  if (configuredPath) return expandHome(configuredPath);

  const configHome = clean(env.XDG_CONFIG_HOME);
  const baseDir = configHome ? expandHome(configHome) : join(homedir(), ".config");
  return join(baseDir, "wordcli", "config.json");
}

export function readCliConfig(configPath = getConfigPath()): CliConfig {
  let raw: string;
  try {
    raw = readFileSync(configPath, "utf8");
  } catch (error) {
    if (isErrorWithCode(error) && error.code === "ENOENT") {
      return {};
    }
    throw error;
  }

  try {
    return normalizeConfig(JSON.parse(raw));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`failed to read wordcli config at ${configPath}: ${message}`);
  }
}

export function writeCliConfig(config: CliConfig, configPath = getConfigPath()): CliConfig {
  const normalized = normalizeConfig(config);
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}

export function setCliConfigValue(key: ConfigKey, value: string, configPath = getConfigPath()): CliConfig {
  const config: CliConfig = {};
  const cleaned = clean(value);
  if (!cleaned) {
    throw new Error(`${key} value is required`);
  }

  if (key === "db") {
    config.db = expandHome(cleaned);
  } else {
    config.vault = expandHome(cleaned);
  }

  return writeCliConfig(config, configPath);
}

export function unsetCliConfigValue(key: ConfigKey, configPath = getConfigPath()): CliConfig {
  const config = readCliConfig(configPath);
  delete config[key];
  return writeCliConfig(config, configPath);
}

export function parseConfigKey(value: string): ConfigKey {
  if (value === "db" || value === "vault") {
    return value;
  }
  throw new Error(`invalid config key: ${value}. Use "db" or "vault".`);
}

export function resolveStorage(options: StorageOptions, env: NodeJS.ProcessEnv = process.env, configPath = getConfigPath(env)): StorageResolution {
  const optionDb = clean(options.db);
  if (optionDb) return { source: "cli", db: expandHome(optionDb) };

  const optionVault = clean(options.vault);
  if (optionVault) return { source: "cli", vault: expandHome(optionVault) };

  const envDb = clean(env.WORDCLI_DB);
  if (envDb) return { source: "env", db: expandHome(envDb) };

  const envVault = clean(env.WORDCLI_VAULT);
  if (envVault) return { source: "env", vault: expandHome(envVault) };

  const config = readCliConfig(configPath);
  if (config.db) return { source: "config", db: config.db };
  if (config.vault) return { source: "config", vault: config.vault };

  return { source: "cwd" };
}

export function resolveStorageOptions<T extends StorageOptions>(options: T): T & StorageOptions {
  const resolution = resolveStorage(options);
  const resolved: T & StorageOptions = { ...options };
  if (resolution.db) {
    resolved.db = resolution.db;
    delete resolved.vault;
  } else if (resolution.vault) {
    resolved.vault = resolution.vault;
    delete resolved.db;
  }
  return resolved;
}

export function getEnvStorage(env: NodeJS.ProcessEnv = process.env): CliConfig {
  const config: CliConfig = {};
  const db = clean(env.WORDCLI_DB);
  const vault = clean(env.WORDCLI_VAULT);
  if (db) {
    config.db = expandHome(db);
  } else if (vault) {
    config.vault = expandHome(vault);
  }
  return config;
}

function normalizeConfig(value: unknown): CliConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("config must be a JSON object");
  }

  const record = value as Record<string, unknown>;
  const config: CliConfig = {};
  const db = typeof record.db === "string" ? clean(record.db) : undefined;
  const vault = typeof record.vault === "string" ? clean(record.vault) : undefined;

  if (db) {
    config.db = expandHome(db);
  } else if (vault) {
    config.vault = expandHome(vault);
  }

  return config;
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function expandHome(value: string): string {
  if (value === "~") return homedir();
  if (value.startsWith("~/")) return join(homedir(), value.slice(2));
  return value;
}

function isErrorWithCode(error: unknown): error is Error & { code: string } {
  return error instanceof Error && "code" in error;
}
