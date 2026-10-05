export type OperationalStatus = 'operational' | 'under-construction' | 'planned' | 'temporarily-closed';

export interface MetroStation {
  id: string;
  name: string;
  aliases?: string[];
  codes?: string[];
  status: OperationalStatus;
}
export interface MetroLine {
  id: string;
  name: string;
  color: string;
  status: OperationalStatus;
  terminals: string[];
}
export interface MetroConnection {
  from: string;
  to: string;
  lineId: string;
  minutes?: number;
  status: OperationalStatus;
}
export interface MetroInterchange {
  stationId: string;
  fromLineId: string;
  toLineId: string;
  minutes?: number;
}
export interface MetroNetwork {
  city: string;
  networkAsOf: string;
  stations: MetroStation[];
  lines: MetroLine[];
  connections: MetroConnection[];
  interchanges?: MetroInterchange[];
  defaultEdgeMinutes?: number;
}
export interface RouteSegment {
  line: MetroLine;
  stations: MetroStation[];
  toward: string;
  minutes: number;
}
export interface PlannedRoute {
  source: MetroStation;
  destination: MetroStation;
  segments: RouteSegment[];
  stations: number;
  interchanges: number;
  minutes: number;
  estimated: boolean;
}
