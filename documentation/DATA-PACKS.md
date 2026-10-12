# Data packs

The manifest URL is configured in Angular environments and defaults to the public `metropocket-data` GitHub release location. The client expects `schemaVersion`, `releaseVersion`, `generatedAt`, and `packs`. Each pack has `id`, `type` (`metro` or `tv`), `name`, `version`, `schemaVersion`, `file`, and `downloadUrl`; it may include byte sizes, SHA-256, city, `networkAsOf`, description and changes.

Packs are optional. Installation downloads temporary bytes and checks SHA-256 against the original compressed bytes. For Metro packs, it then decompresses gzip with fflate, opens SQLite with sql.js, verifies the eight required tables, and maps/validates the network. Database metadata must contain schemaVersion `1`, type `metro`, and packId/version matching the manifest. Only after all checks pass does one IndexedDB transaction replace compressed bytes and installation metadata. Failure retains the active version. No decompressed database is persisted. TV database validation remains separate future work.

Runtime manifest validation rejects unknown pack types, malformed or non-HTTPS download URLs, invalid numeric sizes, non-positive versions, unsupported schemas, missing required strings, and malformed SHA-256 values. Angular's service worker does not cache data-pack release URLs.
