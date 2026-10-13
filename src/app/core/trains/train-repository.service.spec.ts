/// <reference types="node" />
import { TestBed } from '@angular/core/testing';
import { readFileSync } from 'node:fs';
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import { gzipSync, gunzipSync } from 'fflate';
import { IDBFactory } from 'fake-indexeddb';
import { SQLITE_LOADER } from '../database/sqlite-engine.service';
import { queryRows, SqlitePackReaderService } from '../database/sqlite-pack-reader.service';
import { TrainRepositoryService } from './train-repository.service';
import { TrainDataStorageService } from './train-data-storage.service';
import { openTrainBackup } from './train-backup';
import { trainDatabaseFixture } from './train-database-test-fixtures';
import { readUserTrain } from './train-database';
import { AppPlatformService } from '../platform/app-platform.service';
import type { UserTrain } from '../../shared/models/train.models';
import { sampleTrain } from './train-test-fixtures';

let engine: SqlJsStatic;

describe('Writable train SQLite and IndexedDB integration', () => {
  let repository: TrainRepositoryService;
  let storage: TrainDataStorageService;
  let web = true;
  const loader = vi.fn();
  beforeAll(async () => {
    engine = await initSqlJs({
      wasmBinary: Uint8Array.from(readFileSync('node_modules/sql.js/dist/sql-wasm.wasm')).buffer,
    });
  });
  beforeEach(() => {
    vi.clearAllMocks();
    web = true;
    vi.stubGlobal('indexedDB', new IDBFactory());
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Train code must not fetch.')));
    loader.mockResolvedValue(engine);
    TestBed.configureTestingModule({
      providers: [
        { provide: SQLITE_LOADER, useValue: loader },
        { provide: AppPlatformService, useValue: { isWeb: () => web, isAndroid: () => !web } },
      ],
    });
    repository = TestBed.inject(TrainRepositoryService);
    storage = TestBed.inject(TrainDataStorageService);
  });
  afterEach(() => vi.unstubAllGlobals());

  async function restore(trains: UserTrain[]): Promise<void> {
    await repository.restoreBackup(await repository.previewBackup(trainDatabaseFixture(engine, trains)));
  }

  async function modifySnapshot(change: (db: Database) => void): Promise<void> {
    const snapshot = (await storage.load())!;
    const database = new engine.Database(gunzipSync(new Uint8Array(snapshot.bytes)));
    try {
      change(database);
      await storage.save(Uint8Array.from(gzipSync(database.export())).buffer, snapshot.revision);
    } finally {
      database.close();
    }
  }

  async function inspect<T>(consume: (db: Database) => T): Promise<T> {
    const snapshot = (await storage.load())!;
    const database = new engine.Database(gunzipSync(new Uint8Array(snapshot.bytes)));
    try {
      return consume(database);
    } finally {
      database.close();
    }
  }

  it('creates a new v1 database, persists metadata and enables foreign keys for cascade deletion', async () => {
    expect(await repository.count()).toBe(0);
    await repository.importTrain(sampleTrain());
    expect(await inspect(db => queryRows(db, 'SELECT key,value FROM metadata'))).toEqual([
      { key: 'databaseName', value: 'metropocket-user-trains' },
      { key: 'schemaVersion', value: '1' },
    ]);
    expect(await inspect(db => queryRows(db, 'SELECT COUNT(*) AS count FROM train_stops')[0]['count'])).toBe(3);
    await repository.deleteTrain('00123');
    expect(await repository.count()).toBe(0);
    expect(await inspect(db => queryRows(db, 'SELECT COUNT(*) AS count FROM train_stops')[0]['count'])).toBe(0);
  });
  it('inserts/loads text train numbers and all optional stop fields', async () => {
    const train = sampleTrain();
    delete train.trainName;
    await repository.importTrain(train);
    const loaded = (await repository.get('00123'))!;
    expect(loaded.trainNumber).toBe('00123');
    expect(loaded.trainName).toBeUndefined();
    expect(loaded.stops).toEqual(train.stops);
    expect(loaded.runningDays).toEqual(train.runningDays);
    expect(loaded.createdAt).toBe(loaded.updatedAt);
  });
  it.each(['00123', 'sample express', 'sample city b', 'smpb'])(
    'searches local SQL by number, name, station or code: %s',
    async search => {
      await repository.importTrain(sampleTrain());
      await repository.importTrain({
        ...sampleTrain('99999', 'Other'),
        stops: [{ sequence: 1, stationName: 'Elsewhere', departureTime: '06:00', dayOffset: 0 }],
      });
      const results = await repository.list(search);
      expect(results.map(train => train.trainNumber)).toEqual(['00123']);
      expect(results[0].stopCount).toBe(3);
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it('binds searches and treats SQL wildcard characters as literal input', async () => {
    await repository.importTrain(sampleTrain());
    expect(await repository.list("%' OR 1=1 --")).toEqual([]);
    expect(await repository.list('_')).toEqual([]);
    expect(await repository.get("' OR 1=1 --")).toBeUndefined();
  });
  it('does not silently replace a saved train', async () => {
    await repository.importTrain(sampleTrain());
    const revision = (await storage.load())!.revision;
    await expect(repository.importTrain(sampleTrain('00123', 'Other'))).rejects.toThrow('already exists');
    expect((await repository.get('00123'))!.trainName).toBe('Sample Express');
    expect((await storage.load())!.revision).toBe(revision);
  });
  it('atomically replaces a train, removes old stops and preserves creation time', async () => {
    await restore([sampleTrain()]);
    const next = {
      ...sampleTrain('00123', 'Replacement'),
      stops: [{ sequence: 1, stationName: 'New Origin', departureTime: '06:00', dayOffset: 0 }],
    };
    await repository.importTrain(next, true);
    const loaded = (await repository.get('00123'))!;
    expect(loaded.trainName).toBe('Replacement');
    expect(loaded.stops).toHaveLength(1);
    expect(loaded.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(await inspect(db => queryRows(db, 'SELECT COUNT(*) AS count FROM train_stops')[0]['count'])).toBe(1);
  });
  it('a failed SQLite replacement preserves the old train and durable bytes', async () => {
    await repository.importTrain(sampleTrain());
    await modifySnapshot(db =>
      db.run(`CREATE TRIGGER reject_stop BEFORE INSERT ON train_stops
      WHEN NEW.station_name = 'Rejected Station' BEGIN SELECT RAISE(ABORT, 'Test insert failure'); END;`),
    );
    const before = await storage.load();
    await expect(
      repository.importTrain(
        {
          ...sampleTrain(),
          stops: [{ sequence: 1, stationName: 'Rejected Station', departureTime: '06:00', dayOffset: 0 }],
        },
        true,
      ),
    ).rejects.toThrow('Test insert failure');
    expect(await storage.load()).toEqual(before);
    expect((await repository.get('00123'))!.stops).toHaveLength(3);
  });
  it('invalid replacement is rejected before changing the existing database', async () => {
    await repository.importTrain(sampleTrain());
    const before = await storage.load();
    await expect(repository.importTrain({ ...sampleTrain(), stops: [] }, true)).rejects.toThrow('schedule needs');
    expect(await storage.load()).toEqual(before);
  });
  it('failed persistence never reports success or exposes a non-durable in-memory change', async () => {
    await repository.importTrain(sampleTrain());
    const changes = repository.changes();
    vi.spyOn(storage, 'save').mockRejectedValueOnce(new Error('Storage quota exceeded'));
    await expect(repository.importTrain(sampleTrain('99999'))).rejects.toThrow('Storage quota exceeded');
    expect(await repository.count()).toBe(1);
    expect(await repository.get('99999')).toBeUndefined();
    expect(repository.changes()).toBe(changes);
    await repository.importTrain(sampleTrain('88888'));
    expect(await repository.count()).toBe(2);
  });
  it('loads durable IndexedDB bytes from a new service instance after restart', async () => {
    await repository.importTrain(sampleTrain());
    const before = await storage.load();
    expect(await new TrainDataStorageService().load()).toEqual(before);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: SQLITE_LOADER, useValue: loader },
        { provide: AppPlatformService, useValue: { isWeb: () => web, isAndroid: () => !web } },
      ],
    });
    const reloaded = TestBed.inject(TrainRepositoryService);
    expect((await reloaded.get('00123'))!.stops).toHaveLength(3);
    expect(await reloaded.list()).toHaveLength(1);
  });
  it('serializes simultaneous writes rather than dropping a train', async () => {
    await Promise.all([repository.importTrain(sampleTrain('11111')), repository.importTrain(sampleTrain('22222'))]);
    expect(await repository.count()).toBe(2);
  });
  it('rejects stale revisions atomically across independent storage clients', async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    await storage.save(bytes, 0);
    const other = new TrainDataStorageService();
    await other.save(new Uint8Array([4, 5, 6]).buffer, 1);
    await expect(storage.save(bytes, 1)).rejects.toThrow('another window');
    expect((await storage.load())!.bytes).toEqual(new Uint8Array([4, 5, 6]).buffer);
  });
  it('fails safely on unsupported future schemas without clearing saved bytes', async () => {
    await repository.importTrain(sampleTrain());
    await modifySnapshot(db => db.run("UPDATE metadata SET value = '2' WHERE key = 'schemaVersion'"));
    const before = await storage.load();
    await expect(repository.list()).rejects.toThrow('schema version is not supported');
    await expect(repository.deleteAll()).rejects.toThrow('schema version is not supported');
    expect(await storage.load()).toEqual(before);
  });
  it('rejects corrupt stored SQLite without replacing it', async () => {
    await storage.save(Uint8Array.from(gzipSync(new Uint8Array([1, 2, 3]))).buffer, 0);
    const before = await storage.load();
    await expect(repository.count()).rejects.toThrow('Invalid SQLite');
    expect(await storage.load()).toEqual(before);
  });
  it('can retry the shared engine loader after a failed initialization', async () => {
    loader.mockRejectedValueOnce(new Error('Engine unavailable'));
    await expect(repository.count()).rejects.toThrow('Engine unavailable');
    expect(await repository.count()).toBe(0);
    expect(loader).toHaveBeenCalledTimes(2);
  });
  it('shares one engine with public readers while keeping public DBs query-only', async () => {
    await repository.count();
    const fixture = new engine.Database();
    fixture.run('CREATE TABLE test(value TEXT)');
    const bytes = Uint8Array.from(gzipSync(fixture.export())).buffer;
    fixture.close();
    await expect(
      TestBed.inject(SqlitePackReaderService).read(bytes, database =>
        database.run("INSERT INTO test VALUES ('forbidden')"),
      ),
    ).rejects.toThrow('readonly');
    expect(loader).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('exports raw SQLite with identity/export metadata, every train and unchanged internal gzip storage', async () => {
    await restore([sampleTrain()]);
    const before = await storage.load();
    const backup = await repository.exportBackup();
    expect(new TextDecoder().decode(new Uint8Array(backup.bytes).subarray(0, 16))).toBe('SQLite format 3\0');
    const opened = openTrainBackup(engine, backup.bytes);
    try {
      expect(opened.summary).toEqual({ trainCount: 1, stopCount: 3, exportedAt: backup.exportedAt });
      expect(readUserTrain(opened.database, '00123')).toEqual(sampleTrain());
      expect(queryRows(opened.database, "SELECT value FROM metadata WHERE key='format'")[0]['value']).toBe(
        'metropocket-user-trains',
      );
    } finally {
      opened.database.close();
    }
    expect(await storage.load()).toEqual(before);
  });
  it('previews train/stop/current-device counts without changing saved data', async () => {
    await repository.importTrain(sampleTrain());
    const before = await storage.load();
    const preview = await repository.previewBackup(
      trainDatabaseFixture(engine, [sampleTrain('99999'), sampleTrain('88888')]),
    );
    expect(preview).toMatchObject({ trainCount: 2, stopCount: 6, currentCount: 1, currentRevision: before!.revision });
    expect(await storage.load()).toEqual(before);
  });
  it('confirmed restore replaces the whole DB, including unrelated current trains, and publishes state', async () => {
    await repository.importTrain(sampleTrain());
    await repository.importTrain(sampleTrain('77777'));
    const changes = repository.changes();
    await restore([sampleTrain('99999', 'Restored')]);
    expect((await repository.list()).map(train => train.trainNumber)).toEqual(['99999']);
    expect(repository.trainCount()).toBe(1);
    expect(repository.changes()).toBe(changes + 1);
    expect((await repository.get('99999'))!.trainName).toBe('Restored');
  });
  it('an explicitly restored empty DB clears user trains and publishes zero', async () => {
    await repository.importTrain(sampleTrain());
    await restore([]);
    expect(await repository.count()).toBe(0);
    expect(repository.trainCount()).toBe(0);
    expect(await inspect(db => queryRows(db, 'SELECT COUNT(*) AS count FROM train_stops')[0]['count'])).toBe(0);
  });
  it('failed persistence retains old bytes and reactive state', async () => {
    await repository.importTrain(sampleTrain());
    const preview = await repository.previewBackup(trainDatabaseFixture(engine, [sampleTrain('99999')]));
    const before = await storage.load();
    const changes = repository.changes();
    vi.spyOn(storage, 'save').mockRejectedValueOnce(new Error('Storage quota exceeded'));
    await expect(repository.restoreBackup(preview)).rejects.toThrow('Storage quota exceeded');
    expect(await storage.load()).toEqual(before);
    expect(repository.trainCount()).toBe(1);
    expect(repository.changes()).toBe(changes);
  });
  it('post-put reopen/validation failure aborts the IDB transaction and restores the exact prior record', async () => {
    await repository.importTrain(sampleTrain());
    const preview = await repository.previewBackup(trainDatabaseFixture(engine, [sampleTrain('99999')]));
    const before = await storage.load();
    const save = storage.save.bind(storage);
    vi.spyOn(storage, 'save').mockImplementationOnce((_, revision, validateStored) =>
      save(Uint8Array.from(gzipSync(new Uint8Array([1, 2, 3]))).buffer, revision, validateStored),
    );
    await expect(repository.restoreBackup(preview)).rejects.toThrow('raw SQLite');
    expect(await storage.load()).toEqual(before);
    expect((await repository.list()).map(train => train.trainNumber)).toEqual(['00123']);
  });
  it('a failed post-put check also preserves previously empty storage', async () => {
    const bytes = Uint8Array.from(gzipSync(new Uint8Array(trainDatabaseFixture(engine)))).buffer;
    await expect(
      storage.save(bytes, 0, () => {
        throw new Error('Reopen failed');
      }),
    ).rejects.toThrow('Reopen failed');
    expect(await storage.load()).toBeUndefined();
  });
  it('revalidates candidates before replacement and rejects changed bytes', async () => {
    await repository.importTrain(sampleTrain());
    const preview = await repository.previewBackup(trainDatabaseFixture(engine, [sampleTrain('99999')]));
    const before = await storage.load();
    await expect(repository.restoreBackup({ ...preview, bytes: new Uint8Array([1]).buffer })).rejects.toThrow(
      'raw SQLite',
    );
    expect(await storage.load()).toEqual(before);
  });
  it('does not overwrite train data changed after preview', async () => {
    const preview = await repository.previewBackup(trainDatabaseFixture(engine));
    await repository.importTrain(sampleTrain('99999'));
    const before = await storage.load();
    await expect(repository.restoreBackup(preview)).rejects.toThrow('changed after this preview');
    expect(await storage.load()).toEqual(before);
  });
  it('invalid/future candidate databases do not change the current database', async () => {
    await repository.importTrain(sampleTrain());
    const before = await storage.load();
    const bytes = trainDatabaseFixture(engine, [], db =>
      db.run("UPDATE metadata SET value='2' WHERE key='schemaVersion'"),
    );
    await expect(repository.previewBackup(bytes)).rejects.toThrow('schema version');
    expect(await storage.load()).toEqual(before);
  });
  it('Android cannot create CSV schedules but can restore and delete them', async () => {
    web = false;
    await expect(repository.importTrain(sampleTrain())).rejects.toThrow('only on Web/PWA');
    expect(await storage.load()).toBeUndefined();
    await restore([sampleTrain()]);
    expect(repository.trainCount()).toBe(1);
    await repository.deleteTrain('00123');
    expect(repository.trainCount()).toBe(0);
  });
  it.each([
    ['web', 'web'],
    ['web', 'android'],
    ['android', 'web'],
    ['android', 'android'],
  ])('uses the same exported DB from %s to %s and survives target reload', async (from, to) => {
    web = from === 'web';
    if (web) await repository.importTrain(sampleTrain());
    else await restore([sampleTrain()]);
    const backup = await repository.exportBackup();
    vi.stubGlobal('indexedDB', new IDBFactory());
    TestBed.resetTestingModule();
    web = to === 'web';
    TestBed.configureTestingModule({
      providers: [
        { provide: SQLITE_LOADER, useValue: loader },
        { provide: AppPlatformService, useValue: { isWeb: () => web, isAndroid: () => !web } },
      ],
    });
    repository = TestBed.inject(TrainRepositoryService);
    storage = TestBed.inject(TrainDataStorageService);
    await repository.restoreBackup(await repository.previewBackup(backup.bytes));
    expect(await repository.count()).toBe(1);
    const original = await repository.get('00123');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: SQLITE_LOADER, useValue: loader },
        { provide: AppPlatformService, useValue: { isWeb: () => web, isAndroid: () => !web } },
      ],
    });
    expect(await TestBed.inject(TrainRepositoryService).get('00123')).toEqual(original);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('delete-all is persistent and isolated from the public pack database', async () => {
    await repository.importTrain(sampleTrain());
    await repository.deleteAll();
    expect(await repository.count()).toBe(0);
    const dbNames = (await indexedDB.databases()).map(database => database.name);
    expect(dbNames).toEqual(['metropocket-user-data']);
  });
});
