import { TRAIN_DAYS, type TrainSchedule, type TrainStop, type UserTrain } from '../../shared/models/train.models';

export const MAX_TRAIN_STOPS = 10000;

export class TrainValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(issues[0] ?? 'Invalid train schedule.');
    this.name = 'TrainValidationError';
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function isTrainNumber(value: unknown): value is string {
  return typeof value === 'string' && /^\d{1,10}$/.test(value);
}

export function isTime(value: unknown): value is string {
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function timeMinutes(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
}

export function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.exec(
    value,
  );
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month - 1, day);
  return calendar.getUTCFullYear() === year && calendar.getUTCMonth() === month - 1 && calendar.getUTCDate() === day;
}

/** Validates untrusted backup/repository input and returns a fresh, ordered schedule. */
export function validateTrainSchedule(value: unknown): TrainSchedule {
  if (!isRecord(value)) throw new TrainValidationError(['Train schedule must be an object.']);
  const issues: string[] = [];
  const number = value['trainNumber'];
  if (!isTrainNumber(number)) issues.push('trainNumber must be 1–10 digits, stored as text.');
  const name = value['trainName'];
  if (name !== undefined && (typeof name !== 'string' || !name.trim() || name.length > 200)) {
    issues.push('trainName must be non-empty text of at most 200 characters, or omitted.');
  }
  const days = value['runningDays'];
  if (
    !Array.isArray(days) ||
    !days.length ||
    days.some(day => !TRAIN_DAYS.includes(day)) ||
    new Set(days).size !== days.length
  )
    issues.push('runningDays must contain unique MON–SUN values.');
  const inputStops = value['stops'];
  if (!Array.isArray(inputStops) || !inputStops.length || inputStops.length > MAX_TRAIN_STOPS) {
    issues.push(`A schedule needs 1–${MAX_TRAIN_STOPS} stops.`);
    throw new TrainValidationError(issues);
  }
  const stops: TrainStop[] = [];
  const sequences = new Set<number>();
  for (const [index, stop] of inputStops.entries()) {
    const prefix = `Stop ${index + 1}: `;
    if (!isRecord(stop)) {
      issues.push(prefix + 'must be an object.');
      continue;
    }
    const sequence = stop['sequence'];
    if (typeof sequence !== 'number' || !Number.isSafeInteger(sequence) || sequence <= 0) {
      issues.push(prefix + 'sequence must be a positive integer.');
    } else if (sequences.has(sequence)) issues.push(prefix + `duplicate sequence ${sequence}.`);
    else sequences.add(sequence);
    const stationName = stop['stationName'];
    if (typeof stationName !== 'string' || !stationName.trim() || stationName.length > 200) {
      issues.push(prefix + 'stationName is required (at most 200 characters).');
    }
    const code = stop['stationCode'];
    if (code !== undefined && (typeof code !== 'string' || !code.trim() || code.length > 30)) {
      issues.push(prefix + 'stationCode must be non-empty text (at most 30 characters), or omitted.');
    }
    const arrival = stop['arrivalTime'];
    const departure = stop['departureTime'];
    if (arrival !== undefined && !isTime(arrival)) issues.push(prefix + 'arrivalTime must use HH:mm (24-hour).');
    if (departure !== undefined && !isTime(departure)) issues.push(prefix + 'departureTime must use HH:mm (24-hour).');
    if (arrival === undefined && departure === undefined)
      issues.push(prefix + 'arrivalTime or departureTime is required.');
    if (isTime(arrival) && isTime(departure) && departure < arrival) {
      issues.push(prefix + 'departure must not precede arrival on the same day.');
    }
    const offset = stop['dayOffset'];
    if (typeof offset !== 'number' || !Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) {
      issues.push(prefix + 'dayOffset must be a non-negative integer (at most 1000000).');
    }
    // Only use these typed values after all field errors have been checked.
    stops.push({
      sequence: sequence as number,
      stationName: typeof stationName === 'string' ? stationName.trim() : '',
      stationCode: typeof code === 'string' ? code.trim() : undefined,
      arrivalTime: arrival as string | undefined,
      departureTime: departure as string | undefined,
      dayOffset: offset as number,
    });
  }
  if (issues.length) throw new TrainValidationError(issues);
  stops.sort((a, b) => a.sequence - b.sequence);
  let previous = -1;
  for (const stop of stops) {
    const first = timeMinutes((stop.arrivalTime ?? stop.departureTime)!);
    const start = stop.dayOffset * 1440 + first;
    if (start < previous) issues.push(`Stop sequence ${stop.sequence}: day offsets/times move backwards.`);
    previous = stop.dayOffset * 1440 + timeMinutes((stop.departureTime ?? stop.arrivalTime)!);
  }
  if (issues.length) throw new TrainValidationError(issues);
  return {
    trainNumber: number as string,
    trainName: typeof name === 'string' ? name.trim() : undefined,
    runningDays: TRAIN_DAYS.filter(day => (days as unknown[]).includes(day)),
    stops,
  };
}

export function validateUserTrain(value: unknown): UserTrain {
  const schedule = validateTrainSchedule(value);
  if (!isRecord(value) || !isIsoTimestamp(value['createdAt']) || !isIsoTimestamp(value['updatedAt'])) {
    throw new TrainValidationError(['Train createdAt and updatedAt must be ISO timestamps.']);
  }
  if (Date.parse(value['updatedAt']) < Date.parse(value['createdAt'])) {
    throw new TrainValidationError(['Train updatedAt must not precede createdAt.']);
  }
  return { ...schedule, createdAt: value['createdAt'], updatedAt: value['updatedAt'] };
}
