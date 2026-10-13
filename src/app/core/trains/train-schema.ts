import type { Database } from 'sql.js';
import { queryRows } from '../database/sqlite-pack-reader.service';

export const TRAIN_SCHEMA_VERSION = 1;

const schemaV1 = `
  CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  INSERT INTO metadata VALUES ('databaseName', 'metropocket-user-trains'), ('schemaVersion', '1');
  CREATE TABLE trains (
    train_number TEXT PRIMARY KEY NOT NULL,
    train_name TEXT,
    running_days_mask INTEGER NOT NULL CHECK(running_days_mask BETWEEN 1 AND 127),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE train_stops (
    train_number TEXT NOT NULL REFERENCES trains(train_number) ON DELETE CASCADE,
    stop_sequence INTEGER NOT NULL CHECK(stop_sequence > 0),
    station_code TEXT,
    station_name TEXT NOT NULL,
    arrival_time TEXT,
    departure_time TEXT,
    day_offset INTEGER NOT NULL DEFAULT 0 CHECK(day_offset >= 0),
    PRIMARY KEY(train_number, stop_sequence),
    CHECK(arrival_time IS NOT NULL OR departure_time IS NOT NULL)
  );
  CREATE INDEX trains_name ON trains(train_name COLLATE NOCASE);
  CREATE INDEX train_stops_name ON train_stops(station_name COLLATE NOCASE);
  CREATE INDEX train_stops_code ON train_stops(station_code COLLATE NOCASE);
`;

/** All schema creation/upgrade decisions live here; unknown versions are never reset. */
export function prepareTrainSchema(database: Database, empty: boolean): void {
  database.run('PRAGMA foreign_keys = ON');
  if (empty) database.run(schemaV1);
  const metadata = new Map(
    queryRows(database, 'SELECT key, value FROM metadata').map(row => [row['key'], row['value']]),
  );
  if (metadata.get('schemaVersion') !== String(TRAIN_SCHEMA_VERSION)) {
    throw new Error('This saved train database schema version is not supported. Use a compatible app version.');
  }
  if (metadata.get('databaseName') !== 'metropocket-user-trains')
    throw new Error('Saved train database identity is invalid.');
  const columns = {
    trains: ['train_number', 'train_name', 'running_days_mask', 'created_at', 'updated_at'],
    train_stops: [
      'train_number',
      'stop_sequence',
      'station_code',
      'station_name',
      'arrival_time',
      'departure_time',
      'day_offset',
    ],
  };
  for (const [table, required] of Object.entries(columns)) {
    const names = new Set(queryRows(database, `PRAGMA table_info(${table})`).map(row => row['name']));
    if (required.some(name => !names.has(name))) throw new Error(`Saved train table is incomplete: ${table}.`);
  }
  if (
    queryRows(database, 'PRAGMA foreign_key_check').length ||
    queryRows(database, 'PRAGMA quick_check')[0]['quick_check'] !== 'ok'
  ) {
    throw new Error('Saved train database failed its integrity checks.');
  }
}
