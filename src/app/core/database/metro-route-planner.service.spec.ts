import { MetroRoutePlannerService } from './metro-route-planner.service';
import type { MetroNetwork } from '../../shared/models/metro.models';
const network: MetroNetwork = {
  city: 'Fixture',
  networkAsOf: '2026-01-01',
  defaultEdgeMinutes: 2,
  stations: [
    { id: 'a', name: 'A', status: 'operational' },
    { id: 'b', name: 'B', status: 'operational' },
    { id: 'c', name: 'C', status: 'operational' },
    { id: 'd', name: 'D', status: 'operational' },
    { id: 'x', name: 'X', status: 'planned' },
  ],
  lines: [
    { id: 'red', name: 'Red', color: '#f00', status: 'operational', terminals: ['a', 'b'] },
    { id: 'blue', name: 'Blue', color: '#00f', status: 'operational', terminals: ['b', 'd'] },
  ],
  connections: [
    { from: 'a', to: 'b', lineId: 'red', minutes: 2, status: 'operational' },
    { from: 'b', to: 'c', lineId: 'blue', minutes: 2, status: 'operational' },
    { from: 'c', to: 'd', lineId: 'blue', minutes: 2, status: 'operational' },
    { from: 'd', to: 'x', lineId: 'blue', minutes: 2, status: 'operational' },
  ],
  interchanges: [{ stationId: 'b', fromLineId: 'red', toLineId: 'blue', minutes: 5 }],
};
describe('MetroRoutePlannerService', () => {
  const service = new MetroRoutePlannerService();
  it('plans an interchange with transfer time', () => {
    const route = service.plan(network, 'a', 'd');
    expect(route?.stations).toBe(3);
    expect(route?.interchanges).toBe(1);
    expect(route?.minutes).toBe(11);
    expect(route?.segments).toHaveLength(2);
  });
  it('handles same station and excludes unavailable stations', () => {
    expect(service.plan(network, 'a', 'a')?.minutes).toBe(0);
    expect(service.plan(network, 'a', 'x')).toBeNull();
  });
  it('searches aliases and codes', () => {
    const fixture = {
      ...network,
      stations: [
        ...network.stations,
        { id: 'z', name: 'Central', aliases: ['Town'], codes: ['CTR'], status: 'operational' as const },
      ],
    };
    expect(service.search(fixture, 'ctr')[0]?.id).toBe('z');
  });
});
