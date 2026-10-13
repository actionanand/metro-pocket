/// <reference types="node" />
import { readFileSync } from 'node:fs';
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { gzipSync } from 'fflate';
import { openTrainBackup, MAX_TRAIN_BACKUP_BYTES } from './train-backup';
import { trainDatabaseFixture } from './train-database-test-fixtures';
import { sampleTrain } from './train-test-fixtures';

let engine: SqlJsStatic;
beforeAll(async () => {
  engine = await initSqlJs({
    wasmBinary: Uint8Array.from(readFileSync('node_modules/sql.js/dist/sql-wasm.wasm')).buffer,
  });
});

describe('Raw SQLite Train backup validation', () => {
  it('validates one platform-independent DB with optional name, Daily and all stops', () => {
    const train = sampleTrain();
    delete train.trainName;
    const opened = openTrainBackup(engine, trainDatabaseFixture(engine, [train]));
    try {
      expect(opened.summary).toEqual({ trainCount: 1, stopCount: 3, exportedAt: undefined });
    } finally {
      opened.database.close();
    }
  });
  it('accepts an empty v1 database for confirmed full replacement', () => {
    const opened = openTrainBackup(engine, trainDatabaseFixture(engine, []));
    expect(opened.summary.trainCount).toBe(0);
    opened.database.close();
  });
  it('reads optional export metadata from the SQLite database', () => {
    const opened = openTrainBackup(
      engine,
      trainDatabaseFixture(engine, [sampleTrain()], db =>
        db.run("INSERT INTO metadata VALUES ('exportedAt','2026-10-13T12:00:00.000Z')"),
      ),
    );
    expect(opened.summary.exportedAt).toBe('2026-10-13T12:00:00.000Z');
    opened.database.close();
  });
  it.each([new TextEncoder().encode('{"format":"metropocket-trains"}').buffer, new Uint8Array([1, 2, 3]).buffer])(
    'rejects non-SQLite input',
    bytes => expect(() => openTrainBackup(engine, bytes)).toThrow('raw SQLite'),
  );
  it('rejects gzip bytes labelled as .db', () =>
    expect(() =>
      openTrainBackup(engine, Uint8Array.from(gzipSync(new Uint8Array(trainDatabaseFixture(engine)))).buffer),
    ).toThrow('raw SQLite'));
  it('rejects oversized files', () =>
    expect(() => openTrainBackup(engine, new ArrayBuffer(MAX_TRAIN_BACKUP_BYTES + 1))).toThrow('20 MB'));
  it('rejects a corrupt/truncated database even when its header is SQLite', () => {
    expect(() => openTrainBackup(engine, trainDatabaseFixture(engine).slice(0, 20))).toThrow('Invalid Train backup');
  });
  it('rejects unrelated SQLite databases', () => {
    const database = new engine.Database();
    database.run('CREATE TABLE unrelated (name TEXT)');
    const bytes = Uint8Array.from(database.export()).buffer;
    database.close();
    expect(() => openTrainBackup(engine, bytes)).toThrow('Invalid Train backup');
  });
  it.each([
    ['DROP TABLE metadata', 'metadata'],
    ["UPDATE metadata SET value='other-app' WHERE key='databaseName'", 'identity'],
    ["UPDATE metadata SET value='2' WHERE key='schemaVersion'", 'schema version'],
    ['DROP TABLE train_stops', 'incomplete'],
    ["INSERT INTO metadata VALUES ('format','another-app')", 'not a MetroPocket'],
    ["INSERT INTO metadata VALUES ('exportedAt','2026-02-30T00:00:00.000Z')", 'export time'],
    ['CREATE TRIGGER unwanted AFTER DELETE ON trains BEGIN DELETE FROM trains; END', 'unsupported'],
  ])('rejects incompatible identity/schema: %s', (sql, message) => {
    const bytes = trainDatabaseFixture(engine, [sampleTrain()], database => database.run(sql));
    expect(() => openTrainBackup(engine, bytes)).toThrow(message);
  });
  it('rejects foreign-key-invalid stops', () => {
    const bytes = trainDatabaseFixture(engine, [sampleTrain()], db => {
      db.run('PRAGMA foreign_keys=OFF');
      db.run("INSERT INTO train_stops VALUES ('99999',1,NULL,'Orphan Station',NULL,'06:00',0)");
    });
    expect(() => openTrainBackup(engine, bytes)).toThrow('integrity');
  });
  it('rejects an integrity failure caused by violated SQLite CHECK constraints', () => {
    const bytes = trainDatabaseFixture(engine, [sampleTrain()], db => {
      db.run('PRAGMA ignore_check_constraints=ON');
      db.run('UPDATE trains SET running_days_mask=0');
    });
    expect(() => openTrainBackup(engine, bytes)).toThrow('integrity');
  });
  it.each([
    ["UPDATE trains SET train_number='ABC'", 'stored as text'],
    ["UPDATE trains SET train_name=''", 'trainName'],
    ["UPDATE trains SET created_at='bad'", 'ISO timestamps'],
    ["UPDATE train_stops SET departure_time='25:70' WHERE stop_sequence=1", 'HH:mm'],
    ["UPDATE train_stops SET station_name='' WHERE stop_sequence=1", 'stationName'],
    ['UPDATE train_stops SET day_offset=0 WHERE stop_sequence=2', 'move backwards'],
    ['DELETE FROM train_stops', 'schedule needs'],
  ])('validates all train and stop values: %s', (sql, message) => {
    const bytes = trainDatabaseFixture(engine, [sampleTrain()], db => {
      db.run('PRAGMA foreign_keys=OFF');
      db.run(sql);
    });
    // A changed primary-key value also leaves orphans; integrity must reject those
    // before semantic validation. Test numbers with no stops instead below.
    expect(() => openTrainBackup(engine, bytes)).toThrow(sql.includes('train_number') ? 'integrity' : message);
  });
  it('rejects missing primary-key/foreign-key constraints rather than accepting duplicate rows', () => {
    const bytes = trainDatabaseFixture(engine, [], db => {
      db.run(`DROP TABLE train_stops;
        CREATE TABLE train_stops (train_number TEXT NOT NULL, stop_sequence INTEGER NOT NULL,
          station_code TEXT, station_name TEXT NOT NULL, arrival_time TEXT, departure_time TEXT,
          day_offset INTEGER NOT NULL DEFAULT 0);
        INSERT INTO train_stops VALUES ('00123',1,NULL,'Duplicate',NULL,'06:00',0),('00123',1,NULL,'Duplicate',NULL,'06:00',0);`);
    });
    expect(() => openTrainBackup(engine, bytes)).toThrow('incompatible');
  });
});
