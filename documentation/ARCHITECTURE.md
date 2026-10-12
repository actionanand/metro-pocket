# Architecture

MetroPocket is an Angular/Ionic standalone application with lazy feature routes. UI is separated from the offline-data services in `src/app/core`; shared contracts live in `src/app/shared/models`.

`ManifestService` reads a typed, versioned release manifest. `PackInstallerService` downloads compressed bytes, checks SHA-256, and validates Metro gzip/SQLite/schema/identity plus domain mapping before `PackStorageService` atomically replaces bytes and metadata. Failed updates retain the working version.

`SqlitePackReaderService` initializes sql.js once on demand, decompresses with fflate, opens read-only SQLite, and closes it after each read. `MetroNetworkRepositoryService` validates explicit column projections and maps them into domain models. It keeps one mapped network in memory and loads only the selected installed pack. Metro rechecks installation state on Ionic view entry, offers station-name/alias/code search and passes selected station IDs to the pure planner. SQL queries remain outside components. The TV database reader is not connected yet.

The Metro route planner is pure and graph-based. Components never contain network records or provider mappings.

Theme preference is stored locally and applied through Ionic's class-based dark palette. Light and dark selections override the operating system; System follows live browser/OS preference changes without duplicating page styles.
