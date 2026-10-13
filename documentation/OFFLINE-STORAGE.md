# Offline storage

The Angular service worker caches the app shell after the first successful web load, so the installed web experience can open offline. Downloaded pack bytes and metadata use browser IndexedDB, which is durable in normal browsers and Capacitor WebView app-private storage. No shared external storage is used and no storage permission is requested.

Private train schedules use a separate `metropocket-user-data` IndexedDB database,
`sqlite` store, `trains` key. One gzip-compressed writable SQLite snapshot contains
all trains. Writes commit in a disposable database before replacing the durable
snapshot atomically; failures keep the previous snapshot. Train backups are
raw SQLite `.db` files, separate from downloadable Metro/TV packs. Restore validates
the complete candidate, then reopens the stored snapshot before the IndexedDB
transaction commits; failure aborts and preserves the prior record. Web and Android
share the same schema and validation. See [Train schedules](TRAIN-SCHEDULES.md).

Pack bytes stay compressed in IndexedDB and are not bundled with Angular chunks. On Metro entry, the repository reads the selected installed pack without downloading it again. fflate decompresses it in memory; sql.js opens it read-only, the repository maps rows to MetroNetwork, and the database is always closed. One selected mapped network is cached by pack ID, version, installation date and checksum, so replacement or switching packs invalidates the cache.

Angular copies exactly one `sql-wasm.wasm` from `node_modules/sql.js/dist` to `assets/sqlite`. The shared engine loader resolves it against `document.baseURI`, supporting `/`, GitHub Pages `/metro-pocket/`, and Capacitor's HTTPS WebView. The app-shell service worker prefetches this local asset at installation. After installation and a successful web load, Metro and Trains work offline; the browser can still evict local storage. Android uses the same app-private WebView storage and reader, with no storage permissions or native SQLite plugin.
