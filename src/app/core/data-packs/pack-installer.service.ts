import { inject, Injectable, signal } from '@angular/core';
import { PackStorageService } from './pack-storage.service';
import type { DataPackDescriptor, InstalledPack } from '../../shared/models/data-pack.models';

@Injectable({ providedIn: 'root' })
export class PackInstallerService {
  readonly progress = signal<Record<string, number>>({});
  readonly failures = signal<Record<string, string>>({});
  private readonly storage = inject(PackStorageService);

  async install(pack: DataPackDescriptor): Promise<void> {
    this.failures.update(items => ({ ...items, [pack.id]: '' }));
    try {
      const bytes = await this.download(pack);
      if (pack.sha256 && (await this.sha256(bytes)) !== pack.sha256.toLowerCase())
        throw new Error('The downloaded file did not match its checksum.');
      if (pack.schemaVersion !== 1) throw new Error('This pack schema is not supported by this app version.');
      if (!bytes.byteLength) throw new Error('The downloaded pack is empty.');
      const metadata: InstalledPack = {
        id: pack.id,
        version: pack.version,
        schemaVersion: pack.schemaVersion,
        installedAt: new Date().toISOString(),
        checksum: pack.sha256,
        size: bytes.byteLength,
        networkAsOf: pack.networkAsOf,
      };
      await this.storage.replace(pack.id, bytes, metadata);
    } catch (cause) {
      this.failures.update(items => ({
        ...items,
        [pack.id]: cause instanceof Error ? cause.message : 'Download failed.',
      }));
      throw cause;
    } finally {
      this.progress.update(items => ({ ...items, [pack.id]: 0 }));
    }
  }
  private async download(pack: DataPackDescriptor): Promise<ArrayBuffer> {
    const response = await fetch(pack.downloadUrl);
    if (!response.ok || !response.body)
      throw new Error('The data pack could not be downloaded. Check your connection and retry.');
    const total = Number(response.headers.get('content-length')) || pack.downloadBytes || 0;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      chunks.push(next.value);
      received += next.value.length;
      this.progress.update(items => ({ ...items, [pack.id]: total ? Math.round((received / total) * 100) : 0 }));
    }
    const merged = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    return merged.buffer;
  }
  private async sha256(bytes: ArrayBuffer): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
  }
}
