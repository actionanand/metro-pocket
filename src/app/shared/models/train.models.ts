export const TRAIN_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
export type TrainDay = (typeof TRAIN_DAYS)[number];

export interface TrainStop {
  sequence: number;
  stationCode?: string;
  stationName: string;
  arrivalTime?: string;
  departureTime?: string;
  dayOffset: number;
}

export interface TrainSchedule {
  trainNumber: string;
  trainName?: string;
  runningDays: TrainDay[];
  stops: TrainStop[];
}

export interface UserTrain extends TrainSchedule {
  createdAt: string;
  updatedAt: string;
}

export interface SavedTrainSummary extends Omit<UserTrain, 'stops'> {
  stopCount: number;
}

export interface TrainBackup {
  format: 'metropocket-trains';
  schemaVersion: 1;
  exportedAt: string;
  trains: UserTrain[];
}

export type TrainRestoreMode = 'merge' | 'replace-all';

export function runningDaysMask(days: readonly TrainDay[]): number {
  return days.reduce((mask, day) => mask | (1 << TRAIN_DAYS.indexOf(day)), 0);
}

export function daysFromMask(mask: number): TrainDay[] {
  return TRAIN_DAYS.filter((_, index) => !!(mask & (1 << index)));
}

export function runningDaysLabel(days: readonly TrainDay[]): string {
  return days.length === 7 ? 'Daily' : days.map(day => day[0] + day.slice(1).toLowerCase()).join(' · ');
}

export function dayOffsetLabel(offset: number): string {
  return offset === 0 ? '' : `+${offset} ${offset === 1 ? 'day' : 'days'}`;
}
