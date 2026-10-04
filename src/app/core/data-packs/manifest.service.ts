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
    if (typeof candidate.releaseVersion !== 'number' || typeof candidate.generatedAt !== 'string') {
      throw new Error('Data manifest is incomplete.');
    }
    candidate.packs.forEach(pack => this.validatePack(pack));
    return candidate as DataManifest;
  }

  private validatePack(pack: DataPackDescriptor): void {
    if (
      !pack.id ||
      !pack.name ||
      !pack.downloadUrl ||
      !Number.isInteger(pack.version) ||
      pack.schemaVersion !== SUPPORTED_SCHEMA_VERSION
    ) {
      throw new Error('A data pack in the manifest is invalid or unsupported.');
    }
  }
}
