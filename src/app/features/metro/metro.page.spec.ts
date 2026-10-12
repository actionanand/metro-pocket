import { TestBed } from '@angular/core/testing';
import { MetroPage } from './metro.page';
import { MetroNetworkRepositoryService } from '../../core/database/metro-network-repository.service';
import type { MetroNetwork } from '../../shared/models/metro.models';

const network: MetroNetwork = {
  city: 'Test City',
  networkAsOf: '2026-01-01',
  stations: [
    { id: 'a', name: 'First Station', aliases: ['First'], status: 'operational' },
    { id: 'b', name: 'Last Station', status: 'operational' },
  ],
  lines: [{ id: 'one', name: 'Test Line', color: '#123456', status: 'operational', terminals: ['a', 'b'] }],
  stationLines: [
    { stationId: 'a', lineId: 'one', sequence: 1 },
    { stationId: 'b', lineId: 'one', sequence: 2 },
  ],
  connections: [{ from: 'a', to: 'b', lineId: 'one', minutes: 2, status: 'operational', bidirectional: true }],
};
describe('Metro installed-data UI', () => {
  const repository = { installed: vi.fn(), load: vi.fn() };
  let page: MetroPage;
  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({ providers: [{ provide: MetroNetworkRepositoryService, useValue: repository }] });
    page = TestBed.runInInjectionContext(() => new MetroPage());
  });
  it('loads an installed pack, requires selected stations and swaps names and IDs', async () => {
    repository.installed.mockResolvedValue([{ id: 'test', type: 'metro', version: 1 }]);
    repository.load.mockResolvedValue(network);
    await page.ionViewWillEnter();
    expect(page.routeDataReady()).toBe(true);
    page.search('from', 'First');
    expect(page.fromResults()[0].id).toBe('a');
    expect(page.hasSelection()).toBe(false);
    page.select('from', network.stations[0]);
    page.select('to', network.stations[1]);
    page.findRoute();
    expect(page.route()?.segments[0].toward).toBe('Last Station');
    page.swap();
    expect(page.fromId()).toBe('b');
    expect(page.from()).toBe('Last Station');
    expect(page.toId()).toBe('a');
    page.findRoute();
    expect(page.route()?.segments[0].toward).toBe('First Station');
    repository.installed.mockResolvedValue([]);
    await page.ionViewWillEnter();
    expect(page.dataAvailable()).toBe(false);
    expect(page.hasSelection()).toBe(false);
    expect(page.route()).toBeNull();
  });
  it('shows a recovery message and keeps search disabled for unreadable packs', async () => {
    repository.installed.mockResolvedValue([{ id: 'test', type: 'metro', version: 1 }]);
    repository.load.mockRejectedValue(new Error('Corrupt SQLite'));
    await page.ionViewWillEnter();
    expect(page.routeDataReady()).toBe(false);
    expect(page.loading()).toBe(false);
    expect(page.error()).toContain('Offline Data');
  });
});
