import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { SettingsPage } from './settings.page';
import { TrainDataComponent } from './train-data.component';
import { TrainRepositoryService } from '../../core/trains/train-repository.service';
import { LocalFileService } from '../../core/trains/local-file.service';
import { createTrainBackup } from '../../core/trains/train-backup';
import { sampleTrain, textFile } from '../../core/trains/train-test-fixtures';

describe('Settings private train data', () => {
  const repository = {
    count: vi.fn(),
    exportBackup: vi.fn(),
    previewBackup: vi.fn(),
    restoreBackup: vi.fn(),
    deleteAll: vi.fn(),
  };
  const files = { download: vi.fn() };
  const alert = { present: vi.fn(), onDidDismiss: vi.fn() };
  const alerts = { create: vi.fn() };
  beforeEach(async () => {
    vi.clearAllMocks();
    repository.count.mockResolvedValue(3);
    repository.exportBackup.mockResolvedValue(createTrainBackup([sampleTrain()], '2026-10-13T12:00:00.000Z'));
    repository.previewBackup.mockResolvedValue({ existing: 1, added: 0 });
    alerts.create.mockResolvedValue(alert);
    alert.onDidDismiss.mockResolvedValue({ role: 'cancel' });
    await TestBed.configureTestingModule({
      imports: [SettingsPage],
      providers: [
        provideRouter([]),
        { provide: TrainRepositoryService, useValue: repository },
        { provide: LocalFileService, useValue: files },
        { provide: AlertController, useValue: alerts },
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
  it('shows the count with existing Theme, Offline data and About controls', async () => {
    const { fixture } = await setup();
    expect(fixture.nativeElement.textContent).toContain('3 trains saved locally');
    expect(fixture.nativeElement.textContent).toContain('Theme');
    expect(fixture.nativeElement.textContent).toContain('Offline data');
    expect(fixture.nativeElement.textContent).toContain('About, privacy');
  });
  it('exports a local dated JSON backup', async () => {
    const { panel } = await setup();
    await panel.exportBackup();
    expect(files.download).toHaveBeenCalledWith(
      expect.stringContaining('"format": "metropocket-trains"'),
      'metropocket-trains-backup-2026-10-13.json',
      'application/json',
    );
  });
  it('opens the labelled file input and previews a backup before any write', async () => {
    const { fixture, panel } = await setup();
    const input = fixture.nativeElement.querySelector('input[type=file]') as HTMLInputElement;
    const click = vi.spyOn(input, 'click');
    const buttons = Array.from(fixture.nativeElement.querySelectorAll('app-train-data ion-button')) as HTMLElement[];
    buttons.find(button => button.textContent?.includes('Import Train Backup'))!.click();
    expect(click).toHaveBeenCalledOnce();
    expect(input.getAttribute('aria-label')).toBe('Import train backup');
    const backup = createTrainBackup([sampleTrain()]);
    await panel.prepareBackup(textFile(JSON.stringify(backup), 'backup.json'));
    fixture.detectChanges();
    expect(repository.restoreBackup).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Train backup preview');
    expect(fixture.nativeElement.textContent).toContain('Existing trains that would be replaced');
    await panel.restoreBackup();
    expect(repository.restoreBackup).toHaveBeenCalledWith(backup, 'merge');
    expect(panel.preview()).toBeNull();
  });
  it('Cancel discards a backup preview without writing', async () => {
    const { panel } = await setup();
    await panel.prepareBackup(textFile(JSON.stringify(createTrainBackup([])), 'backup.json'));
    panel.cancelPreview();
    expect(repository.restoreBackup).not.toHaveBeenCalled();
  });
  it('replace-all requires confirmation and imports only after acceptance', async () => {
    const { panel } = await setup();
    const backup = createTrainBackup([sampleTrain()]);
    await panel.prepareBackup(textFile(JSON.stringify(backup), 'backup.json'));
    panel.mode.set('replace-all');
    await panel.restoreBackup();
    expect(repository.restoreBackup).not.toHaveBeenCalled();
    expect(panel.preview()).not.toBeNull();
    alert.onDidDismiss.mockResolvedValue({ role: 'confirm' });
    await panel.restoreBackup();
    expect(repository.restoreBackup).toHaveBeenCalledWith(backup, 'replace-all');
  });
  it('Delete All requires destructive confirmation and refreshes the count', async () => {
    const { panel } = await setup();
    await panel.deleteAll();
    expect(repository.deleteAll).not.toHaveBeenCalled();
    expect(alerts.create).toHaveBeenCalledWith(
      expect.objectContaining({
        header: 'Delete all saved train schedules?',
        message: expect.stringContaining('cannot be undone'),
      }),
    );
    alert.onDidDismiss.mockResolvedValue({ role: 'confirm' });
    repository.count.mockResolvedValue(0);
    await panel.deleteAll();
    expect(repository.deleteAll).toHaveBeenCalledOnce();
    expect(panel.count()).toBe(0);
  });
  it('invalid backups never show a save preview or write', async () => {
    const { fixture, panel } = await setup();
    await panel.prepareBackup(textFile('{bad', 'backup.json'));
    fixture.detectChanges();
    expect(panel.preview()).toBeNull();
    expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain('not valid JSON');
    expect(repository.restoreBackup).not.toHaveBeenCalled();
  });
  it('a persistence failure keeps the backup preview and does not claim success', async () => {
    const { panel } = await setup();
    await panel.prepareBackup(textFile(JSON.stringify(createTrainBackup([sampleTrain()])), 'backup.json'));
    repository.restoreBackup.mockRejectedValueOnce(new Error('Storage full'));
    await panel.restoreBackup();
    expect(panel.preview()).not.toBeNull();
    expect(panel.status()).toBe('');
    expect(panel.issues()).toEqual(['Storage full']);
  });
});
