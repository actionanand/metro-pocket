# User-managed train schedules

Trains are private, mutable user data, separate from read-only public Metro/TV packs.
There is no railway API, live timetable, bundled real train data, upload, analytics,
or location access. Offline Data and `PackType = 'metro' | 'tv'` are unchanged.

## Import one train per CSV

Open **Trains → Import Train CSV**. Parsing/validation displays a preview; only
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

**Settings → Train Data** shows the local train count and supports:

- **Export Train Backup:** downloads `metropocket-trains-backup-YYYY-MM-DD.json` locally.
- **Import Train Backup:** validates a JSON file (up to 20 MB) and previews its date,
  train count, matching train numbers, and new trains before saving.
- **Delete All Train Data:** requires explicit confirmation and does not affect public packs.

Backups use `format: "metropocket-trains"`, `schemaVersion: 1`, `exportedAt` (ISO
timestamp), and a `trains` array. Each train contains its text number, optional name,
MON–SUN day array, ISO creation/update timestamps, and every stop. Raw SQLite is not
the migration format. Metro/TV packs are excluded.

**Merge** adds new numbers, replaces matching numbers with the backup schedules,
and preserves unrelated trains. **Replace all train data** removes current trains
and imports only the backup; it requires an additional destructive confirmation.
An empty backup can intentionally clear all trains in replace-all mode. Both modes
use one atomic operation. Invalid backups (including duplicates, unknown versions,
bad days, times, sequences, or offsets) leave current data unchanged.

## Privacy and durability

CSV parsing, template generation, SQL reads/writes, and backup handling work locally
after the app assets load. No train code calls a network API. Downloads use browser/PWA
file download and do not require a new Capacitor plugin. Browser/WebView download
handling varies; browser/PWA is the supported baseline for exporting backups.

Normal refreshes and restarts retain IndexedDB data, but browser eviction, clearing
site/app storage, or uninstalling can remove it. Export and keep a backup outside
the app before changing devices or clearing storage. Imported contents are never
logged. A backup contains private user data; share it only when you choose to.
