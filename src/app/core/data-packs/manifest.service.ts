import { Injectable, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import type { DataManifest, DataPackDescriptor } from '../../shared/models/data-pack.models';

const SUPPORTED_SCHEMA_VERSION = 1;

@Injectable({ providedIn: 'root' })
export class ManifestService {
  readonly manifest = signal<DataManifest | null>(null);
  readonly error = signal<string | null>(null);

  async refresh(): Promise<DataManifest | null> {
    try {
      const response = await fetch(environment.dataManifestUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Manifest request failed (${response.status}).`);
      const manifest = this.parse(await response.json());
      this.manifest.set(manifest);
      this.error.set(null);
      return manifest;
    } catch (cause) {
      this.error.set(cause instanceof Error ? cause.message : 'Unable to check for data updates.');
      return null;
    }
  }

  parse(value: unknown): DataManifest {
    if (!value || typeof value !== 'object') throw new Error('Data manifest is not an object.');
    const candidate = value as Partial<DataManifest>;
    if (candidate.schemaVersion !== SUPPORTED_SCHEMA_VERSION || !Array.isArray(candidate.packs)) {
      throw new Error('This data manifest uses an unsupported schema version.');
    }
    if (!this.positiveInteger(candidate.releaseVersion) || !this.nonEmptyString(candidate.generatedAt)) {
      throw new Error('Data manifest is incomplete.');
    }
    candidate.packs.forEach(pack => this.validatePack(pack));
    return candidate as DataManifest;
  }

  private validatePack(pack: unknown): void {
    if (!pack || typeof pack !== 'object') throw new Error('A data pack in the manifest is invalid or unsupported.');
    const item = pack as Partial<DataPackDescriptor>;
    const validUrl =
      typeof item.downloadUrl === 'string' &&
      (() => {
        try {
          return new URL(item.downloadUrl).protocol === 'https:';
        } catch {
          return false;
        }
      })();
    const validBytes = (bytes: unknown) =>
      bytes === undefined ||
      (typeof bytes === 'number' && Number.isFinite(bytes) && Number.isInteger(bytes) && bytes >= 0);
    if (
      !this.nonEmptyString(item.id) ||
      (item.type !== 'metro' && item.type !== 'tv') ||
      !this.nonEmptyString(item.name) ||
      !this.positiveInteger(item.version) ||
      item.schemaVersion !== SUPPORTED_SCHEMA_VERSION ||
      !this.nonEmptyString(item.file) ||
      !validUrl ||
      !validBytes(item.downloadBytes) ||
      !validBytes(item.installedBytes) ||
      (item.sha256 !== undefined && (typeof item.sha256 !== 'string' || !/^[a-fA-F0-9]{64}$/.test(item.sha256))) ||
      (item.networkAsOf !== undefined && typeof item.networkAsOf !== 'string')
    ) {
      throw new Error('A data pack in the manifest is invalid or unsupported.');
    }
  }
  private positiveInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
  }
  private nonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
  }
}
