import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { TrainsPage } from './trains.page';
import { TrainAlreadyExistsError, TrainRepositoryService } from '../../core/trains/train-repository.service';
import { LocalFileService } from '../../core/trains/local-file.service';
import { sampleTrain, textFile } from '../../core/trains/train-test-fixtures';
import { trainCsvTemplate, MAX_TRAIN_CSV_BYTES } from '../../core/trains/train-csv';
import { AppPlatformService } from '../../core/platform/app-platform.service';

describe('Trains page', () => {
  let web = true;
  const repository = {
    list: vi.fn(),
    count: vi.fn(),
    get: vi.fn(),
    importTrain: vi.fn(),
    trainCount: signal<number | null>(0),
    changes: signal(0),
  };
  const files = { download: vi.fn() };
  beforeEach(async () => {
    vi.clearAllMocks();
    web = true;
    repository.trainCount.set(0);
    repository.changes.set(0);
    repository.list.mockResolvedValue([]);
    repository.count.mockResolvedValue(0);
    repository.get.mockResolvedValue(undefined);
    repository.importTrain.mockResolvedValue(undefined);
    await TestBed.configureTestingModule({
      imports: [TrainsPage],
      providers: [
        provideRouter([]),
        { provide: TrainRepositoryService, useValue: repository },
        { provide: LocalFileService, useValue: files },
        { provide: AppPlatformService, useValue: { isWeb: () => web, isAndroid: () => !web } },
      ],
    }).compileComponents();
  });
  it('renders the empty state and accessible CSV/template actions', async () => {
    const fixture = TestBed.createComponent(TrainsPage);
    await fixture.componentInstance.ionViewWillEnter();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No trains saved yet');
    expect(fixture.nativeElement.textContent).toContain('How to prepare the CSV');
    expect(fixture.nativeElement.textContent).toContain('Restore Train Backup');
    const input = fixture.nativeElement.querySelector('input[type=file]') as HTMLInputElement;
    expect(input.getAttribute('aria-label')).toBe('Import train CSV');
    const choose = vi.spyOn(input, 'click');
    (fixture.nativeElement.querySelector('ion-button') as HTMLElement).click();
    expect(choose).toHaveBeenCalledOnce();
    fixture.componentInstance.downloadTemplate();
    expect(files.download).toHaveBeenCalledWith(
      trainCsvTemplate(),
      'metropocket-train-template.csv',
      expect.stringContaining('text/csv'),
    );
    expect(fixture.nativeElement.textContent).toContain('Example data demonstrates the CSV format only');
  });
  it('previews a CSV without saving; Import saves and refreshes the list', async () => {
    const fixture = TestBed.createComponent(TrainsPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    await page.prepareCsv(textFile(trainCsvTemplate()));
    fixture.detectChanges();
    expect(repository.importTrain).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Import preview');
    expect(fixture.nativeElement.textContent).toContain('99999');
    expect(fixture.nativeElement.textContent).toContain('Daily');
    expect(fixture.nativeElement.textContent).toContain('Arrive 00:30');
    expect(fixture.nativeElement.textContent).toContain('+1 day');
    await page.importPreview();
    expect(repository.importTrain).toHaveBeenCalledWith(expect.objectContaining({ trainNumber: '99999' }), false);
    expect(page.preview()).toBeNull();
    expect(repository.list).toHaveBeenCalled();
  });
  it('Cancel discards a preview without changing user data', async () => {
    const fixture = TestBed.createComponent(TrainsPage);
    await fixture.componentInstance.prepareCsv(textFile(trainCsvTemplate()));
    fixture.componentInstance.cancelPreview();
    expect(fixture.componentInstance.preview()).toBeNull();
    expect(repository.importTrain).not.toHaveBeenCalled();
  });
  it('existing trains require the explicit Replace Schedule preview action', async () => {
    repository.get.mockResolvedValue(sampleTrain('99999'));
    const fixture = TestBed.createComponent(TrainsPage);
    const page = fixture.componentInstance;
    await page.prepareCsv(textFile(trainCsvTemplate()));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Train 99999 already exists');
    expect(fixture.nativeElement.textContent).toContain('Replace Schedule');
    expect(repository.importTrain).not.toHaveBeenCalled();
    await page.importPreview();
    expect(repository.importTrain).toHaveBeenCalledWith(expect.objectContaining({ trainNumber: '99999' }), true);
  });
  it('does not silently replace a train added after preview, and keeps preview on save failure', async () => {
    repository.importTrain.mockRejectedValueOnce(new TrainAlreadyExistsError('99999'));
    const fixture = TestBed.createComponent(TrainsPage);
    const page = fixture.componentInstance;
    await page.prepareCsv(textFile(trainCsvTemplate()));
    await page.importPreview();
    expect(page.existing()).toBe(true);
    expect(page.preview()).not.toBeNull();
    expect(repository.importTrain).toHaveBeenCalledTimes(1);
    expect(page.status()).toBe('');
  });
  it('renders saved trains and the quiet missing-name fallback, then searches local SQL', async () => {
    const train = sampleTrain();
    delete train.trainName;
    repository.list.mockResolvedValue([{ ...train, stopCount: 3 }]);
    repository.count.mockResolvedValue(1);
    repository.trainCount.set(1);
    const fixture = TestBed.createComponent(TrainsPage);
    const page = fixture.componentInstance;
    await page.ionViewWillEnter();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Train name not provided');
    expect(fixture.nativeElement.textContent).toContain('Daily · 3 stops');
    expect(fixture.nativeElement.querySelector('.train').getAttribute('href')).toBe('/trains/00123');
    repository.list.mockResolvedValue([]);
    await page.changeSearch('station');
    fixture.detectChanges();
    expect(repository.list).toHaveBeenLastCalledWith('station');
    expect(fixture.nativeElement.textContent).toContain('No saved trains match');
  });
  it('limits visible validation errors and never saves an invalid CSV', async () => {
    const text =
      'train_number,station_name,departure_time\n' +
      Array.from({ length: 15 }, (_, index) => `${index ? '' : '99999'},,bad`).join('\n');
    const fixture = TestBed.createComponent(TrainsPage);
    await fixture.componentInstance.prepareCsv(textFile(text));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('[role=alert] li')).toHaveLength(10);
    expect(fixture.nativeElement.textContent).toContain('more errors');
    expect(fixture.componentInstance.preview()).toBeNull();
    expect(repository.importTrain).not.toHaveBeenCalled();
  });
  it('rejects oversized files without reading them', async () => {
    const file = textFile('not read');
    Object.defineProperty(file, 'size', { value: MAX_TRAIN_CSV_BYTES + 1 });
    const read = vi.spyOn(file, 'text');
    const fixture = TestBed.createComponent(TrainsPage);
    await fixture.componentInstance.prepareCsv(file);
    expect(read).not.toHaveBeenCalled();
    expect(fixture.componentInstance.issues()[0]).toContain('2 MB');
  });
  it('does not describe unreadable storage as an empty train collection', async () => {
    repository.list.mockRejectedValueOnce(new Error('Future schema'));
    const fixture = TestBed.createComponent(TrainsPage);
    await fixture.componentInstance.ionViewWillEnter();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Your stored data has not been changed');
    expect(fixture.nativeElement.textContent).not.toContain('No trains saved yet');
  });
  it('Android renders no CSV input, import/template/guide actions or CSV help, and gates direct calls', async () => {
    web = false;
    const fixture = TestBed.createComponent(TrainsPage);
    await fixture.componentInstance.ionViewWillEnter();
    fixture.detectChanges();
    const content = fixture.nativeElement.textContent as string;
    expect(content).toContain('No train schedules on this device');
    expect(content).toContain('Restore Train Backup');
    expect(content).not.toContain('CSV');
    expect(fixture.nativeElement.querySelector('input[type=file]')).toBeNull();
    const file = textFile(trainCsvTemplate());
    const read = vi.spyOn(file, 'text');
    await fixture.componentInstance.prepareCsv(file);
    fixture.componentInstance.downloadTemplate();
    expect(read).not.toHaveBeenCalled();
    expect(files.download).not.toHaveBeenCalled();
    expect(repository.importTrain).not.toHaveBeenCalled();
  });
  it('populated Web trains retain a subtle guide link and react to repository changes', async () => {
    repository.trainCount.set(1);
    repository.list.mockResolvedValue([{ ...sampleTrain(), stopCount: 3 }]);
    const fixture = TestBed.createComponent(TrainsPage);
    await fixture.componentInstance.ionViewWillEnter();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a[href="/train-guide"]')).not.toBeNull();
    repository.list.mockResolvedValue([]);
    repository.trainCount.set(0);
    repository.changes.update(value => value + 1);
    fixture.detectChanges();
    await fixture.whenStable();
    await vi.waitFor(() => expect(fixture.componentInstance.loading()).toBe(false));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No trains saved yet');
  });
});
