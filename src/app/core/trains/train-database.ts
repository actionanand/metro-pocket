import type { Database, SqlValue } from 'sql.js';
import { queryRows } from '../database/sqlite-pack-reader.service';
import { daysFromMask, type UserTrain } from '../../shared/models/train.models';

export function trainSqlText(value: SqlValue | undefined): string {
  if (typeof value !== 'string') throw new Error('Saved train data contains an invalid text value.');
  return value;
}

export function trainSqlInteger(value: SqlValue | undefined): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value))
    throw new Error('Saved train data contains an invalid integer.');
  return value;
}

function optionalText(value: SqlValue | undefined): string | undefined {
  return value === null ? undefined : trainSqlText(value);
}

export function trainMetadata(row: Record<string, SqlValue>): Omit<UserTrain, 'stops'> {
  const mask = trainSqlInteger(row['running_days_mask']);
  if (mask < 1 || mask > 127) throw new Error('Saved train running days are invalid.');
  return {
    trainNumber: trainSqlText(row['train_number']),
    trainName: optionalText(row['train_name']),
    runningDays: daysFromMask(mask),
    createdAt: trainSqlText(row['created_at']),
    updatedAt: trainSqlText(row['updated_at']),
  };
}

export function readUserTrain(database: Database, number: string): UserTrain | undefined {
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
    sequence: trainSqlInteger(stop['stop_sequence']),
    stationCode: optionalText(stop['station_code']),
    stationName: trainSqlText(stop['station_name']),
    arrivalTime: optionalText(stop['arrival_time']),
    departureTime: optionalText(stop['departure_time']),
    dayOffset: trainSqlInteger(stop['day_offset']),
  }));
  return { ...trainMetadata(row), stops };
}
