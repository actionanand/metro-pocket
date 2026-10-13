import { Component, ElementRef, computed, inject, signal, viewChild, type OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { AlertController, IonButton } from '@ionic/angular';
import { TrainRepositoryService } from '../../core/trains/train-repository.service';
import { LocalFileService } from '../../core/trains/local-file.service';
import { MAX_TRAIN_BACKUP_BYTES, parseTrainBackup } from '../../core/trains/train-backup';
import { TrainValidationError } from '../../core/trains/train-validation';
import type { TrainBackup, TrainRestoreMode } from '../../shared/models/train.models';

@Component({
  selector: 'app-train-data',
  imports: [DatePipe, IonButton],
  templateUrl: './train-data.component.html',
  styleUrls: ['./train-data.component.scss'],
})
export class TrainDataComponent implements OnInit {
  private readonly repository = inject(TrainRepositoryService);
  private readonly files = inject(LocalFileService);
  private readonly alerts = inject(AlertController);
  private readonly previewPanel = viewChild<ElementRef<HTMLElement>>('previewPanel');
  private readonly title = viewChild<ElementRef<HTMLElement>>('title');
  readonly count = signal<number | null>(null);
  readonly countError = signal(false);
  readonly busy = signal(false);
  readonly issues = signal<string[]>([]);
  readonly status = signal('');
  readonly preview = signal<{ backup: TrainBackup; existing: number; added: number } | null>(null);
  readonly mode = signal<TrainRestoreMode>('merge');
  readonly visibleIssues = computed(() => this.issues().slice(0, 10));
  readonly remainingIssues = computed(() => Math.max(0, this.issues().length - 10));

  ngOnInit(): void {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.countError.set(false);
    try {
      this.count.set(await this.repository.count());
    } catch (cause) {
      this.countError.set(true);
      this.showError(cause);
    }
  }

  async exportBackup(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.issues.set([]);
    this.status.set('');
    try {
      const backup = await this.repository.exportBackup();
      this.files.download(
        JSON.stringify(backup, null, 2),
        `metropocket-trains-backup-${backup.exportedAt.slice(0, 10)}.json`,
        'application/json',
      );
      this.status.set('Train backup download started. Keep this private file safe to restore your schedules.');
    } catch (cause) {
      this.showError(cause);
    } finally {
      this.busy.set(false);
    }
  }

  async selectBackup(event: Event): Promise<void> {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const file = input.files?.[0];
    input.value = '';
    if (file) await this.prepareBackup(file);
  }

  async prepareBackup(file: File): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.preview.set(null);
    this.issues.set([]);
    this.status.set('');
    try {
      if (file.size > MAX_TRAIN_BACKUP_BYTES)
        throw new TrainValidationError(['Backup is too large. Choose a file of at most 20 MB.']);
      const backup = parseTrainBackup(await file.text());
      const counts = await this.repository.previewBackup(backup);
      this.mode.set('merge');
      this.preview.set({ backup, ...counts });
      requestAnimationFrame(() => this.previewPanel()?.nativeElement.focus());
    } catch (cause) {
      this.showError(cause);
    } finally {
      this.busy.set(false);
    }
  }

  changeMode(event: Event): void {
    const input = event.target;
    if (input instanceof HTMLSelectElement && (input.value === 'merge' || input.value === 'replace-all'))
      this.mode.set(input.value);
  }

  cancelPreview(): void {
    this.preview.set(null);
    requestAnimationFrame(() => this.title()?.nativeElement.focus());
  }

  async restoreBackup(): Promise<void> {
    const preview = this.preview();
    if (!preview || this.busy()) return;
    const mode = this.mode();
    this.busy.set(true);
    this.issues.set([]);
    try {
      if (
        mode === 'replace-all' &&
        !(await this.confirm(
          'Replace all saved train schedules?',
          'All current train schedules will be removed and replaced with this backup.',
          'Replace All',
        ))
      )
        return;
      await this.repository.restoreBackup(preview.backup, mode);
      this.cancelPreview();
      this.status.set('Train backup restored on this device.');
      await this.refresh();
    } catch (cause) {
      this.showError(cause);
    } finally {
      this.busy.set(false);
    }
  }

  async deleteAll(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.issues.set([]);
    this.status.set('');
    try {
      if (
        !(await this.confirm(
          'Delete all saved train schedules?',
          'This cannot be undone unless you previously exported a backup. Metro and TV packs are not affected.',
          'Delete All',
        ))
      )
        return;
      await this.repository.deleteAll();
      this.cancelPreview();
      this.status.set('All saved train schedules deleted from this device.');
      await this.refresh();
    } catch (cause) {
      this.showError(cause);
    } finally {
      this.busy.set(false);
    }
  }

  private async confirm(header: string, message: string, action: string): Promise<boolean> {
    const alert = await this.alerts.create({
      header,
      message,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: action, role: 'confirm' },
      ],
    });
    await alert.present();
    return (await alert.onDidDismiss()).role === 'confirm';
  }

  private showError(cause: unknown): void {
    this.issues.set(
      cause instanceof TrainValidationError
        ? cause.issues
        : [cause instanceof Error ? cause.message : 'Unable to use train data. Please retry.'],
    );
  }
}
