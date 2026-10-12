import { Injectable, inject } from '@angular/core';
import type { Database, SqlValue } from 'sql.js';
import { PackStorageService } from '../data-packs/pack-storage.service';
import type { InstalledPack } from '../../shared/models/data-pack.models';
import type { TvChannel, TvDatabase, TvProviderKind } from '../../shared/models/tv.models';
import { queryRows, SqlitePackReaderService } from './sqlite-pack-reader.service';

const requiredTables = ['metadata', 'providers', 'channels', 'channel_aliases', 'provider_channels'];

function requiredText(value: SqlValue | undefined): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('A required TV database text value is missing.');
  return value.trim();
}

function optionalText(value: SqlValue | undefined): string | undefined {
  if (value === null) return undefined;
  if (typeof value !== 'string') throw new Error('A TV database text value is invalid.');
  return value.trim() || undefined;
}

function providerKind(value: SqlValue | undefined): TvProviderKind {
  if (value === 'dth' || value === 'cable' || value === 'iptv') return value;
  throw new Error('Unsupported TV provider kind.');
}

function quality(value: SqlValue | undefined): TvChannel['quality'] {
  if (value === null) return undefined;
  if (value === 'SD' || value === 'HD' || value === '4K') return value;
  throw new Error('Unsupported TV channel quality.');
}

export function mapTvDatabase(
  database: Database,
  expected: { id: string; version: number; schemaVersion: number },
): TvDatabase {
  const tables = new Set(
    queryRows(database, "SELECT name FROM sqlite_master WHERE type = 'table'").map(row => row['name']),
  );
  for (const table of requiredTables)
    if (!tables.has(table)) throw new Error(`Required TV table is missing: ${table}.`);

  const metadata = new Map(
    queryRows(database, 'SELECT key, value FROM metadata').map(row => [
      requiredText(row['key']),
      requiredText(row['value']),
    ]),
  );
  if (
    metadata.get('schemaVersion') !== String(expected.schemaVersion) ||
    metadata.get('schemaVersion') !== '1' ||
    metadata.get('type') !== 'tv' ||
    metadata.get('packId') !== expected.id ||
    metadata.get('version') !== String(expected.version)
  )
    throw new Error('TV pack metadata does not match its expected identity, version or schema.');

  const providers = queryRows(database, 'SELECT id, name, kind FROM providers').map(row => ({
    id: requiredText(row['id']),
    name: requiredText(row['name']),
    kind: providerKind(row['kind']),
  }));
  const aliases = new Map<string, string[]>();
  for (const row of queryRows(database, 'SELECT channel_id, alias FROM channel_aliases')) {
    const id = requiredText(row['channel_id']);
    aliases.set(id, [...(aliases.get(id) ?? []), requiredText(row['alias'])]);
  }
  const channels = queryRows(database, 'SELECT id, name, language, genre, quality FROM channels').map(row => {
    const id = requiredText(row['id']);
    return {
      id,
      name: requiredText(row['name']),
      aliases: aliases.get(id) ?? [],
      language: optionalText(row['language']),
      genre: optionalText(row['genre']),
      quality: quality(row['quality']),
    };
  });
  const mappings = queryRows(
    database,
    'SELECT provider_id, channel_id, number, country, state, city, area, revision, verified_at FROM provider_channels',
  ).map(row => ({
    providerId: requiredText(row['provider_id']),
    channelId: requiredText(row['channel_id']),
    number: requiredText(row['number']),
    country: optionalText(row['country']),
    state: optionalText(row['state']),
    city: optionalText(row['city']),
    area: optionalText(row['area']),
    revision: optionalText(row['revision']),
    verifiedAt: optionalText(row['verified_at']),
  }));
  const providerIds = new Set(providers.map(provider => provider.id));
  const channelIds = new Set(channels.map(channel => channel.id));
  if (
    !providers.length ||
    !channels.length ||
    !mappings.length ||
    providerIds.size !== providers.length ||
    channelIds.size !== channels.length
  )
    throw new Error('TV pack contains missing or duplicate providers/channels/mappings.');
  if ([...aliases.keys()].some(id => !channelIds.has(id)))
    throw new Error('TV pack contains invalid channel alias references.');
  if (mappings.some(mapping => !providerIds.has(mapping.providerId) || !channelIds.has(mapping.channelId)))
    throw new Error('TV pack contains invalid provider/channel mapping references.');
  return { providers, channels, mappings };
}

@Injectable({ providedIn: 'root' })
export class TvDatabaseRepositoryService {
  private readonly storage = inject(PackStorageService);
  private readonly reader = inject(SqlitePackReaderService);
  private cache?: { key: string; database: TvDatabase };

  async installed(): Promise<InstalledPack[]> {
    return (await this.storage.installed()).filter(pack => pack.type === 'tv');
  }

  async load(pack: InstalledPack): Promise<TvDatabase> {
    const key = `${pack.id}:${pack.version}:${pack.schemaVersion}:${pack.installedAt}:${pack.checksum ?? ''}`;
    if (this.cache?.key === key) return this.cache.database;
    this.cache = undefined;
    const bytes = await this.storage.getBytes(pack.id);
    if (!bytes) throw new Error('Installed TV pack bytes are missing. Reinstall it from Offline Data.');
    const database = await this.reader.read(bytes, db => mapTvDatabase(db, pack));
    this.cache = { key, database };
    return database;
  }
}
