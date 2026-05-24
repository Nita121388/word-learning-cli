import { DatabaseSync } from "node:sqlite";
import type { DbStatement, DbValue, SqliteAdapter } from "./adapter.js";
import { ensureParentDir } from "../utils.js";

class NodeSqliteStatement implements DbStatement {
  constructor(private readonly statement: ReturnType<DatabaseSync["prepare"]>) {}

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
  private readonly database: DatabaseSync;

  constructor(filePath: string) {
    ensureParentDir(filePath);
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
