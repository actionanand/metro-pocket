import { TRAIN_DAYS, type UserTrain } from '../../shared/models/train.models';

/** Fictional data shared only by tests. */
export function sampleTrain(trainNumber = '00123', trainName: string | undefined = 'Sample Express'): UserTrain {
  return {
    trainNumber,
    trainName,
    runningDays: [...TRAIN_DAYS],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    stops: [
      { sequence: 1, stationCode: 'SMPA', stationName: 'Sample City A', departureTime: '23:50', dayOffset: 0 },
      {
        sequence: 2,
        stationCode: 'SMPB',
        stationName: 'Sample City B',
        arrivalTime: '00:10',
        departureTime: '00:15',
        dayOffset: 1,
      },
      { sequence: 3, stationName: 'Sample City C', arrivalTime: '03:00', dayOffset: 1 },
    ],
  };
}

export function textFile(text: string, name = 'train.csv'): File {
  const file = new File([text], name);
  // jsdom File lacks Blob.text(); browsers use the native method.
  Object.defineProperty(file, 'text', { configurable: true, value: () => Promise.resolve(text) });
  return file;
}
