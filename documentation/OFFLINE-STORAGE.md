# Offline storage

The Angular service worker caches the app shell after the first successful web load, so the installed web experience can open offline. Downloaded pack bytes and metadata use browser IndexedDB, which is durable in normal browsers and Capacitor WebView app-private storage. No shared external storage is used and no storage permission is requested.

Pack bytes stay compressed in IndexedDB and are not bundled with Angular chunks. On Metro entry, the repository reads the selected installed pack without downloading it again. fflate decompresses it in memory; sql.js opens it read-only, the repository maps rows to MetroNetwork, and the database is always closed. One selected mapped network is cached by pack ID, version, installation date and checksum, so replacement or switching packs invalidates the cache.

Angular copies exactly one `sql-wasm.wasm` from `node_modules/sql.js/dist` to `assets/sqlite`. The loader resolves it against `document.baseURI`, supporting `/`, GitHub Pages `/metro-pocket/`, and Capacitor's HTTPS WebView. The app-shell service worker caches this local asset on first use. After installation and a successful web load, Metro works offline; the browser can still evict local storage. Android uses the same app-private WebView storage and reader, with no storage permissions or native SQLite plugin.
