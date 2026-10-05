import { Injectable } from '@angular/core';
import type { InstalledPack } from '../../shared/models/data-pack.models';

const DB_NAME = 'metropocket-packs';
const DB_VERSION = 1;
const PACKS = 'packs';
const METADATA = 'metadata';

@Injectable({ providedIn: 'root' })
export class PackStorageService {
  private database: Promise<IDBDatabase> | null = null;

  async installed(): Promise<InstalledPack[]> {
    return this.request<InstalledPack[]>((await this.store(METADATA, 'readonly')).getAll());
  }
  async getMetadata(id: string): Promise<InstalledPack | undefined> {
    return this.request<InstalledPack | undefined>((await this.store(METADATA, 'readonly')).get(id));
  }
  async getBytes(id: string): Promise<ArrayBuffer | undefined> {
    return this.request<ArrayBuffer | undefined>((await this.store(PACKS, 'readonly')).get(id));
  }

  async replace(id: string, bytes: ArrayBuffer, metadata: InstalledPack): Promise<void> {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([PACKS, METADATA], 'readwrite');
      transaction.objectStore(PACKS).put(bytes, id);
      transaction.objectStore(METADATA).put(metadata, id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }
  async delete(id: string): Promise<void> {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([PACKS, METADATA], 'readwrite');
      transaction.objectStore(PACKS).delete(id);
      transaction.objectStore(METADATA).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }
  private async store(name: string, mode: IDBTransactionMode): Promise<IDBObjectStore> {
    return (await this.open()).transaction(name, mode).objectStore(name);
  }
  private open(): Promise<IDBDatabase> {
    this.database ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(PACKS);
        request.result.createObjectStore(METADATA);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return this.database;
  }
  private request<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}
