import Papa from 'papaparse';
import {
  TRAIN_DAYS,
  runningDaysMask,
  type TrainDay,
  type TrainSchedule,
  type TrainStop,
} from '../../shared/models/train.models';
import {
  isTime,
  isTrainNumber,
  MAX_TRAIN_STOPS,
  timeMinutes,
  TrainValidationError,
  validateTrainSchedule,
} from './train-validation';

export const MAX_TRAIN_CSV_BYTES = 2 * 1024 * 1024;
export const TRAIN_CSV_HEADERS = [
  'train_number',
  'train_name',
  'running_days',
  'stop_sequence',
  'station_code',
  'station_name',
  'arrival_time',
  'departure_time',
  'day_offset',
] as const;

const dayNames = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

export function parseRunningDays(value: string): TrainDay[] {
  const text = value.trim().toUpperCase();
  if (!text || text === 'DAILY') return [...TRAIN_DAYS];
  const days = new Set<TrainDay>();
  for (const token of text.split(/[|,]/).map(day => day.trim())) {
    const index = TRAIN_DAYS.findIndex((day, index) => day === token || dayNames[index] === token);
    if (index < 0)
      throw new TrainValidationError([`Unknown running day: ${token || '(empty)'}. Use DAILY or days separated by |.`]);
    days.add(TRAIN_DAYS[index]);
  }
  return TRAIN_DAYS.filter(day => days.has(day));
}

export function parseTrainCsv(text: string): TrainSchedule {
  if (new TextEncoder().encode(text).byteLength > MAX_TRAIN_CSV_BYTES) {
    throw new TrainValidationError(['CSV is too large. Choose a file of at most 2 MB.']);
  }
  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), { skipEmptyLines: 'greedy' });
  if (parsed.errors.length) {
    throw new TrainValidationError(parsed.errors.map(error => `Row ${(error.row ?? 0) + 1}: ${error.message}`));
  }
  const [header, ...rows] = parsed.data;
  if (!header || !rows.length) throw new TrainValidationError(['CSV needs a header and at least one station row.']);
  if (rows.length > MAX_TRAIN_STOPS)
    throw new TrainValidationError([`A CSV can contain at most ${MAX_TRAIN_STOPS} stops.`]);
  const headers = header.map(column => column.trim().toLowerCase());
  const headerIssues: string[] = [];
  if (new Set(headers).size !== headers.length) headerIssues.push('CSV contains duplicate column headers.');
  for (const column of headers) {
    if (!(TRAIN_CSV_HEADERS as readonly string[]).includes(column))
      headerIssues.push(`Unknown CSV column: ${column || '(blank)'}.`);
  }
  for (const required of ['train_number', 'station_name']) {
    if (!headers.includes(required)) headerIssues.push(`CSV is missing required column: ${required}.`);
  }
  if (!headers.includes('arrival_time') && !headers.includes('departure_time')) {
    headerIssues.push('CSV needs an arrival_time or departure_time column.');
  }
  if (headerIssues.length) throw new TrainValidationError(headerIssues);
  const cell = (row: string[], column: string) => (row[headers.indexOf(column)] ?? '').trim();
  const number = cell(rows[0], 'train_number');
  const issues: string[] = [];
  if (!isTrainNumber(number)) issues.push('Row 2: train_number is required and must contain 1–10 digits.');
  let name: string | undefined;
  let days: TrainDay[] = [...TRAIN_DAYS];
  try {
    days = parseRunningDays(cell(rows[0], 'running_days'));
  } catch (cause) {
    issues.push(`Row 2: ${cause instanceof Error ? cause.message : 'Invalid running_days.'}`);
  }
  const sequencesPresent = rows.map(row => !!cell(row, 'stop_sequence'));
  const offsetsPresent = rows.map(row => !!cell(row, 'day_offset'));
  const explicitSequences = sequencesPresent.some(Boolean);
  const explicitOffsets = offsetsPresent.some(Boolean);
  if (explicitSequences && !sequencesPresent.every(Boolean))
    issues.push('Provide stop_sequence on every row, or leave every value blank.');
  if (explicitOffsets && !offsetsPresent.every(Boolean))
    issues.push('Provide day_offset on every row, or leave every value blank.');
  const stops: TrainStop[] = [];
  const sequences = new Set<number>();
  for (const [index, row] of rows.entries()) {
    const prefix = `Row ${index + 2}: `;
    if (row.length !== headers.length) issues.push(prefix + `expected ${headers.length} fields, found ${row.length}.`);
    const rowNumber = cell(row, 'train_number');
    if (rowNumber && rowNumber !== number)
      issues.push(
        prefix + `conflicting train_number "${rowNumber}" (expected "${number}"). One CSV must represent one train.`,
      );
    const rowName = cell(row, 'train_name');
    if (rowName) {
      if (name && name !== rowName) issues.push(prefix + `conflicting train_name "${rowName}".`);
      name ??= rowName;
    }
    const rowDays = cell(row, 'running_days');
    if (index && rowDays) {
      try {
        if (runningDaysMask(parseRunningDays(rowDays)) !== runningDaysMask(days))
          issues.push(prefix + 'conflicting running_days definition.');
      } catch (cause) {
        issues.push(prefix + (cause instanceof Error ? cause.message : 'Invalid running_days.'));
      }
    }
    const sequenceText = cell(row, 'stop_sequence');
    const sequence = explicitSequences ? Number(sequenceText) : index + 1;
    if (explicitSequences && (!/^\d+$/.test(sequenceText) || !Number.isSafeInteger(sequence) || sequence <= 0)) {
      issues.push(prefix + 'stop_sequence must be a positive integer.');
    } else if (sequences.has(sequence)) issues.push(prefix + `duplicate stop_sequence ${sequence}.`);
    else sequences.add(sequence);
    const stationName = cell(row, 'station_name');
    if (!stationName) issues.push(prefix + 'station_name is required.');
    const arrival = cell(row, 'arrival_time') || undefined;
    const departure = cell(row, 'departure_time') || undefined;
    if (!arrival && !departure) issues.push(prefix + 'arrival_time or departure_time is required.');
    for (const [field, value] of [
      ['arrival_time', arrival],
      ['departure_time', departure],
    ]) {
      if (value && !isTime(value)) issues.push(prefix + `invalid ${field} "${value}". Use HH:mm (24-hour).`);
    }
    if (arrival && departure && isTime(arrival) && isTime(departure) && departure < arrival) {
      issues.push(prefix + 'departure_time must not precede arrival_time at the same stop.');
    }
    const offsetText = cell(row, 'day_offset');
    const offset = explicitOffsets ? Number(offsetText) : 0;
    if (explicitOffsets && (!/^\d+$/.test(offsetText) || !Number.isSafeInteger(offset) || offset > 1000000)) {
      issues.push(prefix + 'day_offset must be a non-negative integer.');
    }
    stops.push({
      sequence,
      stationName,
      stationCode: cell(row, 'station_code') || undefined,
      arrivalTime: arrival,
      departureTime: departure,
      dayOffset: offset,
    });
  }
  if (issues.length) throw new TrainValidationError(issues);
  stops.sort((a, b) => a.sequence - b.sequence);
  // A decrease between consecutive stops advances one day. A midnight dwell within
  // a single stop cannot be represented by one day_offset and is rejected above.
  let previousTime = -1;
  let day = 0;
  for (const stop of stops) {
    const first = timeMinutes((stop.arrivalTime ?? stop.departureTime)!);
    if (!explicitOffsets) {
      if (first < previousTime) day++;
      stop.dayOffset = day;
    }
    const last = timeMinutes((stop.departureTime ?? stop.arrivalTime)!);
    if (explicitOffsets && stop.dayOffset * 1440 + first < previousTime) {
      const row = rows.findIndex(
        (_, index) => (explicitSequences ? Number(cell(rows[index], 'stop_sequence')) : index + 1) === stop.sequence,
      );
      issues.push(`Row ${row + 2}: day_offset/times move backwards through the schedule.`);
    }
    previousTime = explicitOffsets ? stop.dayOffset * 1440 + last : last;
  }
  if (issues.length) throw new TrainValidationError(issues);
  return validateTrainSchedule({ trainNumber: number, trainName: name, runningDays: days, stops });
}

export function trainCsvTemplate(): string {
  return Papa.unparse({
    fields: [...TRAIN_CSV_HEADERS],
    data: [
      ['99999', 'Sample Express', '', '1', 'SMPA', 'Sample City A', '', '06:00', '0'],
      ['', '', '', '2', 'SMPB', 'Sample City B', '08:00', '08:05', '0'],
      ['', '', '', '3', 'SMPC', 'Sample City C', '00:30', '', '1'],
    ],
  });
}
