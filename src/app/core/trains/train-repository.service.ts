import { Service, inject, signal } from '@angular/core';
import { gzipSync, gunzipSync } from 'fflate';
import type { Database } from 'sql.js';
import { SqliteEngineService } from '../database/sqlite-engine.service';
import { queryRows } from '../database/sqlite-pack-reader.service';
import { TrainDataStorageService } from './train-data-storage.service';
import { openTrainBackup, validateTrainDatabase, MAX_TRAIN_BACKUP_BYTES } from './train-backup';
import { AppPlatformService } from '../platform/app-platform.service';
import { readUserTrain, trainMetadata, trainSqlInteger as integer } from './train-database';
import { validateTrainSchedule } from './train-validation';
import { prepareTrainSchema } from './train-schema';
import {
  runningDaysMask,
  type SavedTrainSummary,
  type TrainBackup,
  type TrainRestorePreview,
  type TrainSchedule,
  type UserTrain,
} from '../../shared/models/train.models';

export class TrainAlreadyExistsError extends Error {
  constructor(number: string) {
    super(`Train ${number} already exists. Choose Replace Schedule to overwrite it.`);
  }
}

/** Writable user data. Every operation opens its own DB; public packs stay query-only. */
@Service()
export class TrainRepositoryService {
  private readonly engine = inject(SqliteEngineService);
  private readonly platform = inject(AppPlatformService);
  private readonly storage = inject(TrainDataStorageService);
  private pending: Promise<void> = Promise.resolve();
  readonly changes = signal(0);
  readonly trainCount = signal<number | null>(null);
  readonly stateError = signal('');

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
    const generation = this.changes();
    try {
      const count = await this.read(database =>
        integer(queryRows(database, 'SELECT COUNT(*) AS count FROM trains')[0]['count']),
      );
      if (generation !== this.changes()) return this.count();
      this.trainCount.set(count);
      this.stateError.set('');
      return count;
    } catch (cause) {
      this.stateError.set(cause instanceof Error ? cause.message : 'Unable to read saved train data.');
      throw cause;
    }
  }

  async get(number: string): Promise<UserTrain | undefined> {
    return this.read(database => readUserTrain(database, number));
  }

  async importTrain(input: TrainSchedule, replace = false): Promise<void> {
    if (!this.platform.isWeb())
      throw new Error(
        'Creating train schedules from CSV is available only on Web/PWA. Restore a Train backup from Settings.',
      );
    const schedule = validateTrainSchedule(input);
    await this.write(database => {
      const old = readUserTrain(database, schedule.trainNumber);
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
      validateTrainDatabase(database);
      const exportedAt = new Date().toISOString();
      database.run(
        "INSERT OR REPLACE INTO metadata (key, value) VALUES ('format', 'metropocket-user-trains'), ('exportedAt', ?)",
        [exportedAt],
      );
      const summary = validateTrainDatabase(database);
      const bytes = Uint8Array.from(database.export()).buffer;
      if (bytes.byteLength > MAX_TRAIN_BACKUP_BYTES)
        throw new Error('The Train database exceeds the supported 20 MB backup size.');
      return { ...summary, bytes };
    });
  }

  async previewBackup(bytes: ArrayBuffer): Promise<TrainRestorePreview> {
    await this.pending;
    const copy = Uint8Array.from(new Uint8Array(bytes)).buffer;
    const engine = await this.engine.initialize();
    const candidate = openTrainBackup(engine, copy);
    try {
      const snapshot = await this.storage.load();
      const current = await this.open(snapshot?.bytes);
      try {
        return {
          ...candidate.summary,
          bytes: copy,
          currentCount: integer(queryRows(current, 'SELECT COUNT(*) AS count FROM trains')[0]['count']),
          currentRevision: snapshot?.revision ?? 0,
        };
      } finally {
        current.close();
      }
    } finally {
      candidate.database.close();
    }
  }

  async restoreBackup(preview: TrainRestorePreview): Promise<void> {
    await this.enqueue(async () => {
      const snapshot = await this.storage.load();
      if ((snapshot?.revision ?? 0) !== preview.currentRevision)
        throw new Error('Train data changed after this preview. Choose the backup again before replacing it.');
      const engine = await this.engine.initialize();
      const candidate = openTrainBackup(engine, preview.bytes);
      try {
        if (candidate.summary.trainCount !== preview.trainCount || candidate.summary.stopCount !== preview.stopCount)
          throw new Error('The backup changed after preview. Choose it again.');
        const bytes = Uint8Array.from(gzipSync(candidate.database.export())).buffer;
        await this.storage.save(bytes, preview.currentRevision, stored => {
          const reopened = openTrainBackup(engine, Uint8Array.from(gunzipSync(new Uint8Array(stored))).buffer);
          try {
            if (
              reopened.summary.trainCount !== candidate.summary.trainCount ||
              reopened.summary.stopCount !== candidate.summary.stopCount
            )
              throw new Error('Restored Train data did not match the preview.');
          } finally {
            reopened.database.close();
          }
        });
        // IDB commits only after the stored bytes reopen and validate successfully.
        this.trainCount.set(candidate.summary.trainCount);
        this.stateError.set('');
        this.changes.update(value => value + 1);
      } finally {
        candidate.database.close();
      }
    });
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
    return this.enqueue(async () => {
      const snapshot = await this.storage.load();
      const database = await this.open(snapshot?.bytes);
      try {
        database.run('BEGIN IMMEDIATE');
        mutate(database);
        database.run('COMMIT');
        // The candidate is disposable. A failed IDB commit leaves durable old bytes
        // untouched, and subsequent reads reopen those old bytes rather than this DB.
        const count = integer(queryRows(database, 'SELECT COUNT(*) AS count FROM trains')[0]['count']);
        const bytes = Uint8Array.from(gzipSync(database.export())).buffer;
        await this.storage.save(bytes, snapshot?.revision ?? 0);
        this.trainCount.set(count);
        this.stateError.set('');
        this.changes.update(value => value + 1);
      } finally {
        database.close();
      }
    });
  }

  private enqueue(action: () => Promise<void>): Promise<void> {
    const operation = this.pending.then(action);
    this.pending = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }
}
