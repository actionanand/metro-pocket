import type { Database, SqlJsStatic } from 'sql.js';
import { queryRows } from '../database/sqlite-pack-reader.service';
import { prepareTrainSchema } from './train-schema';
import { readUserTrain, trainSqlInteger, trainSqlText } from './train-database';
import { isIsoTimestamp, validateUserTrain } from './train-validation';
import type { TrainBackupSummary } from '../../shared/models/train.models';

export const MAX_TRAIN_BACKUP_BYTES = 20 * 1024 * 1024;
export const TRAIN_BACKUP_MIME = 'application/x-sqlite3';

/** Complete validation shared by Web/Android restore, export, and post-write reopen. */
export function validateTrainDatabase(database: Database): TrainBackupSummary {
  prepareTrainSchema(database, false);
  const objects = queryRows(database, "SELECT name, type FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'");
  if (
    objects.some(
      row =>
        row['type'] !== 'index' &&
        (row['type'] !== 'table' || !['metadata', 'trains', 'train_stops'].includes(trainSqlText(row['name']))),
    )
  ) {
    throw new Error('The backup contains unsupported tables, views or triggers.');
  }
  // Restored schemas must remain safe for subsequent mutation, not only today's rows.
  const expected = {
    metadata: [
      ['key', 'TEXT', 1, 0],
      ['value', 'TEXT', 0, 1],
    ],
    trains: [
      ['train_number', 'TEXT', 1, 1],
      ['train_name', 'TEXT', 0, 0],
      ['running_days_mask', 'INTEGER', 0, 1],
      ['created_at', 'TEXT', 0, 1],
      ['updated_at', 'TEXT', 0, 1],
    ],
    train_stops: [
      ['train_number', 'TEXT', 1, 1],
      ['stop_sequence', 'INTEGER', 2, 1],
      ['station_code', 'TEXT', 0, 0],
      ['station_name', 'TEXT', 0, 1],
      ['arrival_time', 'TEXT', 0, 0],
      ['departure_time', 'TEXT', 0, 0],
      ['day_offset', 'INTEGER', 0, 1],
    ],
  } as const;
  for (const [table, columns] of Object.entries(expected)) {
    const actual = queryRows(database, `PRAGMA table_info(${table})`);
    if (
      actual.length !== columns.length ||
      columns.some(([name, type, pk, notnull]) => {
        const column = actual.find(column => column['name'] === name);
        return (
          !column ||
          trainSqlText(column['type']).toUpperCase() !== type ||
          column['pk'] !== pk ||
          column['notnull'] !== notnull
        );
      })
    )
      throw new Error(`The backup has an incompatible ${table} schema.`);
  }
  const foreignKeys = queryRows(database, 'PRAGMA foreign_key_list(train_stops)');
  if (
    foreignKeys.length !== 1 ||
    foreignKeys[0]['table'] !== 'trains' ||
    foreignKeys[0]['from'] !== 'train_number' ||
    foreignKeys[0]['to'] !== 'train_number' ||
    foreignKeys[0]['on_delete'] !== 'CASCADE'
  ) {
    throw new Error('The backup has an incompatible train/stop foreign key.');
  }
  const integrity = queryRows(database, 'PRAGMA integrity_check');
  if (
    integrity.length !== 1 ||
    integrity[0]['integrity_check'] !== 'ok' ||
    queryRows(database, 'PRAGMA foreign_key_check').length
  ) {
    throw new Error('The backup failed SQLite integrity or foreign-key checks.');
  }
  const metadata = new Map<string, string>();
  for (const row of queryRows(database, 'SELECT key, value FROM metadata')) {
    const key = trainSqlText(row['key']);
    if (!key || metadata.has(key)) throw new Error('The backup contains invalid metadata.');
    metadata.set(key, trainSqlText(row['value']));
  }
  if (metadata.has('format') && metadata.get('format') !== 'metropocket-user-trains')
    throw new Error('This is not a MetroPocket Train database.');
  const exportedAt = metadata.get('exportedAt');
  if (exportedAt !== undefined && !isIsoTimestamp(exportedAt)) throw new Error('The backup export time is invalid.');
  const numbers = queryRows(database, 'SELECT train_number FROM trains ORDER BY train_number');
  for (const row of numbers) validateUserTrain(readUserTrain(database, trainSqlText(row['train_number'])));
  return {
    trainCount: numbers.length,
    stopCount: trainSqlInteger(queryRows(database, 'SELECT COUNT(*) AS count FROM train_stops')[0]['count']),
    exportedAt,
  };
}

export function openTrainBackup(
  engine: SqlJsStatic,
  bytes: ArrayBuffer,
): { database: Database; summary: TrainBackupSummary } {
  if (bytes.byteLength > MAX_TRAIN_BACKUP_BYTES)
    throw new Error('Train backup is too large. Choose a file of at most 20 MB.');
  if (new TextDecoder().decode(new Uint8Array(bytes).subarray(0, 16)) !== 'SQLite format 3\0') {
    throw new Error('Choose a raw SQLite Train backup (.db), not JSON, CSV or gzip.');
  }
  let database: Database | undefined;
  try {
    database = new engine.Database(new Uint8Array(bytes));
    return { database, summary: validateTrainDatabase(database) };
  } catch (cause) {
    database?.close();
    throw new Error(`Invalid Train backup: ${cause instanceof Error ? cause.message : 'SQLite could not be opened.'}`);
  }
}
