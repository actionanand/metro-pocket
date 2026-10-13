import { Injectable, inject } from '@angular/core';
import type { BindParams, Database, SqlValue } from 'sql.js';
import { SqliteEngineService } from './sqlite-engine.service';

// Keep the existing injection seam and URL helper compatible with public-pack consumers.
export { SQLITE_LOADER, sqliteWasmUrl } from './sqlite-engine.service';

@Injectable({ providedIn: 'root' })
export class SqlitePackReaderService {
  private readonly engine = inject(SqliteEngineService);

  async read<T>(compressed: ArrayBuffer, consume: (database: Database) => T): Promise<T> {
    let database: Database | undefined;
    try {
      const { gunzipSync } = await import('fflate');
      const bytes = gunzipSync(new Uint8Array(compressed));
      // Opening an empty buffer creates a new DB in sql.js; reject it explicitly.
      if (new TextDecoder().decode(bytes.subarray(0, 16)) !== 'SQLite format 3\0') {
        throw new Error('The pack does not contain a SQLite database.');
      }
      const engine = await this.engine.initialize();
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
}

/** Explicit SQL projections are converted by column name, never by table order. */
export function queryRows(database: Database, sql: string, bindings?: BindParams): Record<string, SqlValue>[] {
  const statement = database.prepare(sql);
  try {
    if (bindings) statement.bind(bindings);
    const rows: Record<string, SqlValue>[] = [];
    while (statement.step()) rows.push(statement.getAsObject());
    return rows;
  } finally {
    statement.free();
  }
}
