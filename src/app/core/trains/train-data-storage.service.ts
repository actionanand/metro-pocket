import { Service } from '@angular/core';

export interface TrainDatabaseSnapshot {
  bytes: ArrayBuffer;
  revision: number;
}

/** A separate atomic IndexedDB record, never stored in metropocket-packs. */
@Service()
export class TrainDataStorageService {
  private database?: Promise<IDBDatabase>;

  async load(): Promise<TrainDatabaseSnapshot | undefined> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('sqlite', 'readonly');
      const request = transaction.objectStore('sqlite').get('trains') as IDBRequest<TrainDatabaseSnapshot | undefined>;
      transaction.oncomplete = () => {
        const result = request.result;
        if (
          result &&
          (Object.prototype.toString.call(result.bytes) !== '[object ArrayBuffer]' ||
            !Number.isSafeInteger(result.revision) ||
            result.revision < 1)
        ) {
          reject(new Error('Saved train storage is invalid. Your data has not been changed.'));
        } else resolve(result);
      };
      transaction.onabort = transaction.onerror = () =>
        reject(transaction.error ?? new Error('Unable to read saved trains.'));
    });
  }

  async save(
    bytes: ArrayBuffer,
    expectedRevision: number,
    validateStored?: (bytes: ArrayBuffer) => void,
  ): Promise<void> {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('sqlite', 'readwrite');
      const store = transaction.objectStore('sqlite');
      const request = store.get('trains') as IDBRequest<TrainDatabaseSnapshot | undefined>;
      let failure: Error | undefined;
      transaction.oncomplete = () => resolve();
      transaction.onabort = transaction.onerror = () =>
        reject(failure ?? transaction.error ?? new Error('Unable to save train data.'));
      request.onsuccess = () => {
        if ((request.result?.revision ?? 0) !== expectedRevision) {
          failure = new Error('Train data changed in another window. Refresh and try again.');
          transaction.abort();
          return;
        }
        try {
          const put = store.put({ bytes, revision: expectedRevision + 1 } satisfies TrainDatabaseSnapshot, 'trains');
          if (validateStored)
            put.onsuccess = () => {
              const stored = store.get('trains') as IDBRequest<TrainDatabaseSnapshot>;
              stored.onsuccess = () => {
                try {
                  // Reopen stored bytes before this transaction commits. Aborting
                  // restores the original record, including an absent record.
                  validateStored(stored.result.bytes);
                } catch (cause) {
                  failure = cause instanceof Error ? cause : new Error('Restored train validation failed.');
                  transaction.abort();
                }
              };
            };
        } catch (cause) {
          failure = cause instanceof Error ? cause : new Error('Unable to save train data.');
          transaction.abort();
        }
      };
    });
  }

  private open(): Promise<IDBDatabase> {
    this.database ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('metropocket-user-data', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('sqlite');
      request.onerror = () => reject(request.error ?? new Error('Train storage is unavailable.'));
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => {
          database.close();
          this.database = undefined;
        };
        resolve(database);
      };
    }).catch(cause => {
      this.database = undefined;
      throw cause;
    });
    return this.database;
  }
}
