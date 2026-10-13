import { TestBed } from '@angular/core/testing';
import { LocalFileService } from './local-file.service';

describe('Local train file downloads', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it('downloads local SQLite bytes with the requested filename and removes its temporary anchor', () => {
    const bytes = new TextEncoder().encode('SQLite format 3\0').buffer;
    const blobs: Blob[] = [];
    const create = vi.spyOn(URL, 'createObjectURL').mockImplementation(value => {
      if (value instanceof Blob) blobs.push(value);
      return 'blob:train-test';
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('train-backup.db');
      expect(this.href).toBe('blob:train-test');
    });
    vi.stubGlobal('fetch', vi.fn());
    TestBed.inject(LocalFileService).download(bytes, 'train-backup.db', 'application/x-sqlite3');
    expect(create).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(blobs[0].size).toBe(bytes.byteLength);
    expect(blobs[0].type).toBe('application/x-sqlite3');
    expect(document.querySelector('a[download="train-backup.db"]')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
