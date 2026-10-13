import { createTrainBackup, parseTrainBackup, validateTrainBackup, MAX_TRAIN_BACKUP_BYTES } from './train-backup';
import { sampleTrain } from './train-test-fixtures';

describe('Train JSON backups', () => {
  it('round-trips version, optional name, daily days, timestamps and every stop', () => {
    const train = sampleTrain();
    delete train.trainName;
    const backup = createTrainBackup([train], '2026-10-13T12:00:00.000Z');
    expect(backup.format).toBe('metropocket-trains');
    expect(backup.schemaVersion).toBe(1);
    expect(JSON.stringify(backup)).not.toContain('trainName');
    expect(parseTrainBackup(JSON.stringify(backup))).toEqual(backup);
    expect(backup.trains[0].stops).toHaveLength(3);
    expect(backup.trains[0].runningDays).toHaveLength(7);
  });
  it('allows an empty backup for explicit replace-all clearing', () =>
    expect(parseTrainBackup(JSON.stringify(createTrainBackup([]))).trains).toEqual([]));
  it('rejects invalid JSON', () => expect(() => parseTrainBackup('{broken')).toThrow('not valid JSON'));
  it('rejects an oversized backup', () =>
    expect(() => parseTrainBackup('x'.repeat(MAX_TRAIN_BACKUP_BYTES + 1))).toThrow('at most 20 MB'));
  it.each([
    [{ format: 'other' }, 'not a MetroPocket'],
    [{ schemaVersion: 2 }, 'schema version is not supported'],
    [{ exportedAt: 'yesterday' }, 'ISO timestamp'],
    [{ exportedAt: '2026-02-30T12:00:00.000Z' }, 'ISO timestamp'],
    [{ trains: {} }, 'must be an array'],
  ])('validates backup envelope', (change, message) =>
    expect(() => validateTrainBackup({ ...createTrainBackup([]), ...change })).toThrow(message),
  );
  it('rejects duplicate train numbers', () =>
    expect(() => createTrainBackup([sampleTrain(), sampleTrain()])).toThrow('duplicate train number'));
  it.each([
    [{ trainNumber: 123 }, 'stored as text'],
    [{ trainNumber: 'bad' }, 'stored as text'],
    [{ runningDays: ['FUNDAY'] }, 'MON–SUN'],
    [{ runningDays: ['MON', 'MON'] }, 'unique'],
    [{ trainName: 123 }, 'trainName'],
    [{ createdAt: 'bad' }, 'ISO timestamps'],
    [{ updatedAt: '2025-01-01T00:00:00.000Z' }, 'must not precede'],
    [{ stops: [] }, 'schedule needs'],
  ])('rejects malformed trains', (change, message) => {
    const backup = { ...createTrainBackup([]), trains: [{ ...sampleTrain(), ...change }] };
    expect(() => validateTrainBackup(backup)).toThrow(message);
  });
  it.each([
    [{ sequence: 0 }, 'positive integer'],
    [{ stationName: '' }, 'stationName is required'],
    [{ stationName: 123 }, 'stationName is required'],
    [{ arrivalTime: '7pm' }, 'HH:mm'],
    [{ departureTime: undefined, arrivalTime: undefined }, 'arrivalTime or departureTime'],
    [{ dayOffset: -1 }, 'non-negative'],
    [{ arrivalTime: '23:55', departureTime: '00:05' }, 'must not precede'],
  ])('rejects malformed stops', (change, message) => {
    const train = sampleTrain();
    const backup = { ...createTrainBackup([]), trains: [{ ...train, stops: [{ ...train.stops[0], ...change }] }] };
    expect(() => validateTrainBackup(backup)).toThrow(message);
  });
  it('rejects duplicate stop sequences and backwards offset chronology', () => {
    const train = sampleTrain();
    expect(() => createTrainBackup([{ ...train, stops: [train.stops[0], train.stops[0]] }])).toThrow(
      'duplicate sequence',
    );
    expect(() =>
      createTrainBackup([{ ...train, stops: [train.stops[0], { ...train.stops[1], dayOffset: 0 }] }]),
    ).toThrow('move backwards');
  });
});
