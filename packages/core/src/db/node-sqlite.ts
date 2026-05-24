import { createRequire } from "node:module";
import type { DbStatement, DbValue, SqliteAdapter } from "./adapter.js";
import { ensureParentDir } from "../utils.js";

interface NativeStatement {
  get(...params: DbValue[]): unknown;
  all(...params: DbValue[]): unknown[];
  run(...params: DbValue[]): unknown;
}

interface NativeDatabase {
  exec(sql: string): void;
  prepare(sql: string): NativeStatement;
  close(): void;
}

type DatabaseSyncConstructor = new (filePath: string) => NativeDatabase;

class NodeSqliteStatement implements DbStatement {
  constructor(private readonly statement: NativeStatement) {}

  get<T = unknown>(...params: DbValue[]): T | undefined {
    return this.statement.get(...params) as T | undefined;
  }

  all<T = unknown>(...params: DbValue[]): T[] {
    return this.statement.all(...params) as T[];
  }

  run(...params: DbValue[]): unknown {
    return this.statement.run(...params);
  }
}

export class NodeSqliteAdapter implements SqliteAdapter {
  private readonly database: NativeDatabase;

  constructor(filePath: string) {
    ensureParentDir(filePath);
    const DatabaseSync = loadDatabaseSync();
    this.database = new DatabaseSync(filePath);
  }

  exec(sql: string): void {
    this.database.exec(sql);
  }

  prepare(sql: string): DbStatement {
    return new NodeSqliteStatement(this.database.prepare(sql));
  }

  close(): void {
    this.database.close();
  }
}

export function isNodeSqliteAvailable(): boolean {
  try {
    loadDatabaseSync();
    return true;
  } catch {
    return false;
  }
}

function loadDatabaseSync(): DatabaseSyncConstructor {
  try {
    const require = createRequire(import.meta.url);
    const sqlite = require("node:sqlite") as { DatabaseSync?: DatabaseSyncConstructor };
    if (!sqlite.DatabaseSync) {
      throw new Error("DatabaseSync export not found");
    }
    return sqlite.DatabaseSync;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`node:sqlite is unavailable in this runtime. Use Node 25+ for the CLI, or online-only lookup in Obsidian. Details: ${message}`);
  }
}
