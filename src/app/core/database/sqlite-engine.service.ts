import { InjectionToken, Service, inject } from '@angular/core';
import type { SqlJsStatic } from 'sql.js';

export function sqliteWasmUrl(baseUri: string): string {
  return new URL('assets/sqlite/sql-wasm.wasm', baseUri).href;
}

export const SQLITE_LOADER = new InjectionToken<() => Promise<SqlJsStatic>>('SQLite engine loader', {
  providedIn: 'root',
  factory: () => () =>
    import('sql.js').then(module => module.default({ locateFile: () => sqliteWasmUrl(document.baseURI) })),
});

/** One WASM engine, with separate Database instances for public packs and user data. */
@Service()
export class SqliteEngineService {
  private engine?: Promise<SqlJsStatic>;
  private readonly loader = inject(SQLITE_LOADER);

  initialize(): Promise<SqlJsStatic> {
    this.engine ??= this.loader().catch(cause => {
      this.engine = undefined;
      throw cause;
    });
    return this.engine;
  }
}
