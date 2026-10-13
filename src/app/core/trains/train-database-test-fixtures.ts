import type { Database, SqlJsStatic } from 'sql.js';
import { prepareTrainSchema } from './train-schema';
import { runningDaysMask, type UserTrain } from '../../shared/models/train.models';
import { sampleTrain } from './train-test-fixtures';

/** Synthetic v1 SQLite files only; no real railway data. */
export function trainDatabaseFixture(
  engine: SqlJsStatic,
  trains: UserTrain[] = [sampleTrain()],
  change?: (database: Database) => void,
): ArrayBuffer {
  const database = new engine.Database();
  try {
    prepareTrainSchema(database, true);
    for (const train of trains) {
      database.run('INSERT INTO trains VALUES (?, ?, ?, ?, ?)', [
        train.trainNumber,
        train.trainName ?? null,
        runningDaysMask(train.runningDays),
        train.createdAt,
        train.updatedAt,
      ]);
      for (const stop of train.stops)
        database.run('INSERT INTO train_stops VALUES (?, ?, ?, ?, ?, ?, ?)', [
          train.trainNumber,
          stop.sequence,
          stop.stationCode ?? null,
          stop.stationName,
          stop.arrivalTime ?? null,
          stop.departureTime ?? null,
          stop.dayOffset,
        ]);
    }
    change?.(database);
    return Uint8Array.from(database.export()).buffer;
  } finally {
    database.close();
  }
}
