import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { RouterLink, provideRouter } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { SettingsPage } from './settings.page';
import { TrainDataComponent } from './train-data.component';
import { TrainRepositoryService } from '../../core/trains/train-repository.service';
import { TrainBackupFilesService } from '../../core/trains/train-backup-files.service';
import { AppPlatformService } from '../../core/platform/app-platform.service';

describe('Settings Train DB backups', () => {
  let web = true;
  const bytes = new TextEncoder().encode('SQLite format 3\0').buffer;
  const backup = { bytes, trainCount: 1, stopCount: 3, exportedAt: '2026-10-13T12:00:00.000Z' };
  const candidate = { ...backup, currentCount: 3, currentRevision: 1 };
  const repository = {
    trainCount: signal<number | null>(3),
    stateError: signal(''),
    changes: signal(0),
    count: vi.fn(),
    exportBackup: vi.fn(),
    previewBackup: vi.fn(),
    restoreBackup: vi.fn(),
    deleteAll: vi.fn(),
  };
  const files = { save: vi.fn(), choose: vi.fn() };
  const alert = { present: vi.fn(), onDidDismiss: vi.fn() };
  const alerts = { create: vi.fn() };
  beforeEach(async () => {
    vi.clearAllMocks();
    web = true;
    repository.trainCount.set(3);
    repository.stateError.set('');
    repository.changes.set(0);
    repository.count.mockImplementation(async () => repository.trainCount() ?? 0);
    repository.exportBackup.mockResolvedValue(backup);
    repository.previewBackup.mockResolvedValue(candidate);
    repository.restoreBackup.mockImplementation(async () => {
      repository.trainCount.set(1);
      repository.changes.update(value => value + 1);
    });
    repository.deleteAll.mockImplementation(async () => {
      repository.trainCount.set(0);
      repository.changes.update(value => value + 1);
    });
    files.save.mockResolvedValue('downloaded');
    files.choose.mockResolvedValue({ filename: 'chosen.db', bytes });
    alerts.create.mockResolvedValue(alert);
    alert.onDidDismiss.mockResolvedValue({ role: 'cancel' });
    await TestBed.configureTestingModule({
      imports: [SettingsPage],
      providers: [
        provideRouter([]),
        { provide: TrainRepositoryService, useValue: repository },
        { provide: TrainBackupFilesService, useValue: files },
        { provide: AlertController, useValue: alerts },
        { provide: AppPlatformService, useValue: { isWeb: () => web, isAndroid: () => !web } },
      ],
    }).compileComponents();
  });
  async function setup() {
    const fixture = TestBed.createComponent(SettingsPage);
    fixture.detectChanges();
    await fixture.componentInstance.ionViewWillEnter();
    fixture.detectChanges();
    const panel = fixture.debugElement.query(By.directive(TrainDataComponent)).componentInstance as TrainDataComponent;
    return { fixture, panel };
  }
  it('shows the shared count and Web guide link alongside existing settings', async () => {
    const { fixture } = await setup();
    expect(fixture.nativeElement.textContent).toContain('3 trains saved locally');
    expect(fixture.nativeElement.textContent).toContain('Theme');
    expect(fixture.nativeElement.textContent).toContain('Offline data');
    expect(fixture.nativeElement.textContent).toContain('Train CSV Guide');
    const links = fixture.debugElement
      .queryAll(By.directive(RouterLink))
      .map(link => link.injector.get(RouterLink).urlTree?.toString());
    expect(links).toContain('/train-guide');
    repository.trainCount.set(5);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('5 trains saved locally');
  });
  it('Android never shows the guide, CSV/template controls or a Web picker', async () => {
    web = false;
    const { fixture } = await setup();
    expect(fixture.nativeElement.textContent).not.toContain('Train CSV Guide');
    expect(fixture.nativeElement.textContent).not.toContain('Import Train CSV');
    expect(fixture.nativeElement.textContent).not.toContain('Download CSV Template');
    expect(fixture.nativeElement.querySelector('input[type=file]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Restore Train Backup');
  });
  it('keeps Restore enabled with zero saved trains on either platform', async () => {
    repository.trainCount.set(0);
    for (const isWeb of [true, false]) {
      web = isWeb;
      const { fixture } = await setup();
      const buttons = Array.from(
        fixture.nativeElement.querySelectorAll('app-train-data ion-button'),
      ) as HTMLIonButtonElement[];
      expect(buttons.find(button => button.textContent?.includes('Restore Train Backup'))!.disabled).toBe(false);
      expect(buttons.find(button => button.textContent?.includes('Export Train Backup'))!.disabled).toBe(true);
      fixture.destroy();
    }
  });
  it.each([true, false])('exports a dated raw DB through the platform file abstraction (Web=%s)', async isWeb => {
    web = isWeb;
    const { panel } = await setup();
    await panel.exportBackup();
    expect(files.save).toHaveBeenCalledWith(bytes, 'metropocket-trains-backup-2026-10-13.db');
  });
  it('previews filename, counts and export time without writing or offering JSON/merge modes', async () => {
    const { fixture, panel } = await setup();
    await panel.chooseBackup();
    fixture.detectChanges();
    expect(repository.previewBackup).toHaveBeenCalledWith(bytes);
    expect(repository.restoreBackup).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('chosen.db');
    expect(fixture.nativeElement.textContent).toContain('Station stops');
    expect(fixture.nativeElement.textContent).toContain('Current device');
    expect(fixture.nativeElement.textContent).toContain('replace the existing Train data');
    expect(fixture.nativeElement.textContent).not.toContain('Merge');
    expect(fixture.nativeElement.querySelector('select')).toBeNull();
  });
  it('cancelling preview or overwrite confirmation preserves current trains', async () => {
    const { panel } = await setup();
    await panel.chooseBackup();
    panel.cancelPreview();
    expect(repository.restoreBackup).not.toHaveBeenCalled();
    await panel.chooseBackup();
    await panel.restoreBackup();
    expect(repository.restoreBackup).not.toHaveBeenCalled();
    expect(panel.preview()).not.toBeNull();
    expect(repository.trainCount()).toBe(3);
    expect(alerts.create).toHaveBeenCalledWith(
      expect.objectContaining({
        header: 'Restore Train Backup?',
        message: expect.stringContaining('replace the existing Train data'),
        htmlAttributes: { role: 'dialog', 'aria-modal': 'true' },
        buttons: expect.arrayContaining([{ text: 'Replace & Restore', role: 'confirm' }]),
      }),
    );
  });
  it('confirmed full restore synchronizes the count and removes the preview', async () => {
    const { panel } = await setup();
    await panel.chooseBackup();
    alert.onDidDismiss.mockResolvedValue({ role: 'confirm' });
    await panel.restoreBackup();
    expect(repository.restoreBackup).toHaveBeenCalledWith(expect.objectContaining(candidate));
    expect(panel.preview()).toBeNull();
    expect(panel.count()).toBe(1);
    expect(panel.status()).toContain('restored');
  });
  it('empty devices still require restore confirmation', async () => {
    repository.trainCount.set(0);
    const { panel } = await setup();
    repository.previewBackup.mockResolvedValue({ ...candidate, currentCount: 0, currentRevision: 0 });
    await panel.chooseBackup();
    await panel.restoreBackup();
    expect(repository.restoreBackup).not.toHaveBeenCalled();
    expect(alerts.create).toHaveBeenCalledWith(
      expect.objectContaining({ buttons: expect.arrayContaining([{ text: 'Restore', role: 'confirm' }]) }),
    );
  });
  it('delete-all requires confirmation and uses the shared reactive count', async () => {
    const { panel } = await setup();
    await panel.deleteAll();
    expect(repository.deleteAll).not.toHaveBeenCalled();
    alert.onDidDismiss.mockResolvedValue({ role: 'confirm' });
    await panel.deleteAll();
    expect(repository.deleteAll).toHaveBeenCalledOnce();
    expect(panel.count()).toBe(0);
  });
  it('invalid DB files cannot reach a restore confirmation', async () => {
    const { fixture, panel } = await setup();
    repository.previewBackup.mockRejectedValueOnce(new Error('Invalid Train backup'));
    await panel.chooseBackup();
    fixture.detectChanges();
    expect(panel.preview()).toBeNull();
    expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain('Invalid Train backup');
    expect(repository.restoreBackup).not.toHaveBeenCalled();
    expect(alerts.create).not.toHaveBeenCalled();
  });
  it('failed restore keeps the preview/count and does not claim success', async () => {
    const { panel } = await setup();
    await panel.chooseBackup();
    repository.restoreBackup.mockRejectedValueOnce(new Error('Post-write validation failed'));
    alert.onDidDismiss.mockResolvedValue({ role: 'confirm' });
    await panel.restoreBackup();
    expect(panel.preview()).not.toBeNull();
    expect(panel.count()).toBe(3);
    expect(panel.status()).toBe('');
    expect(panel.issues()).toEqual(['Post-write validation failed']);
  });
  it('cancelled file selection leaves current data unchanged', async () => {
    const { panel } = await setup();
    files.choose.mockResolvedValueOnce(undefined);
    await panel.chooseBackup();
    expect(panel.preview()).toBeNull();
    expect(repository.restoreBackup).not.toHaveBeenCalled();
  });
});
