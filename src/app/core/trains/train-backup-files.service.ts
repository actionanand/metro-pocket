import { DOCUMENT } from '@angular/common';
import { InjectionToken, Service, inject } from '@angular/core';
import { registerPlugin } from '@capacitor/core';
import { AppPlatformService } from '../platform/app-platform.service';
import { LocalFileService } from './local-file.service';
import { MAX_TRAIN_BACKUP_BYTES, TRAIN_BACKUP_MIME } from './train-backup';

export interface TrainBackupNativePlugin {
  saveDatabase(options: { filename: string; base64: string }): Promise<{ cancelled?: boolean }>;
  openDatabase(): Promise<{ cancelled?: boolean; filename?: string; base64?: string }>;
}

export const TRAIN_BACKUP_NATIVE = new InjectionToken<TrainBackupNativePlugin>('Android Train backup files', {
  providedIn: 'root',
  factory: () => registerPlugin<TrainBackupNativePlugin>('TrainBackup'),
});

export interface SelectedTrainBackup {
  filename: string;
  bytes: ArrayBuffer;
}
export type TrainBackupSaveResult = 'shared' | 'downloaded' | 'saved' | 'cancelled';

export function trainBytesToBase64(bytes: ArrayBuffer): string {
  const array = new Uint8Array(bytes);
  let text = '';
  for (let offset = 0; offset < array.length; offset += 0x8000)
    text += String.fromCharCode(...array.subarray(offset, offset + 0x8000));
  return btoa(text);
}

export function trainBytesFromBase64(base64: string): ArrayBuffer {
  if (base64.length > Math.ceil(MAX_TRAIN_BACKUP_BYTES / 3) * 4) throw new Error('Train backup exceeds 20 MB.');
  return Uint8Array.from(atob(base64), character => character.charCodeAt(0)).buffer;
}

/** Only file I/O varies by platform; SQLite validation always stays in the repository. */
@Service()
export class TrainBackupFilesService {
  private readonly document = inject(DOCUMENT);
  private readonly platform = inject(AppPlatformService);
  private readonly native = inject(TRAIN_BACKUP_NATIVE);
  private readonly files = inject(LocalFileService);

  async save(bytes: ArrayBuffer, filename: string): Promise<TrainBackupSaveResult> {
    if (bytes.byteLength > MAX_TRAIN_BACKUP_BYTES) throw new Error('Train backup exceeds 20 MB.');
    if (this.platform.isAndroid()) {
      const result = await this.native.saveDatabase({ filename, base64: trainBytesToBase64(bytes) });
      return result.cancelled ? 'cancelled' : 'saved';
    }
    if (!this.platform.isWeb()) throw new Error('Train backup export is unavailable on this platform.');
    const file = new File([bytes], filename, { type: TRAIN_BACKUP_MIME });
    const navigator = this.document.defaultView?.navigator;
    try {
      if (navigator?.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'MetroPocket Train backup' });
        return 'shared';
      }
    } catch (cause) {
      if (cause !== null && typeof cause === 'object' && 'name' in cause && cause.name === 'AbortError')
        return 'cancelled';
      // Unsupported/failed sharing retains the normal browser download fallback.
    }
    this.files.download(bytes, filename, TRAIN_BACKUP_MIME);
    return 'downloaded';
  }

  async choose(): Promise<SelectedTrainBackup | undefined> {
    if (this.platform.isAndroid()) {
      const result = await this.native.openDatabase();
      if (result.cancelled) return undefined;
      if (typeof result.base64 !== 'string') throw new Error('Android did not return a Train backup file.');
      return { filename: result.filename || 'train-backup.db', bytes: trainBytesFromBase64(result.base64) };
    }
    if (!this.platform.isWeb()) throw new Error('Train backup restore is unavailable on this platform.');
    return new Promise((resolve, reject) => {
      const input = this.document.createElement('input');
      input.type = 'file';
      input.accept = '.db,.sqlite,.sqlite3,application/x-sqlite3,application/vnd.sqlite3';
      input.setAttribute('aria-label', 'Restore Train Backup');
      input.hidden = true;
      this.document.body.append(input);
      const cleanup = () => input.remove();
      input.addEventListener(
        'cancel',
        () => {
          cleanup();
          resolve(undefined);
        },
        { once: true },
      );
      input.addEventListener(
        'change',
        () => {
          const file = input.files?.[0];
          cleanup();
          if (!file) {
            resolve(undefined);
            return;
          }
          if (file.size > MAX_TRAIN_BACKUP_BYTES) {
            reject(new Error('Train backup is too large. Choose a file of at most 20 MB.'));
            return;
          }
          void Promise.resolve()
            .then(() => file.arrayBuffer())
            .then(bytes => resolve({ filename: file.name, bytes }), reject);
        },
        { once: true },
      );
      try {
        input.click();
      } catch (cause) {
        cleanup();
        reject(cause);
      }
    });
  }
}
