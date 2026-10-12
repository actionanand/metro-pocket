import { Injectable, InjectionToken, inject } from '@angular/core';
import type { Database, SqlJsStatic, SqlValue } from 'sql.js';

export function sqliteWasmUrl(baseUri: string): string {
  return new URL('assets/sqlite/sql-wasm.wasm', baseUri).href;
}
export const SQLITE_LOADER = new InjectionToken<() => Promise<SqlJsStatic>>('SQLite engine loader', {
  providedIn: 'root',
  factory: () => () =>
    import('sql.js').then(module => module.default({ locateFile: () => sqliteWasmUrl(document.baseURI) })),
});

@Injectable({ providedIn: 'root' })
export class SqlitePackReaderService {
  private engine?: Promise<SqlJsStatic>;
  private readonly loader = inject(SQLITE_LOADER);

  async read<T>(compressed: ArrayBuffer, consume: (database: Database) => T): Promise<T> {
    let database: Database | undefined;
    try {
      const { gunzipSync } = await import('fflate');
      const bytes = gunzipSync(new Uint8Array(compressed));
      // Opening an empty buffer creates a new DB in sql.js; reject it explicitly.
      if (new TextDecoder().decode(bytes.subarray(0, 16)) !== 'SQLite format 3\0') {
        throw new Error('The pack does not contain a SQLite database.');
      }
      const engine = await this.initialize();
      database = new engine.Database(bytes);
      database.run('PRAGMA query_only = ON');
      return consume(database);
    } catch (cause) {
      throw new Error(
        `Unable to read the offline pack: ${cause instanceof Error ? cause.message : 'Invalid gzip or SQLite data.'}`,
      );
    } finally {
      database?.close();
    }
  }

  private initialize(): Promise<SqlJsStatic> {
    this.engine ??= this.loader().catch(cause => {
      this.engine = undefined;
      throw cause;
    });
    return this.engine;
  }
}

/** Explicit SQL projections are converted by column name, never by table order. */
export function queryRows(database: Database, sql: string): Record<string, SqlValue>[] {
  const statement = database.prepare(sql);
  try {
    const rows: Record<string, SqlValue>[] = [];
    while (statement.step()) rows.push(statement.getAsObject());
    return rows;
  } finally {
    statement.free();
  }
}
