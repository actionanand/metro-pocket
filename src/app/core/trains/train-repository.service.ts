import { Service, inject, signal } from '@angular/core';
import { gzipSync, gunzipSync } from 'fflate';
import type { Database, SqlValue } from 'sql.js';
import { SqliteEngineService } from '../database/sqlite-engine.service';
import { queryRows } from '../database/sqlite-pack-reader.service';
import { TrainDataStorageService } from './train-data-storage.service';
import { createTrainBackup, validateTrainBackup } from './train-backup';
import { validateTrainSchedule } from './train-validation';
import { prepareTrainSchema } from './train-schema';
import {
  daysFromMask,
  runningDaysMask,
  type SavedTrainSummary,
  type TrainBackup,
  type TrainRestoreMode,
  type TrainSchedule,
  type UserTrain,
} from '../../shared/models/train.models';

export class TrainAlreadyExistsError extends Error {
  constructor(number: string) {
    super(`Train ${number} already exists. Choose Replace Schedule to overwrite it.`);
  }
}

function text(value: SqlValue | undefined): string {
  if (typeof value !== 'string') throw new Error('Saved train data contains an invalid text value.');
  return value;
}

function integer(value: SqlValue | undefined): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value))
    throw new Error('Saved train data contains an invalid integer.');
  return value;
}

function optionalText(value: SqlValue | undefined): string | undefined {
  return value === null ? undefined : text(value);
}

function trainMetadata(row: Record<string, SqlValue>): Omit<UserTrain, 'stops'> {
  const mask = integer(row['running_days_mask']);
  if (mask < 1 || mask > 127) throw new Error('Saved train running days are invalid.');
  return {
    trainNumber: text(row['train_number']),
    trainName: optionalText(row['train_name']),
    runningDays: daysFromMask(mask),
    createdAt: text(row['created_at']),
    updatedAt: text(row['updated_at']),
  };
}

/** Writable user data. Every operation opens its own DB; public packs stay query-only. */
@Service()
export class TrainRepositoryService {
  private readonly engine = inject(SqliteEngineService);
  private readonly storage = inject(TrainDataStorageService);
  private pending: Promise<void> = Promise.resolve();
  readonly changes = signal(0);

  async list(search = ''): Promise<SavedTrainSummary[]> {
    const pattern = `%${search.trim().replace(/[\\%_]/g, character => '\\' + character)}%`;
    return this.read(database =>
      queryRows(
        database,
        `
      SELECT t.train_number, t.train_name, t.running_days_mask, t.created_at, t.updated_at,
        (SELECT COUNT(*) FROM train_stops s WHERE s.train_number = t.train_number) AS stop_count
      FROM trains t
      WHERE t.train_number LIKE ? ESCAPE '\\' OR t.train_name LIKE ? ESCAPE '\\'
        OR EXISTS (SELECT 1 FROM train_stops s WHERE s.train_number = t.train_number
          AND (s.station_name LIKE ? ESCAPE '\\' OR s.station_code LIKE ? ESCAPE '\\'))
      ORDER BY t.train_number COLLATE NOCASE
    `,
        [pattern, pattern, pattern, pattern],
      ).map(row => ({ ...trainMetadata(row), stopCount: integer(row['stop_count']) })),
    );
  }

  async count(): Promise<number> {
    return this.read(database => integer(queryRows(database, 'SELECT COUNT(*) AS count FROM trains')[0]['count']));
  }

  async get(number: string): Promise<UserTrain | undefined> {
    return this.read(database => this.getTrain(database, number));
  }

  async importTrain(input: TrainSchedule, replace = false): Promise<void> {
    const schedule = validateTrainSchedule(input);
    await this.write(database => {
      const old = this.getTrain(database, schedule.trainNumber);
      if (old && !replace) throw new TrainAlreadyExistsError(schedule.trainNumber);
      const now = new Date(
        Math.max(Date.now(), Date.parse(old?.createdAt ?? '') || 0, Date.parse(old?.updatedAt ?? '') || 0),
      ).toISOString();
      this.insert(database, { ...schedule, createdAt: old?.createdAt ?? now, updatedAt: now });
    });
  }

  async deleteTrain(number: string): Promise<void> {
    await this.write(database => database.run('DELETE FROM trains WHERE train_number = ?', [number]));
  }

  async deleteAll(): Promise<void> {
    await this.write(database => database.run('DELETE FROM trains'));
  }

  async exportBackup(): Promise<TrainBackup> {
    return this.read(database => {
      const numbers = queryRows(database, 'SELECT train_number FROM trains ORDER BY train_number');
      return createTrainBackup(numbers.map(row => this.getTrain(database, text(row['train_number']))!));
    });
  }

  async previewBackup(backup: TrainBackup): Promise<{ existing: number; added: number }> {
    const valid = validateTrainBackup(backup);
    return this.read(database => {
      const numbers = new Set(
        queryRows(database, 'SELECT train_number FROM trains').map(row => text(row['train_number'])),
      );
      const existing = valid.trains.filter(train => numbers.has(train.trainNumber)).length;
      return { existing, added: valid.trains.length - existing };
    });
  }

  async restoreBackup(input: TrainBackup, mode: TrainRestoreMode): Promise<void> {
    const backup = validateTrainBackup(input);
    if (mode !== 'merge' && mode !== 'replace-all') throw new Error('Choose Merge or Replace all train data.');
    await this.write(database => {
      if (mode === 'replace-all') database.run('DELETE FROM trains');
      for (const train of backup.trains) this.insert(database, train);
    });
  }

  private getTrain(database: Database, number: string): UserTrain | undefined {
    const row = queryRows(
      database,
      'SELECT train_number, train_name, running_days_mask, created_at, updated_at FROM trains WHERE train_number = ?',
      [number],
    )[0];
    if (!row) return undefined;
    const stops = queryRows(
      database,
      `SELECT stop_sequence, station_code, station_name, arrival_time,
      departure_time, day_offset FROM train_stops WHERE train_number = ? ORDER BY stop_sequence`,
      [number],
    ).map(stop => ({
      sequence: integer(stop['stop_sequence']),
      stationCode: optionalText(stop['station_code']),
      stationName: text(stop['station_name']),
      arrivalTime: optionalText(stop['arrival_time']),
      departureTime: optionalText(stop['departure_time']),
      dayOffset: integer(stop['day_offset']),
    }));
    return { ...trainMetadata(row), stops };
  }

  private insert(database: Database, train: UserTrain): void {
    database.run('DELETE FROM trains WHERE train_number = ?', [train.trainNumber]);
    database.run(
      'INSERT INTO trains (train_number, train_name, running_days_mask, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [
        train.trainNumber,
        train.trainName ?? null,
        runningDaysMask(train.runningDays),
        train.createdAt,
        train.updatedAt,
      ],
    );
    const statement = database.prepare(`INSERT INTO train_stops (train_number, stop_sequence, station_code,
      station_name, arrival_time, departure_time, day_offset) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    try {
      for (const stop of train.stops)
        statement.run([
          train.trainNumber,
          stop.sequence,
          stop.stationCode ?? null,
          stop.stationName,
          stop.arrivalTime ?? null,
          stop.departureTime ?? null,
          stop.dayOffset,
        ]);
    } finally {
      statement.free();
    }
  }

  private async open(bytes?: ArrayBuffer): Promise<Database> {
    const engine = await this.engine.initialize();
    let database: Database | undefined;
    try {
      if (bytes) {
        const raw = gunzipSync(new Uint8Array(bytes));
        if (new TextDecoder().decode(raw.subarray(0, 16)) !== 'SQLite format 3\0')
          throw new Error('Invalid SQLite train database.');
        database = new engine.Database(raw);
      } else database = new engine.Database();
      prepareTrainSchema(database, !bytes);
      return database;
    } catch (cause) {
      database?.close();
      throw new Error(
        `${cause instanceof Error ? cause.message : 'Unable to open saved trains.'} Your saved data has not been changed.`,
      );
    }
  }

  private async read<T>(consume: (database: Database) => T): Promise<T> {
    await this.pending;
    const snapshot = await this.storage.load();
    const database = await this.open(snapshot?.bytes);
    try {
      return consume(database);
    } finally {
      database.close();
    }
  }

  private write(mutate: (database: Database) => unknown): Promise<void> {
    const operation = this.pending.then(async () => {
      const snapshot = await this.storage.load();
      const database = await this.open(snapshot?.bytes);
      try {
        database.run('BEGIN IMMEDIATE');
        mutate(database);
        database.run('COMMIT');
        // The candidate is disposable. A failed IDB commit leaves durable old bytes
        // untouched, and subsequent reads reopen those old bytes rather than this DB.
        const bytes = Uint8Array.from(gzipSync(database.export())).buffer;
        await this.storage.save(bytes, snapshot?.revision ?? 0);
        this.changes.update(value => value + 1);
      } finally {
        database.close();
      }
    });
    this.pending = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }
}
