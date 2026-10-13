import type { TrainBackup, UserTrain } from '../../shared/models/train.models';
import { isIsoTimestamp, isRecord, TrainValidationError, validateUserTrain } from './train-validation';

export const MAX_TRAIN_BACKUP_BYTES = 20 * 1024 * 1024;

export function validateTrainBackup(value: unknown): TrainBackup {
  if (!isRecord(value) || value['format'] !== 'metropocket-trains') {
    throw new TrainValidationError(['This is not a MetroPocket train backup.']);
  }
  if (value['schemaVersion'] !== 1)
    throw new TrainValidationError(['This train backup schema version is not supported.']);
  if (!isIsoTimestamp(value['exportedAt']))
    throw new TrainValidationError(['Backup exportedAt must be an ISO timestamp.']);
  const input = value['trains'];
  if (!Array.isArray(input)) throw new TrainValidationError(['Backup trains must be an array.']);
  const trains: UserTrain[] = [];
  const numbers = new Set<string>();
  const issues: string[] = [];
  for (const [index, value] of input.entries()) {
    try {
      const train = validateUserTrain(value);
      if (numbers.has(train.trainNumber))
        issues.push(`Train ${index + 1}: duplicate train number ${train.trainNumber}.`);
      numbers.add(train.trainNumber);
      trains.push(train);
    } catch (cause) {
      const errors = cause instanceof TrainValidationError ? cause.issues : ['Invalid train.'];
      issues.push(...errors.map(error => `Train ${index + 1}: ${error}`));
    }
  }
  if (issues.length) throw new TrainValidationError(issues);
  return { format: 'metropocket-trains', schemaVersion: 1, exportedAt: value['exportedAt'], trains };
}

export function parseTrainBackup(text: string): TrainBackup {
  if (new TextEncoder().encode(text).byteLength > MAX_TRAIN_BACKUP_BYTES) {
    throw new TrainValidationError(['Backup is too large. Choose a file of at most 20 MB.']);
  }
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    throw new TrainValidationError(['The backup is not valid JSON.']);
  }
  return validateTrainBackup(value);
}

export function createTrainBackup(trains: UserTrain[], exportedAt = new Date().toISOString()): TrainBackup {
  return validateTrainBackup({ format: 'metropocket-trains', schemaVersion: 1, exportedAt, trains });
}
