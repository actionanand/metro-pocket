import { TestBed } from '@angular/core/testing';
import { LocalFileService } from './local-file.service';

describe('Local train file downloads', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it('downloads a local Blob with the requested filename and removes its temporary anchor', async () => {
    const blobs: Blob[] = [];
    const create = vi.spyOn(URL, 'createObjectURL').mockImplementation(value => {
      if (value instanceof Blob) blobs.push(value);
      return 'blob:train-test';
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('train-backup.json');
      expect(this.href).toBe('blob:train-test');
    });
    vi.stubGlobal('fetch', vi.fn());
    TestBed.inject(LocalFileService).download('{"local":true}', 'train-backup.json', 'application/json');
    expect(create).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(await blobs[0].text()).toBe('{"local":true}');
    expect(document.querySelector('a[download="train-backup.json"]')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
