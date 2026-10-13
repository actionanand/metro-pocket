import { MAX_TRAIN_CSV_BYTES, parseRunningDays, parseTrainCsv, trainCsvTemplate, TRAIN_CSV_HEADERS } from './train-csv';
import { TRAIN_DAYS, dayOffsetLabel, runningDaysLabel } from '../../shared/models/train.models';

const minimal = 'train_number,station_name,departure_time\n00123,Sample City,06:05';
const header = TRAIN_CSV_HEADERS.join(',');
const row = (changes: Record<string, string> = {}) =>
  TRAIN_CSV_HEADERS.map(
    column =>
      ({
        train_number: '99999',
        train_name: 'Sample Express',
        running_days: '',
        stop_sequence: '1',
        station_code: 'SMPA',
        station_name: 'Sample City A',
        arrival_time: '',
        departure_time: '19:20',
        day_offset: '',
        ...changes,
      })[column],
  ).join(',');
const csv = (...rows: string[]) => [header, ...rows].join('\n');

describe('User train CSV', () => {
  it('accepts the minimal format, keeps leading zeroes and supplies optional defaults', () => {
    const train = parseTrainCsv(minimal);
    expect(train.trainNumber).toBe('00123');
    expect(train.trainName).toBeUndefined();
    expect(train.runningDays).toEqual(TRAIN_DAYS);
    expect(train.stops).toEqual([
      {
        sequence: 1,
        stationName: 'Sample City',
        stationCode: undefined,
        arrivalTime: undefined,
        departureTime: '06:05',
        dayOffset: 0,
      },
    ]);
  });
  it('inherits first-row metadata and accepts a full explicit overnight schedule', () => {
    const train = parseTrainCsv(
      csv(
        row({ running_days: 'Monday|Wednesday|Friday', day_offset: '0' }),
        row({
          train_number: '',
          train_name: '',
          running_days: '',
          stop_sequence: '2',
          station_name: 'Sample City B',
          arrival_time: '03:40',
          departure_time: '03:45',
          day_offset: '1',
        }),
      ),
    );
    expect(train.trainName).toBe('Sample Express');
    expect(train.runningDays).toEqual(['MON', 'WED', 'FRI']);
    expect(train.stops[1].dayOffset).toBe(1);
  });
  it.each(['', ' ', '   ', 'DAILY', 'daily', 'MON|TUE|WED|THU|FRI|SAT|SUN'])(
    'treats %j running_days as Daily',
    value => {
      expect(parseTrainCsv(csv(row({ running_days: value }))).runningDays).toEqual(TRAIN_DAYS);
    },
  );
  it.each(['Mon|Wed|Fri', 'Monday|Wednesday|Friday', 'FRI|MON|WED', 'Mon,Wed,Fri'])(
    'normalizes day forms: %s',
    value => {
      expect(parseRunningDays(value)).toEqual(['MON', 'WED', 'FRI']);
    },
  );
  it('allows equivalent repeated running-day definitions in another order', () => {
    expect(
      parseTrainCsv(
        csv(
          row({ running_days: 'MON|WED' }),
          row({ running_days: 'Wednesday|Monday', stop_sequence: '2', departure_time: '20:20' }),
        ),
      ).runningDays,
    ).toEqual(['MON', 'WED']);
  });
  it.each([
    ['conflicting train numbers', { train_number: '99998' }, 'conflicting train_number'],
    ['conflicting train names', { train_name: 'Other Express' }, 'conflicting train_name'],
    ['conflicting running days', { running_days: 'MON' }, 'conflicting running_days'],
  ])('rejects %s with a row-specific error', (_, change, message) => {
    expect(() => parseTrainCsv(csv(row(), row({ stop_sequence: '2', departure_time: '20:20', ...change })))).toThrow(
      `Row 3: ${message}`,
    );
  });
  it('rejects unknown days', () =>
    expect(() => parseTrainCsv(csv(row({ running_days: 'FUNDAY' })))).toThrow('Unknown running day: FUNDAY'));
  it('supports quoted commas, escaped quotes, UTF-8, BOM and CRLF', () => {
    const train = parseTrainCsv('\uFEFFtrain_number,station_name,arrival_time\r\n99999,"சாம்பிள், ""City""",06:05\r\n');
    expect(train.stops[0].stationName).toBe('சாம்பிள், "City"');
  });
  it('supports quoted multiline station names', () => {
    expect(
      parseTrainCsv('train_number,station_name,arrival_time\n99999,"Sample\nCity",06:05').stops[0].stationName,
    ).toBe('Sample\nCity');
  });
  it.each(['25:70', '7pm', '19.20', '6:05', '24:00'])('rejects invalid HH:mm: %s', time => {
    expect(() => parseTrainCsv(csv(row({ departure_time: time })))).toThrow(`invalid departure_time "${time}"`);
  });
  it.each(['train_number', 'station_name'])('requires %s', column => {
    expect(() => parseTrainCsv(csv(row({ [column]: '' })))).toThrow(`${column} is required`);
  });
  it('requires at least one arrival/departure time', () =>
    expect(() => parseTrainCsv(csv(row({ departure_time: '' })))).toThrow(
      'arrival_time or departure_time is required',
    ));
  it('rejects departure before arrival within one stop', () =>
    expect(() => parseTrainCsv(csv(row({ arrival_time: '23:55', departure_time: '00:05' })))).toThrow(
      'must not precede arrival_time',
    ));
  it('rejects duplicate stop sequences', () =>
    expect(() => parseTrainCsv(csv(row(), row()))).toThrow('Row 3: duplicate stop_sequence 1'));
  it('infers sequence from CSV row order when every value is blank', () => {
    expect(
      parseTrainCsv(csv(row({ stop_sequence: '' }), row({ stop_sequence: '', departure_time: '20:20' }))).stops.map(
        stop => stop.sequence,
      ),
    ).toEqual([1, 2]);
  });
  it('sorts supplied sequences before inferring days', () => {
    const train = parseTrainCsv(
      csv(row({ stop_sequence: '2', departure_time: '00:25' }), row({ departure_time: '23:55' })),
    );
    expect(train.stops.map(stop => [stop.sequence, stop.dayOffset])).toEqual([
      [1, 0],
      [2, 1],
    ]);
  });
  it.each(['0', '-1', '1.5', 'NaN'])('rejects invalid sequence %s', value =>
    expect(() => parseTrainCsv(csv(row({ stop_sequence: value })))).toThrow('positive integer'),
  );
  it('rejects partial sequence specification', () =>
    expect(() => parseTrainCsv(csv(row(), row({ stop_sequence: '' })))).toThrow('Provide stop_sequence on every row'));
  it('infers deterministic overnight offsets from consecutive stop times', () => {
    const train = parseTrainCsv(
      csv(
        ...['22:40', '23:55', '00:25', '02:10', '00:05'].map((time, index) =>
          row({ stop_sequence: String(index + 1), departure_time: time }),
        ),
      ),
    );
    expect(train.stops.map(stop => stop.dayOffset)).toEqual([0, 0, 1, 1, 2]);
  });
  it('uses the previous departure, not arrival, for rollover', () => {
    const train = parseTrainCsv(
      csv(
        row({ arrival_time: '22:00', departure_time: '23:55' }),
        row({ stop_sequence: '2', arrival_time: '00:10', departure_time: '' }),
      ),
    );
    expect(train.stops[1].dayOffset).toBe(1);
  });
  it('rejects negative offsets', () =>
    expect(() => parseTrainCsv(csv(row({ day_offset: '-1' })))).toThrow('non-negative integer'));
  it('rejects explicit offsets that move backwards', () =>
    expect(() =>
      parseTrainCsv(
        csv(row({ day_offset: '1' }), row({ stop_sequence: '2', day_offset: '0', departure_time: '20:20' })),
      ),
    ).toThrow('day_offset/times move backwards'));
  it('rejects backwards times on the same explicit day', () =>
    expect(() =>
      parseTrainCsv(
        csv(row({ day_offset: '0' }), row({ stop_sequence: '2', day_offset: '0', departure_time: '18:20' })),
      ),
    ).toThrow('move backwards'));
  it('rejects partial day offset specification', () =>
    expect(() => parseTrainCsv(csv(row({ day_offset: '0' }), row({ stop_sequence: '2' })))).toThrow(
      'Provide day_offset on every row',
    ));
  it('rejects oversized CSV before parsing', () =>
    expect(() => parseTrainCsv('x'.repeat(MAX_TRAIN_CSV_BYTES + 1))).toThrow('at most 2 MB'));
  it.each([
    ['station_name,departure_time\nSample City,06:05', 'missing required column: train_number'],
    ['train_number,station_name\n99999,Sample City', 'needs an arrival_time or departure_time'],
    ['train_number,station_name,departure_time,extra\n99999,Sample City,06:05,x', 'Unknown CSV column'],
    ['train_number,station_name,station_name,departure_time\n99999,A,A,06:05', 'duplicate column headers'],
    ['train_number,station_name,departure_time\n99999,A,06:05,extra', 'expected 3 fields'],
    ['train_number,station_name,departure_time\n99999,"Unclosed,06:05', 'Quoted field unterminated'],
  ])('rejects malformed headers/rows safely', (text, message) => expect(() => parseTrainCsv(text)).toThrow(message));
  it('generates an offline fictional template with canonical headers and Daily running', () => {
    const template = trainCsvTemplate();
    expect(template.slice(0, template.indexOf('\r\n'))).toBe(header);
    const train = parseTrainCsv(template);
    expect(train.trainNumber).toBe('99999');
    expect(train.trainName).toBe('Sample Express');
    expect(train.stops).toHaveLength(3);
    expect(train.stops.every(stop => stop.stationName.startsWith('Sample City'))).toBe(true);
    expect(train.runningDays).toEqual(TRAIN_DAYS);
  });
  it('formats user-facing day labels without exposing masks', () => {
    expect(runningDaysLabel([...TRAIN_DAYS])).toBe('Daily');
    expect(runningDaysLabel(['MON', 'WED', 'FRI'])).toBe('Mon · Wed · Fri');
    expect([0, 1, 2].map(dayOffsetLabel)).toEqual(['', '+1 day', '+2 days']);
  });
});
