import { ManifestService } from './manifest.service';

const pack = (overrides: Record<string, unknown> = {}) => ({
  id: 'metro-city',
  type: 'metro',
  name: 'City Metro',
  version: 1,
  schemaVersion: 1,
  file: 'metro.db.gz',
  downloadUrl: 'https://example.test/metro.db.gz',
  ...overrides,
});
const manifest = (entry: unknown = pack()) => ({
  schemaVersion: 1,
  releaseVersion: 1,
  generatedAt: '2026-01-01T00:00:00Z',
  packs: [entry],
});

describe('ManifestService runtime validation', () => {
  const service = new ManifestService();
  it('accepts metro, TV and optional metadata', () => {
    expect(service.parse(manifest())).toBeTruthy();
    expect(
      service.parse(
        manifest(
          pack({ type: 'tv', downloadBytes: 0, installedBytes: 1, sha256: 'a'.repeat(64), networkAsOf: '2026-01-01' }),
        ),
      ),
    ).toBeTruthy();
  });
  it.each([
    { type: 'unknown' },
    { version: 0 },
    { version: 1.5 },
    { schemaVersion: 2 },
    { file: '' },
    { downloadUrl: 'http://example.test/pack' },
    { downloadUrl: 'not a URL' },
    { sha256: 'invalid' },
    { downloadBytes: -1 },
    { downloadBytes: 1.5 },
    { installedBytes: -1 },
    { installedBytes: Number.POSITIVE_INFINITY },
  ])('rejects invalid pack %o through the validation error', invalid => {
    expect(() => service.parse(manifest(pack(invalid)))).toThrow('A data pack in the manifest is invalid');
  });
  it.each([{ id: 123 }, { name: {} }, { file: [] }, { id: '' }, { name: '   ' }, { file: null }])(
    'rejects malformed runtime string values %o without a TypeError',
    invalid => expect(() => service.parse(manifest(pack(invalid)))).toThrow('A data pack in the manifest is invalid'),
  );
  it.each([{ generatedAt: 123 }, { generatedAt: '' }])('rejects malformed generatedAt values %o', invalid =>
    expect(() => service.parse({ ...manifest(), ...invalid })).toThrow('Data manifest is incomplete'),
  );
});
