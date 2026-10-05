# Data packs

The manifest URL is configured in Angular environments and defaults to the future public release location. The client expects `schemaVersion`, `releaseVersion`, `generatedAt`, and `packs`. Each pack has `id`, `type` (`metro` or `tv`), `name`, `version`, `schemaVersion`, `file`, and `downloadUrl`; it may include byte sizes, SHA-256, city, `networkAsOf`, description and changes.

Packs are optional. The base app never invents records. Installation downloads temporary bytes, verifies completion/checksum/schema, validates non-empty content, then atomically writes bytes and installation metadata. A later SQLite adapter must also open and validate the database before replacement. Failed updates retain the active copy. New cities and data updates are release-only changes.

Runtime manifest validation rejects unknown pack types, malformed or non-HTTPS download URLs, invalid numeric sizes, non-positive versions, unsupported schemas, missing required strings, and malformed SHA-256 values. Angular's service worker does not cache data-pack release URLs.
