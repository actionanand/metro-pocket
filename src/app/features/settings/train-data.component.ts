import { Component, ElementRef, computed, inject, signal, viewChild, type OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { AlertController, IonButton } from '@ionic/angular';
import { TrainRepositoryService } from '../../core/trains/train-repository.service';
import { TrainBackupFilesService, type SelectedTrainBackup } from '../../core/trains/train-backup-files.service';
import { TrainValidationError } from '../../core/trains/train-validation';
import type { TrainRestorePreview } from '../../shared/models/train.models';

@Component({
  selector: 'app-train-data',
  imports: [DatePipe, IonButton],
  templateUrl: './train-data.component.html',
  styleUrls: ['./train-data.component.scss'],
})
export class TrainDataComponent implements OnInit {
  private readonly repository = inject(TrainRepositoryService);
  private readonly files = inject(TrainBackupFilesService);
  private readonly alerts = inject(AlertController);
  private readonly previewPanel = viewChild<ElementRef<HTMLElement>>('previewPanel');
  private readonly title = viewChild<ElementRef<HTMLElement>>('title');
  readonly count = this.repository.trainCount.asReadonly();
  readonly countError = computed(() => !!this.repository.stateError());
  readonly busy = signal(false);
  readonly issues = signal<string[]>([]);
  readonly status = signal('');
  readonly preview = signal<(TrainRestorePreview & { filename: string }) | null>(null);
  readonly visibleIssues = computed(() => this.issues().slice(0, 10));
  readonly remainingIssues = computed(() => Math.max(0, this.issues().length - 10));

  ngOnInit(): void {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    try {
      await this.repository.count();
    } catch (cause) {
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
      const filename = `metropocket-trains-backup-${(backup.exportedAt ?? new Date().toISOString()).slice(0, 10)}.db`;
      const result = await this.files.save(backup.bytes, filename);
      this.status.set(
        result === 'cancelled'
          ? 'Train backup export cancelled.'
          : result === 'downloaded'
            ? 'Train backup download started.'
            : result === 'shared'
              ? 'Train backup shared.'
              : 'Train backup saved.',
      );
    } catch (cause) {
      this.showError(cause);
    } finally {
      this.busy.set(false);
    }
  }

  async chooseBackup(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.preview.set(null);
    this.issues.set([]);
    this.status.set('');
    try {
      const file = await this.files.choose();
      if (file) await this.prepareCandidate(file);
      else this.status.set('Train backup selection cancelled.');
    } catch (cause) {
      this.showError(cause);
    } finally {
      this.busy.set(false);
    }
  }

  cancelPreview(): void {
    this.preview.set(null);
    requestAnimationFrame(() => this.title()?.nativeElement.focus());
  }

  async restoreBackup(): Promise<void> {
    const preview = this.preview();
    if (!preview || this.busy()) return;
    this.busy.set(true);
    this.issues.set([]);
    this.status.set('');
    try {
      const current = this.count() ?? preview.currentCount;
      const warning = current
        ? `This device currently contains ${current} trains. Restoring this backup will replace the existing Train data on this device.`
        : 'This will restore the complete Train database on this device.';
      if (
        !(await this.confirm(
          'Restore Train Backup?',
          `This backup contains ${preview.trainCount} trains and ${preview.stopCount} station stops. ${warning}`,
          current ? 'Replace & Restore' : 'Restore',
        ))
      )
        return;
      await this.repository.restoreBackup(preview);
      this.cancelPreview();
      this.status.set('Train backup restored on this device.');
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
          'This cannot be undone unless you previously exported a Train backup. Metro and TV packs are not affected.',
          'Delete All',
        ))
      )
        return;
      await this.repository.deleteAll();
      this.cancelPreview();
      this.status.set('All saved train schedules deleted from this device.');
    } catch (cause) {
      this.showError(cause);
    } finally {
      this.busy.set(false);
    }
  }

  private async prepareCandidate(file: SelectedTrainBackup): Promise<void> {
    const backup = await this.repository.previewBackup(file.bytes);
    this.preview.set({ ...backup, filename: file.filename });
    requestAnimationFrame(() => this.previewPanel()?.nativeElement.focus());
  }

  private async confirm(header: string, message: string, action: string): Promise<boolean> {
    const alert = await this.alerts.create({
      header,
      message,
      htmlAttributes: { role: 'dialog', 'aria-modal': 'true' },
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
