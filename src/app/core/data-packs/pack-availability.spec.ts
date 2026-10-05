import { hasInstalledPackType } from './pack-availability';
import type { InstalledPack } from '../../shared/models/data-pack.models';

const pack = (type?: InstalledPack['type']): InstalledPack => ({
  id: 'fixture',
  type,
  version: 1,
  schemaVersion: 1,
  installedAt: '2026-01-01',
  size: 1,
});
describe('hasInstalledPackType', () => {
  it('keeps Metro and TV availability distinct and ignores legacy unknown records', () => {
    expect(hasInstalledPackType([], 'metro')).toBe(false);
    expect(hasInstalledPackType([pack('tv')], 'metro')).toBe(false);
    expect(hasInstalledPackType([pack('metro')], 'metro')).toBe(true);
    expect(hasInstalledPackType([pack('metro')], 'tv')).toBe(false);
    expect(hasInstalledPackType([pack('tv')], 'tv')).toBe(true);
    expect(hasInstalledPackType([pack()], 'tv')).toBe(false);
  });
});
