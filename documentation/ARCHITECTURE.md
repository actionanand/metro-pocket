# Architecture

MetroPocket is an Angular/Ionic standalone application with lazy feature routes. UI is separated from the offline-data services in `src/app/core`; shared contracts live in `src/app/shared/models`.

`ManifestService` reads a typed, versioned release manifest. `PackInstallerService` downloads to memory, checks the optional SHA-256 checksum, then asks `PackStorageService` to replace bytes and metadata in one IndexedDB transaction. This preserves the prior usable pack if a download or validation fails. Future SQLite/WASM query adapters belong behind the existing metro/TV repository boundaries, rather than in pages.

The Metro route planner is pure and graph-based. Components never contain network records or provider mappings.
