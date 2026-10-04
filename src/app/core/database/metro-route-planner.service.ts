import { Injectable } from '@angular/core';
import type {
  MetroConnection,
  MetroLine,
  MetroNetwork,
  MetroStation,
  PlannedRoute,
  RouteSegment,
} from '../../shared/models/metro.models';

interface Step {
  stationId: string;
  lineId?: string;
  minutes: number;
  transfers: number;
  previous?: string;
}

@Injectable({ providedIn: 'root' })
export class MetroRoutePlannerService {
  plan(network: MetroNetwork, sourceId: string, destinationId: string): PlannedRoute | null {
    const stations = new Map(
      network.stations.filter(station => station.status === 'operational').map(station => [station.id, station]),
    );
    const source = stations.get(sourceId);
    const destination = stations.get(destinationId);
    if (!source || !destination) return null;
    if (sourceId === destinationId)
      return { source, destination, segments: [], stations: 0, interchanges: 0, minutes: 0, estimated: false };
    const lines = new Map(network.lines.filter(line => line.status === 'operational').map(line => [line.id, line]));
    const edges = new Map<string, MetroConnection[]>();
    for (const connection of network.connections) {
      if (
        connection.status !== 'operational' ||
        !stations.has(connection.from) ||
        !stations.has(connection.to) ||
        !lines.has(connection.lineId)
      )
        continue;
      edges.set(connection.from, [...(edges.get(connection.from) ?? []), connection]);
      edges.set(connection.to, [
        ...(edges.get(connection.to) ?? []),
        { ...connection, from: connection.to, to: connection.from },
      ]);
    }
    const queue: Step[] = [{ stationId: sourceId, minutes: 0, transfers: 0 }];
    const best = new Map<string, Step>();
    best.set(`${sourceId}|`, queue[0]);
    let winner: Step | undefined;
    while (queue.length) {
      queue.sort((a, b) => a.minutes + a.transfers * 7 - (b.minutes + b.transfers * 7));
      const current = queue.shift()!;
      if (current.stationId === destinationId) {
        winner = current;
        break;
      }
      for (const edge of edges.get(current.stationId) ?? []) {
        const transfer = Boolean(current.lineId && current.lineId !== edge.lineId);
        const interchange = transfer
          ? (network.interchanges?.find(
              item =>
                item.stationId === current.stationId &&
                ((item.fromLineId === current.lineId && item.toLineId === edge.lineId) ||
                  (item.toLineId === current.lineId && item.fromLineId === edge.lineId)),
            )?.minutes ?? 5)
          : 0;
        const next: Step = {
          stationId: edge.to,
          lineId: edge.lineId,
          minutes: current.minutes + (edge.minutes ?? network.defaultEdgeMinutes ?? 3) + interchange,
          transfers: current.transfers + Number(transfer),
          previous: `${current.stationId}|${current.lineId ?? ''}`,
        };
        const key = `${next.stationId}|${next.lineId}`;
        const old = best.get(key);
        if (!old || next.minutes + next.transfers * 7 < old.minutes + old.transfers * 7) {
          best.set(key, next);
          queue.push(next);
        }
      }
    }
    if (!winner) return null;
    const path: Step[] = [];
    for (let step: Step | undefined = winner; step; step = step.previous ? best.get(step.previous) : undefined)
      path.unshift(step);
    const segments: RouteSegment[] = [];
    for (let index = 1; index < path.length; index++) {
      const previous = path[index - 1];
      const current = path[index];
      const station = stations.get(current.stationId)!;
      const line = lines.get(current.lineId!)!;
      const existing = segments.at(-1);
      if (!existing || existing.line.id !== line.id)
        segments.push({
          line,
          stations: [stations.get(previous.stationId)!, station],
          toward: this.terminalFor(line, station.id),
          minutes: current.minutes - previous.minutes,
        });
      else {
        existing.stations.push(station);
        existing.minutes += current.minutes - previous.minutes;
      }
    }
    return {
      source,
      destination,
      segments,
      stations: path.length - 1,
      interchanges: winner.transfers,
      minutes: winner.minutes,
      estimated: network.connections.some(edge => edge.minutes === undefined),
    };
  }
  search(network: MetroNetwork, term: string): MetroStation[] {
    const query = term.trim().toLocaleLowerCase();
    if (!query) return [];
    return network.stations
      .filter(
        station =>
          station.status === 'operational' &&
          [station.name, ...(station.aliases ?? []), ...(station.codes ?? [])].some(value =>
            value.toLocaleLowerCase().includes(query),
          ),
      )
      .slice(0, 8);
  }
  private terminalFor(line: MetroLine, stationId: string): string {
    return line.terminals.find(terminal => terminal !== stationId) ?? line.name;
  }
}
