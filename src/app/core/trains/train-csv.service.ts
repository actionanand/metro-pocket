import { Service, inject } from '@angular/core';
import { AppPlatformService } from '../platform/app-platform.service';
import { LocalFileService } from './local-file.service';
import { MAX_TRAIN_CSV_BYTES, parseTrainCsv, trainCsvTemplate } from './train-csv';
import { TrainValidationError } from './train-validation';
import type { TrainSchedule } from '../../shared/models/train.models';

@Service()
export class TrainCsvService {
  private readonly platform = inject(AppPlatformService);
  private readonly files = inject(LocalFileService);

  async prepare(file: File): Promise<TrainSchedule> {
    this.requireWeb();
    if (file.size > MAX_TRAIN_CSV_BYTES)
      throw new TrainValidationError(['CSV is too large. Choose a file of at most 2 MB.']);
    return parseTrainCsv(await file.text());
  }

  downloadTemplate(): void {
    this.requireWeb();
    this.files.download(trainCsvTemplate(), 'metropocket-train-template.csv', 'text/csv;charset=utf-8');
  }

  private requireWeb(): void {
    if (!this.platform.isWeb()) throw new Error('Train CSV import and templates are available only on Web/PWA.');
  }
}
