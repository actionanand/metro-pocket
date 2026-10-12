import { Injectable, inject } from '@angular/core';
import type { Database, SqlValue } from 'sql.js';
import { PackStorageService } from '../data-packs/pack-storage.service';
import { SqlitePackReaderService, queryRows } from './sqlite-pack-reader.service';
import type { InstalledPack } from '../../shared/models/data-pack.models';
import type { MetroNetwork, OperationalStatus } from '../../shared/models/metro.models';

const requiredTables = [
  'metadata',
  'stations',
  'station_aliases',
  'station_codes',
  'lines',
  'station_lines',
  'connections',
  'interchanges',
];
const text = (value: SqlValue | undefined): string => {
  if (typeof value !== 'string' || !value.trim()) throw new Error('A required database text value is missing.');
  return value;
};
const number = (value: SqlValue | undefined): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    throw new Error('Invalid database numeric value.');
  return value;
};
const optionalMinutes = (value: SqlValue | undefined): number | undefined =>
  value === null ? undefined : number(value);
const status = (value: SqlValue | undefined): OperationalStatus => {
  if (
    value === 'operational' ||
    value === 'under-construction' ||
    value === 'planned' ||
    value === 'temporarily-closed'
  )
    return value;
  throw new Error('Unsupported station, line or connection status.');
};

export function mapMetroDatabase(database: Database, expected: { id: string; version: number }): MetroNetwork {
  const tables = new Set(
    queryRows(database, "SELECT name FROM sqlite_master WHERE type = 'table'").map(row => row['name']),
  );
  for (const table of requiredTables)
    if (!tables.has(table)) throw new Error(`Required metro table is missing: ${table}.`);
  const metadata = new Map(
    queryRows(database, 'SELECT key, value FROM metadata').map(row => [text(row['key']), text(row['value'])]),
  );
  if (
    metadata.get('schemaVersion') !== '1' ||
    metadata.get('type') !== 'metro' ||
    metadata.get('packId') !== expected.id ||
    metadata.get('version') !== String(expected.version)
  ) {
    throw new Error('Metro pack metadata does not match its expected identity, version or schema.');
  }
  const grouped = (table: 'station_aliases' | 'station_codes', column: 'alias' | 'code') => {
    const result = new Map<string, string[]>();
    for (const row of queryRows(database, `SELECT station_id, ${column} FROM ${table}`)) {
      const id = text(row['station_id']);
      result.set(id, [...(result.get(id) ?? []), text(row[column])]);
    }
    return result;
  };
  const aliases = grouped('station_aliases', 'alias');
  const codes = grouped('station_codes', 'code');
  const stations = queryRows(database, 'SELECT id, name, status FROM stations').map(row => ({
    id: text(row['id']),
    name: text(row['name']),
    status: status(row['status']),
    aliases: aliases.get(text(row['id'])) ?? [],
    codes: codes.get(text(row['id'])) ?? [],
  }));
  const lines = queryRows(
    database,
    'SELECT id, name, color, status, terminal_a_station_id, terminal_b_station_id FROM lines',
  ).map(row => ({
    id: text(row['id']),
    name: text(row['name']),
    color: text(row['color']),
    status: status(row['status']),
    terminals: [row['terminal_a_station_id'], row['terminal_b_station_id']]
      .filter(value => value !== null)
      .map(value => text(value)),
  }));
  const stationLines = queryRows(
    database,
    'SELECT station_id, line_id, sequence FROM station_lines ORDER BY line_id, sequence',
  ).map(row => ({
    stationId: text(row['station_id']),
    lineId: text(row['line_id']),
    sequence: number(row['sequence']),
  }));
  const connections = queryRows(
    database,
    'SELECT from_station_id, to_station_id, line_id, travel_minutes, status, bidirectional FROM connections',
  ).map(row => {
    if (row['bidirectional'] !== 0 && row['bidirectional'] !== 1) throw new Error('Invalid connection direction flag.');
    return {
      from: text(row['from_station_id']),
      to: text(row['to_station_id']),
      lineId: text(row['line_id']),
      minutes: optionalMinutes(row['travel_minutes']),
      status: status(row['status']),
      bidirectional: row['bidirectional'] === 1,
    };
  });
  const interchanges = queryRows(
    database,
    'SELECT station_id, from_line_id, to_line_id, walk_minutes FROM interchanges',
  ).map(row => ({
    stationId: text(row['station_id']),
    fromLineId: text(row['from_line_id']),
    toLineId: text(row['to_line_id']),
    minutes: optionalMinutes(row['walk_minutes']),
  }));
  const stationIds = new Set(stations.map(station => station.id));
  const lineIds = new Set(lines.map(line => line.id));
  if (stationIds.size !== stations.length || lineIds.size !== lines.length || !stations.length || !lines.length)
    throw new Error('Metro pack contains missing or duplicate stations/lines.');
  if ([...aliases.keys(), ...codes.keys()].some(id => !stationIds.has(id)))
    throw new Error('Metro pack contains invalid station alias/code references.');
  if (
    lines.some(line => line.terminals.some(id => !stationIds.has(id))) ||
    stationLines.some(item => !stationIds.has(item.stationId) || !lineIds.has(item.lineId)) ||
    connections.some(edge => !stationIds.has(edge.from) || !stationIds.has(edge.to) || !lineIds.has(edge.lineId)) ||
    interchanges.some(
      item => !stationIds.has(item.stationId) || !lineIds.has(item.fromLineId) || !lineIds.has(item.toLineId),
    )
  )
    throw new Error('Metro pack contains invalid station/line references.');
  for (const line of lines) {
    const memberships = stationLines.filter(item => item.lineId === line.id);
    if (
      new Set(memberships.map(item => item.stationId)).size !== memberships.length ||
      new Set(memberships.map(item => item.sequence)).size !== memberships.length ||
      memberships.some(item => !Number.isInteger(item.sequence))
    )
      throw new Error('Invalid or duplicate station line sequence.');
    if (line.terminals.some(id => !memberships.some(item => item.stationId === id)))
      throw new Error('Line terminal sequence is missing.');
  }
  if (
    connections.some(
      edge =>
        !stationLines.some(item => item.stationId === edge.from && item.lineId === edge.lineId) ||
        !stationLines.some(item => item.stationId === edge.to && item.lineId === edge.lineId),
    )
  )
    throw new Error('Connection line membership is missing.');
  const defaultValue = metadata.get('defaultEdgeMinutes');
  return {
    city: text(metadata.get('city')),
    networkAsOf: text(metadata.get('networkAsOf')),
    defaultEdgeMinutes: defaultValue === undefined ? undefined : number(Number(defaultValue)),
    stations,
    lines,
    stationLines,
    connections,
    interchanges,
  };
}

@Injectable({ providedIn: 'root' })
export class MetroNetworkRepositoryService {
  private readonly storage = inject(PackStorageService);
  private readonly reader = inject(SqlitePackReaderService);
  private cache?: { key: string; network: MetroNetwork };

  async installed(): Promise<InstalledPack[]> {
    return (await this.storage.installed()).filter(pack => pack.type === 'metro');
  }
  async load(pack: InstalledPack): Promise<MetroNetwork> {
    const key = `${pack.id}:${pack.version}:${pack.installedAt}:${pack.checksum ?? ''}`;
    if (this.cache?.key === key) return this.cache.network;
    this.cache = undefined;
    const bytes = await this.storage.getBytes(pack.id);
    if (!bytes) throw new Error('Installed metro pack bytes are missing. Reinstall it from Offline Data.');
    const network = await this.reader.read(bytes, db => mapMetroDatabase(db, pack));
    this.cache = { key, network };
    return network;
  }
}
