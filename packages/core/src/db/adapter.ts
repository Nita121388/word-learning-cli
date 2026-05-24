export interface DbStatement {
  get<T = unknown>(...params: DbValue[]): T | undefined;
  all<T = unknown>(...params: DbValue[]): T[];
  run(...params: DbValue[]): unknown;
}

export interface SqliteAdapter {
  exec(sql: string): void;
  prepare(sql: string): DbStatement;
  close(): void;
}

export type DbValue = string | number | bigint | Uint8Array | null;
