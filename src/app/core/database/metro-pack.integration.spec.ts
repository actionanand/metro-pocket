/// <reference types="node" />
import { TestBed } from '@angular/core/testing';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { gzipSync } from 'fflate';
import { SqlitePackReaderService, SQLITE_LOADER, sqliteWasmUrl } from './sqlite-pack-reader.service';
import { mapMetroDatabase, MetroNetworkRepositoryService } from './metro-network-repository.service';
import { MetroRoutePlannerService } from './metro-route-planner.service';
import { PackInstallerService } from '../data-packs/pack-installer.service';
import { PackStorageService } from '../data-packs/pack-storage.service';
import type { DataPackDescriptor, InstalledPack } from '../../shared/models/data-pack.models';

const descriptor: DataPackDescriptor = {
  id: 'metro-test',
  name: 'Test Metro',
  type: 'metro',
  version: 1,
  schemaVersion: 1,
  file: 'test.db.gz',
  downloadUrl: 'https://example.test/test.db.gz',
};
const installed: InstalledPack = { ...descriptor, size: 100, installedAt: '2026-01-01' };
let engine: SqlJsStatic;

// Synthetic stations only. No production database is shipped with these fixtures.
function fixture(change?: (database: initSqlJs.Database) => void): ArrayBuffer {
  const database = new engine.Database();
  try {
    database.run(`
      CREATE TABLE metadata (key TEXT, value TEXT);
      CREATE TABLE stations (id TEXT, name TEXT, status TEXT);
      CREATE TABLE station_aliases (station_id TEXT, alias TEXT);
      CREATE TABLE station_codes (station_id TEXT, code TEXT);
      CREATE TABLE lines (id TEXT, name TEXT, color TEXT, status TEXT, terminal_a_station_id TEXT, terminal_b_station_id TEXT);
      CREATE TABLE station_lines (station_id TEXT, line_id TEXT, sequence INTEGER);
      CREATE TABLE connections (from_station_id TEXT, to_station_id TEXT, line_id TEXT, travel_minutes REAL, status TEXT, bidirectional INTEGER);
      CREATE TABLE interchanges (station_id TEXT, from_line_id TEXT, to_line_id TEXT, walk_minutes REAL);
      INSERT INTO metadata VALUES ('packId','metro-test'),('type','metro'),('version','1'),('schemaVersion','1'),('city','Fixture City'),('networkAsOf','2026-01-01'),('defaultEdgeMinutes','3');
      INSERT INTO stations VALUES ('a','Terminal A','operational'),('b','Station B','operational'),('c','Terminal C','operational'),('d','Terminal D','operational');
      INSERT INTO station_aliases VALUES ('b','Town'),('b','Centre');
      INSERT INTO station_codes VALUES ('b','B01'),('b','B02');
      INSERT INTO lines VALUES ('one','Line One','#123456','operational','a','c'),('two','Line Two','#654321','operational','c','d');
      INSERT INTO station_lines VALUES ('c','one',30),('a','one',10),('b','one',20),('d','two',20),('c','two',10);
      INSERT INTO connections VALUES ('a','b','one',2,'operational',1),('b','c','one',NULL,'operational',1),('c','d','two',4,'operational',0);
      INSERT INTO interchanges VALUES ('c','one','two',NULL);
    `);
    change?.(database);
    return Uint8Array.from(gzipSync(database.export())).buffer;
  } finally {
    database.close();
  }
}

describe('Metro SQLite pack integration', () => {
  let reader: SqlitePackReaderService;
  const storage = { installed: vi.fn(), getBytes: vi.fn(), replace: vi.fn() };
  beforeAll(async () => {
    engine = await initSqlJs({
      wasmBinary: Uint8Array.from(readFileSync('node_modules/sql.js/dist/sql-wasm.wasm')).buffer,
    });
  });
  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        { provide: SQLITE_LOADER, useValue: () => Promise.resolve(engine) },
        { provide: PackStorageService, useValue: storage },
      ],
    });
    reader = TestBed.inject(SqlitePackReaderService);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('decompresses SQLite and maps aliases, codes, NULL timings and ordered memberships', async () => {
    const network = await reader.read(fixture(), db => mapMetroDatabase(db, descriptor));
    expect(network.city).toBe('Fixture City');
    expect(network.stations[1].aliases).toEqual(['Town', 'Centre']);
    expect(network.stations[1].codes).toEqual(['B01', 'B02']);
    expect(network.connections[1].minutes).toBeUndefined();
    expect(network.interchanges?.[0].minutes).toBeUndefined();
    expect(network.stationLines?.filter(item => item.lineId === 'one').map(item => item.stationId)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(network.connections[2].bidirectional).toBe(false);
    const planner = new MetroRoutePlannerService();
    expect(planner.search(network, 'town')[0].id).toBe('b');
    expect(planner.search(network, 'b01')[0].id).toBe('b');
    expect(planner.plan(network, 'a', 'c')?.segments[0].toward).toBe('Terminal C');
    expect(planner.plan(network, 'c', 'a')?.segments[0].toward).toBe('Terminal A');
    expect(planner.plan(network, 'd', 'a')).toBeNull();
    expect(planner.plan(network, 'a', 'd')?.minutes).toBe(14);
    expect(planner.plan(network, 'a', 'd')?.estimated).toBe(true);
  });
  it('validates required tables', async () => {
    await expect(
      reader.read(
        fixture(db => db.run('DROP TABLE station_codes')),
        db => mapMetroDatabase(db, descriptor),
      ),
    ).rejects.toThrow('Required metro table is missing');
  });
  it.each([
    "INSERT INTO station_aliases VALUES ('ghost','Ghost Station')",
    "INSERT INTO station_codes VALUES ('missing-station','X99')",
  ])('rejects orphan alias/code references before replacement: %s', async sql => {
    const bytes = fixture(db => db.run(sql));
    const message = 'Metro pack contains invalid station alias/code references.';
    await expect(reader.read(bytes, db => mapMetroDatabase(db, descriptor))).rejects.toThrow(message);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(bytes)));
    await expect(TestBed.inject(PackInstallerService).install(descriptor)).rejects.toThrow(message);
    expect(storage.replace).not.toHaveBeenCalled();
  });
  it('does not mark a fully timed selected route estimated because other edges lack timings', async () => {
    const network = await reader.read(fixture(), db => mapMetroDatabase(db, descriptor));
    expect(new MetroRoutePlannerService().plan(network, 'a', 'b')?.estimated).toBe(false);
  });
  it.each(['packId', 'type', 'version', 'schemaVersion'])('validates metadata %s', async key => {
    const bytes = fixture(db => db.run('UPDATE metadata SET value = ? WHERE key = ?', ['invalid', key]));
    await expect(reader.read(bytes, db => mapMetroDatabase(db, descriptor))).rejects.toThrow('metadata does not match');
  });
  it('resolves WASM relative to local, Pages and WebView base paths', () => {
    expect(sqliteWasmUrl('http://localhost:3042/')).toBe('http://localhost:3042/assets/sqlite/sql-wasm.wasm');
    expect(sqliteWasmUrl('https://actionanand.github.io/metro-pocket/')).toBe(
      'https://actionanand.github.io/metro-pocket/assets/sqlite/sql-wasm.wasm',
    );
    expect(sqliteWasmUrl('https://localhost/')).toBe('https://localhost/assets/sqlite/sql-wasm.wasm');
  });
  it('loads persisted bytes without any download and caches one selected network', async () => {
    const fetch = vi.fn(() => {
      throw new Error('No network allowed');
    });
    vi.stubGlobal('fetch', fetch);
    storage.getBytes.mockResolvedValue(fixture());
    storage.installed.mockResolvedValue([installed]);
    const repository = TestBed.inject(MetroNetworkRepositoryService);
    expect(await repository.installed()).toEqual([installed]);
    const network = await repository.load(installed);
    expect(await repository.load(installed)).toBe(network);
    expect(storage.getBytes).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['gzip', 'sqlite', 'metadata'])(
    'rejects invalid %s before replacing an existing working pack',
    async kind => {
      const bytes =
        kind === 'gzip'
          ? new Uint8Array([1, 2, 3]).buffer
          : kind === 'sqlite'
            ? Uint8Array.from(gzipSync(new Uint8Array([1, 2, 3]))).buffer
            : fixture(db => db.run("UPDATE metadata SET value='other' WHERE key='packId'"));
      storage.getBytes.mockResolvedValue(fixture());
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(bytes)));
      await expect(TestBed.inject(PackInstallerService).install(descriptor)).rejects.toThrow(
        'Unable to read the offline pack',
      );
      expect(storage.replace).not.toHaveBeenCalled();
    },
  );
  it('validates a new pack before replacing compressed bytes and metadata', async () => {
    const bytes = fixture();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(bytes)));
    await TestBed.inject(PackInstallerService).install(descriptor);
    expect(storage.replace).toHaveBeenCalledWith(
      descriptor.id,
      bytes,
      expect.objectContaining({ type: 'metro', version: 1 }),
    );
  });
  it('checks the compressed checksum before any replacement', async () => {
    const bytes = fixture();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(bytes)));
    vi.stubGlobal('crypto', webcrypto);
    await expect(
      TestBed.inject(PackInstallerService).install({ ...descriptor, sha256: '0'.repeat(64) }),
    ).rejects.toThrow('checksum');
    expect(storage.replace).not.toHaveBeenCalled();
  });
});
