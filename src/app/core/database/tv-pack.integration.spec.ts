/// <reference types="node" />
import { TestBed } from '@angular/core/testing';
import { readFileSync } from 'node:fs';
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { gzipSync } from 'fflate';
import { SQLITE_LOADER, SqlitePackReaderService } from './sqlite-pack-reader.service';
import { mapTvDatabase, TvDatabaseRepositoryService } from './tv-database-repository.service';
import { PackInstallerService } from '../data-packs/pack-installer.service';
import { PackStorageService } from '../data-packs/pack-storage.service';
import type { DataPackDescriptor, InstalledPack } from '../../shared/models/data-pack.models';

const descriptor: DataPackDescriptor = {
  id: 'tv-test',
  name: 'Test TV',
  type: 'tv',
  version: 1,
  schemaVersion: 1,
  file: 'tv-test.db.gz',
  downloadUrl: 'https://example.test/tv-test.db.gz',
};
const installed: InstalledPack = { ...descriptor, installedAt: '2026-01-01', size: 100, checksum: 'fixture' };
let engine: SqlJsStatic;

function fixture(change?: (database: initSqlJs.Database) => void): ArrayBuffer {
  const database = new engine.Database();
  try {
    database.run(`
      CREATE TABLE metadata (key TEXT, value TEXT);
      CREATE TABLE providers (id TEXT, name TEXT, kind TEXT);
      CREATE TABLE channels (id TEXT, name TEXT, language TEXT, genre TEXT, quality TEXT);
      CREATE TABLE channel_aliases (channel_id TEXT, alias TEXT);
      CREATE TABLE provider_channels (provider_id TEXT, channel_id TEXT, number TEXT, country TEXT, state TEXT, city TEXT, area TEXT, revision TEXT, verified_at TEXT, source_url TEXT);
      INSERT INTO metadata VALUES ('packId','tv-test'),('type','tv'),('version','1'),('schemaVersion','1');
      INSERT INTO providers VALUES ('jiotv-plus','JioTV+','iptv'),('airtel-digital-tv','Airtel Digital TV','dth'),('cable','Fixture Cable','cable');
      INSERT INTO channels VALUES ('sun-news','Sun News','Tamil','News','HD'),('sun-tv','Sun TV','Tamil','Entertainment','SD'),('unknown','Unknown',NULL,NULL,NULL);
      INSERT INTO channel_aliases VALUES ('sun-news','சன் நியூஸ்'),('sun-tv','சன் TV');
      INSERT INTO provider_channels VALUES ('jiotv-plus','sun-news','1559','IN',NULL,NULL,NULL,'subscriber','2026-10-12',NULL),
        ('jiotv-plus','sun-tv','1503','IN',NULL,NULL,NULL,NULL,NULL,NULL),
        ('airtel-digital-tv','sun-tv','754','IN',NULL,NULL,NULL,NULL,NULL,NULL),
        ('cable','unknown','9','IN','Tamil Nadu','Chennai',NULL,NULL,NULL,NULL);
    `);
    change?.(database);
    return Uint8Array.from(gzipSync(database.export())).buffer;
  } finally {
    database.close();
  }
}

describe('TV SQLite pack integration', () => {
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
  });
  afterEach(() => vi.unstubAllGlobals());

  it('opens gzip SQLite and maps provider kinds, aliases, scopes and nullable metadata', async () => {
    const database = await TestBed.inject(SqlitePackReaderService).read(fixture(), db => mapTvDatabase(db, descriptor));
    expect(database.providers.map(provider => provider.kind)).toEqual(['iptv', 'dth', 'cable']);
    expect(database.channels[0].aliases).toEqual(['சன் நியூஸ்']);
    expect(database.channels[2].quality).toBeUndefined();
    expect(database.mappings[0]).toMatchObject({
      providerId: 'jiotv-plus',
      channelId: 'sun-news',
      number: '1559',
      country: 'IN',
      revision: 'subscriber',
    });
    expect(database.mappings[3].state).toBe('Tamil Nadu');
  });
  it.each(['packId', 'type', 'version', 'schemaVersion'])('rejects mismatched %s metadata', async key => {
    await expect(
      TestBed.inject(SqlitePackReaderService).read(
        fixture(db => db.run('UPDATE metadata SET value = ? WHERE key = ?', ['wrong', key])),
        db => mapTvDatabase(db, descriptor),
      ),
    ).rejects.toThrow('metadata does not match');
  });
  it.each([
    { reason: 'missing table', sql: 'DROP TABLE channel_aliases' },
    { reason: 'duplicate provider', sql: "INSERT INTO providers VALUES ('jiotv-plus','Duplicate','iptv')" },
    { reason: 'duplicate channel', sql: "INSERT INTO channels VALUES ('sun-tv','Duplicate',NULL,NULL,NULL)" },
    { reason: 'invalid provider kind', sql: "UPDATE providers SET kind='satellite' WHERE id='jiotv-plus'" },
    { reason: 'empty channel name', sql: "UPDATE channels SET name=' ' WHERE id='sun-tv'" },
    { reason: 'invalid quality', sql: "UPDATE channels SET quality='8K' WHERE id='sun-tv'" },
    { reason: 'orphan alias', sql: "INSERT INTO channel_aliases VALUES ('missing','Ghost')" },
    { reason: 'orphan provider', sql: "UPDATE provider_channels SET provider_id='missing' WHERE number='1559'" },
    { reason: 'orphan channel', sql: "UPDATE provider_channels SET channel_id='missing' WHERE number='1559'" },
    { reason: 'empty number', sql: "UPDATE provider_channels SET number=' ' WHERE number='1559'" },
  ])('rejects $reason before replacing working bytes', async ({ sql }) => {
    const bytes = fixture(db => db.run(sql));
    await expect(
      TestBed.inject(SqlitePackReaderService).read(bytes, db => mapTvDatabase(db, descriptor)),
    ).rejects.toThrow();
    storage.getBytes.mockResolvedValue(fixture());
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(bytes)));
    await expect(TestBed.inject(PackInstallerService).install(descriptor)).rejects.toThrow();
    expect(storage.replace).not.toHaveBeenCalled();
  });
  it.each([
    { reason: 'invalid gzip', bytes: new Uint8Array([1, 2, 3]).buffer },
    { reason: 'invalid SQLite', bytes: Uint8Array.from(gzipSync(new Uint8Array([1, 2, 3]))).buffer },
  ])('retains the installed pack after $reason', async ({ bytes }) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(bytes)));
    await expect(TestBed.inject(PackInstallerService).install(descriptor)).rejects.toThrow(
      'Unable to read the offline pack',
    );
    expect(storage.replace).not.toHaveBeenCalled();
  });
  it('validates before replacement and loads installed bytes without fetch, caching by metadata', async () => {
    const bytes = fixture();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(bytes)));
    await TestBed.inject(PackInstallerService).install(descriptor);
    expect(storage.replace).toHaveBeenCalledWith(
      descriptor.id,
      bytes,
      expect.objectContaining({ type: 'tv', version: 1 }),
    );
    const fetch = vi.fn(() => {
      throw new Error('Network not allowed');
    });
    vi.stubGlobal('fetch', fetch);
    storage.installed.mockResolvedValue([installed]);
    storage.getBytes.mockResolvedValue(bytes);
    const repository = TestBed.inject(TvDatabaseRepositoryService);
    expect(await repository.installed()).toEqual([installed]);
    const first = await repository.load(installed);
    expect(await repository.load(installed)).toBe(first);
    expect(storage.getBytes).toHaveBeenCalledTimes(1);
    expect(await repository.load({ ...installed, installedAt: '2026-01-02' })).not.toBe(first);
    expect(storage.getBytes).toHaveBeenCalledTimes(2);
    expect(await repository.load({ ...installed, checksum: 'updated' })).not.toBe(first);
    expect(storage.getBytes).toHaveBeenCalledTimes(3);
    expect(fetch).not.toHaveBeenCalled();
  });
});
