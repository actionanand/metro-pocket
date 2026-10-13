import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonSearchbar,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { TrainRepositoryService, TrainAlreadyExistsError } from '../../core/trains/train-repository.service';
import { LocalFileService } from '../../core/trains/local-file.service';
import { MAX_TRAIN_CSV_BYTES, parseTrainCsv, trainCsvTemplate } from '../../core/trains/train-csv';
import { TrainValidationError } from '../../core/trains/train-validation';
import {
  dayOffsetLabel,
  runningDaysLabel,
  type SavedTrainSummary,
  type TrainSchedule,
  type TrainStop,
} from '../../shared/models/train.models';

@Component({
  selector: 'app-trains',
  imports: [
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonSearchbar,
    IonTitle,
    IonToolbar,
    RouterLink,
  ],
  templateUrl: './trains.page.html',
  styleUrls: ['./trains.page.scss'],
})
export class TrainsPage {
  private readonly repository = inject(TrainRepositoryService);
  private readonly files = inject(LocalFileService);
  private readonly previewPanel = viewChild<ElementRef<HTMLElement>>('previewPanel');
  private readonly title = viewChild<ElementRef<HTMLElement>>('title');
  readonly trains = signal<SavedTrainSummary[]>([]);
  readonly total = signal(0);
  readonly search = signal('');
  readonly loading = signal(true);
  readonly storageError = signal(false);
  readonly busy = signal(false);
  readonly issues = signal<string[]>([]);
  readonly status = signal('');
  readonly preview = signal<TrainSchedule | null>(null);
  readonly existing = signal(false);
  readonly visibleIssues = computed(() => this.issues().slice(0, 10));
  readonly remainingIssues = computed(() => Math.max(0, this.issues().length - 10));
  readonly firstStop = computed(() => this.preview()?.stops[0]);
  readonly lastStop = computed(() => this.preview()?.stops.at(-1));
  readonly daysLabel = runningDaysLabel;
  private request = 0;

  async ionViewWillEnter(): Promise<void> {
    await this.load();
  }

  async changeSearch(value: string | null | undefined): Promise<void> {
    this.search.set(value ?? '');
    await this.load();
  }

  async selectCsv(event: Event): Promise<void> {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const file = input.files?.[0];
    input.value = '';
    if (file) await this.prepareCsv(file);
  }

  async prepareCsv(file: File): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.cancelPreview();
    this.status.set('');
    this.issues.set([]);
    try {
      if (file.size > MAX_TRAIN_CSV_BYTES)
        throw new TrainValidationError(['CSV is too large. Choose a file of at most 2 MB.']);
      const schedule = parseTrainCsv(await file.text());
      this.existing.set(!!(await this.repository.get(schedule.trainNumber)));
      this.preview.set(schedule);
      requestAnimationFrame(() => this.previewPanel()?.nativeElement.focus());
    } catch (cause) {
      this.showError(cause);
    } finally {
      this.busy.set(false);
    }
  }

  cancelPreview(): void {
    this.preview.set(null);
    this.existing.set(false);
    requestAnimationFrame(() => this.title()?.nativeElement.focus());
  }

  async importPreview(): Promise<void> {
    const schedule = this.preview();
    if (!schedule || this.busy()) return;
    this.busy.set(true);
    this.issues.set([]);
    try {
      await this.repository.importTrain(schedule, this.existing());
      this.cancelPreview();
      this.status.set(`Train ${schedule.trainNumber} saved on this device.`);
      await this.load();
    } catch (cause) {
      if (cause instanceof TrainAlreadyExistsError) this.existing.set(true);
      this.showError(cause);
    } finally {
      this.busy.set(false);
    }
  }

  downloadTemplate(): void {
    try {
      this.files.download(trainCsvTemplate(), 'metropocket-train-template.csv', 'text/csv;charset=utf-8');
      this.status.set('CSV template download started. Example data demonstrates the CSV format only.');
    } catch (cause) {
      this.showError(cause);
    }
  }

  stopSummary(stop: TrainStop, arrivalFirst = false): string {
    const time =
      stop.arrivalTime && (arrivalFirst || !stop.departureTime)
        ? `Arrive ${stop.arrivalTime}`
        : `Depart ${stop.departureTime}`;
    return [stop.stationName, time, dayOffsetLabel(stop.dayOffset)].filter(Boolean).join(' · ');
  }

  private async load(): Promise<void> {
    const request = ++this.request;
    this.loading.set(true);
    this.storageError.set(false);
    try {
      const [trains, total] = await Promise.all([this.repository.list(this.search()), this.repository.count()]);
      if (request !== this.request) return;
      this.trains.set(trains);
      this.total.set(total);
    } catch (cause) {
      if (request === this.request) {
        this.storageError.set(true);
        this.showError(cause);
      }
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }

  private showError(cause: unknown): void {
    this.issues.set(
      cause instanceof TrainValidationError
        ? cause.issues
        : [cause instanceof Error ? cause.message : 'Unable to use saved trains. Please retry.'],
    );
  }
}
