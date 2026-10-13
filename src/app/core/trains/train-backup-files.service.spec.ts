import { TestBed } from '@angular/core/testing';
import { AppPlatformService } from '../platform/app-platform.service';
import { LocalFileService } from './local-file.service';
import { MAX_TRAIN_BACKUP_BYTES, TRAIN_BACKUP_MIME } from './train-backup';
import {
  TRAIN_BACKUP_NATIVE,
  TrainBackupFilesService,
  trainBytesFromBase64,
  trainBytesToBase64,
} from './train-backup-files.service';

describe('Cross-platform Train DB files', () => {
  let web = true;
  const native = { saveDatabase: vi.fn(), openDatabase: vi.fn() };
  const downloads = { download: vi.fn() };
  const bytes = new Uint8Array([...new TextEncoder().encode('SQLite format 3\0'), 0, 255, 128]).buffer;
  const filename = 'metropocket-trains-backup-2026-10-13.db';
  let originalShare: PropertyDescriptor | undefined;
  let originalCanShare: PropertyDescriptor | undefined;
  beforeEach(() => {
    vi.clearAllMocks();
    web = true;
    originalShare = Object.getOwnPropertyDescriptor(window.navigator, 'share');
    originalCanShare = Object.getOwnPropertyDescriptor(window.navigator, 'canShare');
    Object.defineProperty(window.navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(window.navigator, 'canShare', { configurable: true, value: undefined });
    native.saveDatabase.mockResolvedValue({ cancelled: false });
    native.openDatabase.mockResolvedValue({ filename, base64: trainBytesToBase64(bytes) });
    TestBed.configureTestingModule({
      providers: [
        { provide: AppPlatformService, useValue: { isWeb: () => web, isAndroid: () => !web } },
        { provide: TRAIN_BACKUP_NATIVE, useValue: native },
        { provide: LocalFileService, useValue: downloads },
      ],
    });
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    if (originalShare) Object.defineProperty(window.navigator, 'share', originalShare);
    else Reflect.deleteProperty(window.navigator, 'share');
    if (originalCanShare) Object.defineProperty(window.navigator, 'canShare', originalCanShare);
    else Reflect.deleteProperty(window.navigator, 'canShare');
    vi.unstubAllGlobals();
  });
  function sharing(share: ReturnType<typeof vi.fn>): void {
    Object.defineProperty(window.navigator, 'share', { configurable: true, value: share });
    Object.defineProperty(window.navigator, 'canShare', { configurable: true, value: () => true });
  }
  it('uses normal Web download when file sharing is unavailable', async () => {
    expect(await TestBed.inject(TrainBackupFilesService).save(bytes, filename)).toBe('downloaded');
    expect(downloads.download).toHaveBeenCalledWith(bytes, filename, TRAIN_BACKUP_MIME);
    expect(native.saveDatabase).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('prefers Web File sharing when supported', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    sharing(share);
    expect(await TestBed.inject(TrainBackupFilesService).save(bytes, filename)).toBe('shared');
    const file = share.mock.calls[0][0].files[0] as File;
    expect(file.name).toBe(filename);
    expect(file.type).toBe(TRAIN_BACKUP_MIME);
    expect(downloads.download).not.toHaveBeenCalled();
  });
  it('falls back to download after a Web share error', async () => {
    sharing(vi.fn().mockRejectedValue(new Error('Sharing unavailable')));
    expect(await TestBed.inject(TrainBackupFilesService).save(bytes, filename)).toBe('downloaded');
    expect(downloads.download).toHaveBeenCalledOnce();
  });
  it('respects Web share cancellation without reporting a saved backup', async () => {
    sharing(vi.fn().mockRejectedValue(new DOMException('Cancelled', 'AbortError')));
    expect(await TestBed.inject(TrainBackupFilesService).save(bytes, filename)).toBe('cancelled');
    expect(downloads.download).not.toHaveBeenCalled();
  });
  it('passes the same raw binary bytes through Android save and open', async () => {
    web = false;
    const files = TestBed.inject(TrainBackupFilesService);
    expect(await files.save(bytes, filename)).toBe('saved');
    const sent = native.saveDatabase.mock.calls[0][0];
    expect(sent.filename).toBe(filename);
    expect(trainBytesFromBase64(sent.base64)).toEqual(bytes);
    expect(await files.choose()).toEqual({ filename, bytes });
    expect(document.querySelector('input[type=file]')).toBeNull();
    expect(downloads.download).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('handles native cancellation and fails instead of pretending Web downloads worked', async () => {
    web = false;
    const files = TestBed.inject(TrainBackupFilesService);
    native.openDatabase.mockResolvedValue({ cancelled: true });
    native.saveDatabase.mockResolvedValue({ cancelled: true });
    expect(await files.choose()).toBeUndefined();
    expect(await files.save(bytes, filename)).toBe('cancelled');
    native.saveDatabase.mockRejectedValueOnce(new Error('Native save failed'));
    await expect(files.save(bytes, filename)).rejects.toThrow('Native save failed');
    expect(downloads.download).not.toHaveBeenCalled();
  });
  it('reads Web picker bytes locally and removes its temporary input', async () => {
    const selected = TestBed.inject(TrainBackupFilesService).choose();
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    expect(input.accept).toContain('.db');
    expect(input.accept).toContain('.sqlite3');
    expect(input.getAttribute('aria-label')).toBe('Restore Train Backup');
    Object.defineProperty(input, 'files', {
      value: [{ name: filename, size: bytes.byteLength, arrayBuffer: () => Promise.resolve(bytes) }],
    });
    input.dispatchEvent(new Event('change'));
    expect(await selected).toEqual({ filename, bytes });
    expect(document.querySelector('input[type=file]')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('handles Web picker cancellation without errors or a dangling input', async () => {
    const selected = TestBed.inject(TrainBackupFilesService).choose();
    document.querySelector('input[type=file]')!.dispatchEvent(new Event('cancel'));
    expect(await selected).toBeUndefined();
    expect(document.querySelector('input[type=file]')).toBeNull();
  });
  it('rejects oversized Web files before reading their bytes', async () => {
    const selected = TestBed.inject(TrainBackupFilesService).choose();
    const read = vi.fn();
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      value: [{ name: filename, size: MAX_TRAIN_BACKUP_BYTES + 1, arrayBuffer: read }],
    });
    input.dispatchEvent(new Event('change'));
    await expect(selected).rejects.toThrow('20 MB');
    expect(read).not.toHaveBeenCalled();
  });
});
