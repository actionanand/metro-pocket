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
import { createTrainBackup } from './train-backup';
import { sampleTrain } from './train-test-fixtures';

let engine: SqlJsStatic;

describe('Writable train SQLite and IndexedDB integration', () => {
  let repository: TrainRepositoryService;
  let storage: TrainDataStorageService;
  const loader = vi.fn();
  beforeAll(async () => {
    engine = await initSqlJs({
      wasmBinary: Uint8Array.from(readFileSync('node_modules/sql.js/dist/sql-wasm.wasm')).buffer,
    });
  });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('indexedDB', new IDBFactory());
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Train code must not fetch.')));
    loader.mockResolvedValue(engine);
    TestBed.configureTestingModule({ providers: [{ provide: SQLITE_LOADER, useValue: loader }] });
    repository = TestBed.inject(TrainRepositoryService);
    storage = TestBed.inject(TrainDataStorageService);
  });
  afterEach(() => vi.unstubAllGlobals());

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
    await repository.restoreBackup(createTrainBackup([sampleTrain()]), 'merge');
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
    TestBed.configureTestingModule({ providers: [{ provide: SQLITE_LOADER, useValue: loader }] });
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
  it('exports only user trains with all original timestamps and stops', async () => {
    await repository.restoreBackup(createTrainBackup([sampleTrain()]), 'merge');
    const backup = await repository.exportBackup();
    expect(backup.format).toBe('metropocket-trains');
    expect(backup.schemaVersion).toBe(1);
    expect(backup.trains).toEqual([sampleTrain()]);
    expect(backup).not.toHaveProperty('packs');
  });
  it('previews matches/new trains before writing, then merges matching replacements only', async () => {
    await repository.importTrain(sampleTrain());
    await repository.importTrain(sampleTrain('77777'));
    const backup = createTrainBackup([sampleTrain('00123', 'Changed'), sampleTrain('99999')]);
    const before = await storage.load();
    expect(await repository.previewBackup(backup)).toEqual({ existing: 1, added: 1 });
    expect(await storage.load()).toEqual(before);
    await repository.restoreBackup(backup, 'merge');
    expect((await repository.list()).map(train => train.trainNumber)).toEqual(['00123', '77777', '99999']);
    expect((await repository.get('00123'))!.trainName).toBe('Changed');
  });
  it('replace-all imports only backup trains, and accepts an explicitly empty backup', async () => {
    await repository.importTrain(sampleTrain());
    await repository.restoreBackup(createTrainBackup([sampleTrain('99999')]), 'replace-all');
    expect((await repository.list()).map(train => train.trainNumber)).toEqual(['99999']);
    await repository.restoreBackup(createTrainBackup([]), 'replace-all');
    expect(await repository.count()).toBe(0);
    expect(await inspect(db => queryRows(db, 'SELECT COUNT(*) AS count FROM train_stops')[0]['count'])).toBe(0);
  });
  it.each(['merge', 'replace-all'] as const)('failed %s import preserves every previous train', async mode => {
    await repository.importTrain(sampleTrain());
    await modifySnapshot(db =>
      db.run(`CREATE TRIGGER reject_train BEFORE INSERT ON trains
      WHEN NEW.train_number = '99999' BEGIN SELECT RAISE(ABORT, 'Backup insert failure'); END;`),
    );
    const before = await storage.load();
    await expect(
      repository.restoreBackup(createTrainBackup([sampleTrain('88888'), sampleTrain('99999')]), mode),
    ).rejects.toThrow('Backup insert failure');
    expect(await storage.load()).toEqual(before);
    expect((await repository.list()).map(train => train.trainNumber)).toEqual(['00123']);
  });
  it.each(['merge', 'replace-all'] as const)(
    'failed %s persistence retains the previous durable backup',
    async mode => {
      await repository.importTrain(sampleTrain());
      const before = await storage.load();
      vi.spyOn(storage, 'save').mockRejectedValueOnce(new Error('Storage quota exceeded'));
      await expect(repository.restoreBackup(createTrainBackup([sampleTrain('99999')]), mode)).rejects.toThrow(
        'Storage quota exceeded',
      );
      expect(await storage.load()).toEqual(before);
      expect((await repository.list()).map(train => train.trainNumber)).toEqual(['00123']);
    },
  );
  it('rejects malformed backups and future versions before deleting anything', async () => {
    await repository.importTrain(sampleTrain());
    const before = await storage.load();
    await expect(
      repository.restoreBackup(
        { ...createTrainBackup([]), schemaVersion: 2 } as unknown as ReturnType<typeof createTrainBackup>,
        'replace-all',
      ),
    ).rejects.toThrow('schema version');
    expect(await storage.load()).toEqual(before);
  });
  it('delete-all is persistent and isolated from the public pack database', async () => {
    await repository.importTrain(sampleTrain());
    await repository.deleteAll();
    expect(await repository.count()).toBe(0);
    const dbNames = (await indexedDB.databases()).map(database => database.name);
    expect(dbNames).toEqual(['metropocket-user-data']);
  });
});
