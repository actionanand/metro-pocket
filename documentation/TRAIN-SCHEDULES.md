# User-managed train schedules

Trains are private, mutable user data, separate from read-only public Metro/TV packs.
There is no railway API, live timetable, bundled real train data, upload, analytics,
or location access. Offline Data and `PackType = 'metro' | 'tv'` are unchanged.

## Web/PWA: import one train per CSV

Open **Trains → Import Train CSV** on Web/PWA. The bundled **Train CSV Guide** is
available from Trains and Settings at `/train-guide`, including offline. Android
cannot import CSV, download the CSV template, or open the guide; direct guide links
redirect to Settings. Parsing/validation displays a preview; only
**Import** writes the schedule. If the train number already exists, the preview
requires **Replace Schedule**. Cancel leaves saved data unchanged.

CSV must be UTF-8 (BOM accepted), with LF or CRLF and conventional quoted fields.
Commas inside station names must be quoted. Files are limited to 2 MB and 10,000
stops. Download the template locally from Trains; it is never fetched from a server.

| Column           | Rule                                                                                                                                                                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `train_number`   | Required on the first data row, 1–10 digits, kept as text including leading zeroes. Later blank cells inherit it; a different number is rejected.                                                                                                                   |
| `train_name`     | Optional, up to 200 characters. Later blanks inherit the name; conflicting non-empty names are rejected.                                                                                                                                                            |
| `running_days`   | Optional. Missing/blank/whitespace on the first row means **Daily**. Later blanks inherit it. Accepts DAILY, short names (`Mon\|Wed\|Fri`), or full names (`Monday\|Wednesday\|Friday`), case-insensitively. Unknown days and conflicting definitions are rejected. |
| `stop_sequence`  | Optional. If all cells are blank, sequence is 1, 2, 3… in CSV order. Otherwise every row needs a unique positive integer; final stops sort by sequence.                                                                                                             |
| `station_code`   | Optional, up to 30 characters.                                                                                                                                                                                                                                      |
| `station_name`   | Required on every row, up to 200 characters.                                                                                                                                                                                                                        |
| `arrival_time`   | Optional if departure is present; strict 24-hour `HH:mm`.                                                                                                                                                                                                           |
| `departure_time` | Optional if arrival is present; strict 24-hour `HH:mm`.                                                                                                                                                                                                             |
| `day_offset`     | Optional. All blank means inference; otherwise every row must have a non-negative integer.                                                                                                                                                                          |

Each station needs at least one time. Departure cannot precede arrival within
the same stop: one `day_offset` describes the whole stop, so a dwell crossing
midnight within one stop is not representable in this format and is rejected.

### Day rollover

After sorting by sequence, inference starts at day 0. Compare each stop's first
time (arrival, otherwise departure) with the preceding stop's last time
(departure, otherwise arrival). A decrease advances exactly one day. Thus
22:40 → 23:55 → 00:25 → 02:10 means day 0 → 0 → 1 → 1. This cannot infer
unrecorded whole-day gaps; use explicit offsets for those. Explicit offsets/times
must never move backwards. Partial offset specification is rejected.

### Fictional format example

These sample stations and timings demonstrate the format only, not a real railway schedule.
Blank running_days demonstrates Daily.

```csv
train_number,train_name,running_days,stop_sequence,station_code,station_name,arrival_time,departure_time,day_offset
99999,Sample Express,,1,SMPA,Sample City A,,06:00,0
,,,2,SMPB,Sample City B,08:00,08:05,0
,,,3,SMPC,Sample City C,00:30,,1
```

Errors identify rows where possible. The UI shows the first ten errors and the
remaining count. Invalid files never write partial schedules.

## Platform behavior

On Web/PWA the Home Trains card is always visible, including before the first
import. On installed Capacitor Android it appears only when at least one train
exists. Restore, per-train deletion, and delete-all publish the shared count and
change signals, updating Home, Settings, and the saved list without a restart.
Android Settings always offers Restore Train Backup, even with zero trains.

Platform decisions use `AppPlatformService` and Capacitor's platform, not user-agent
sniffing. An Android browser or PWA is still Web. CSV service calls and repository
creation are functionally guarded as well as excluded from Android templates.

## Local SQLite persistence

All trains use one writable SQLite database, logically `metropocket-user-trains`,
with v1 metadata, `trains`, and `train_stops`. Foreign keys are enabled on every
open; deletion cascades to stops. Train numbers, names, station names, and station
codes are searched locally with bound SQL parameters. The list does not materialize
every timetable for searches. Detail pages show a narrow-screen station timeline.

The SQL.js engine and base-relative WASM URL are shared with the public-pack reader.
Public databases still enforce `PRAGMA query_only = ON`. The PWA prefetches the
local WASM asset alongside the app shell so first Train use can work offline after
service-worker installation. A development server has no production service worker;
open Trains once while online to load its code/WASM before testing DevTools offline.

Gzipped SQLite bytes are one IndexedDB record:

- Database: `metropocket-user-data`
- Store: `sqlite`
- Key: `trains`

Writes serialize within a service instance. Each operation loads the last durable
snapshot, opens a disposable writable database, commits one SQLite transaction,
exports/compresses it, then atomically replaces the IndexedDB record. The replacement
checks the prior revision in the same IDB transaction to detect another tab's write.
Failed validation, SQL, or persistence leaves the previous durable snapshot intact
and does not report success. A failed operation's temporary database is closed.
Unknown future schema versions fail safely without clearing user data.

## Backup and restore

CSV creates one train on Web/PWA. **Train DB backup** transfers the entire Train
database on every platform. It is raw SQLite, not JSON and not the internal gzip
snapshot. There is no password, PIN, or encryption.

**Settings → Train Data** provides:

- **Export Train Backup:** `metropocket-trains-backup-YYYY-MM-DD.db`, MIME
  `application/x-sqlite3`. The file starts with `SQLite format 3\0`.
- **Restore Train Backup:** accepts local `.db`, `.sqlite`, or `.sqlite3` files
  up to 20 MB. The filename/extension is not proof of validity.
- **Delete All Train Data:** explicit destructive confirmation; public packs and
  other settings remain intact.

Web uses File sharing when supported, with a normal download fallback. Cancelling
sharing does not silently download or report success. Restore uses a local file
picker and reads binary bytes, without upload.

Android uses a small Capacitor `TrainBackup` plugin generated reproducibly by
`scripts/patch-android.mjs` and `scripts/patch-train-backup.mjs`. Storage Access
Framework create/open document intents let the user choose a file without broad
storage permissions. Binary bytes cross the bridge as Base64 transport only;
the saved file is plain raw SQLite. No crypto or extra native npm dependency is
used. Run the existing Android sync/patch workflow to include the plugin in an APK.
Capacitor bridge logging is disabled so debug builds do not print backup payloads.

### Validation and confirmation

The shared validator checks the magic header, successful open, v1 schema,
MetroPocket `databaseName = metropocket-user-trains` identity, optional matching
`format`, metadata, expected columns/types/primary keys, cascading foreign keys,
SQLite integrity, foreign-key integrity, and every train/stop value. Unexpected
tables, views, or triggers are rejected. Existing v1 app databases with the original
identity metadata remain compatible. Export adds `format` and `exportedAt`
inside the backup database without changing the saved snapshot.

After validation, the preview shows filename, train count, station-stop count,
current-device train count, and export time when present. No writes occur yet.
Cancel preserves current data. Restore is always a full replacement, never a
merge. When trains already exist, **Replace & Restore** warns that all existing
Train data will be replaced. Empty backups can intentionally clear Train data.

Restore revalidates the candidate, checks that local data has not changed since
preview, gzips its raw SQLite bytes, and replaces the IndexedDB record in one
readwrite transaction. Before that transaction commits, it rereads the candidate
record, reopens the stored bytes with the shared engine, and validates again.
Failure aborts the same transaction, retaining the exact old record (or no record
when storage was empty). Success/count updates happen only after commit.

## Privacy and durability

Train CSV parsing (Web only), guide/template generation, SQLite queries, and backup
validation work locally after app assets load. No train code uses a railway API,
server, cloud upload, analytics, location, or console logging of schedules/bytes.
Web and Android use the same schema and backup bytes.

Normal refreshes and restarts retain IndexedDB data, but browser eviction, clearing
site/app storage, or uninstalling can remove it. Export a backup outside the app
before changing devices or clearing storage. Android backup/transfer rules remain
disabled; manual Train DB export/restore is the transfer mechanism.
