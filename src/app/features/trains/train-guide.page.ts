import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular';
import { TrainCsvService } from '../../core/trains/train-csv.service';
import { trainCsvTemplate } from '../../core/trains/train-csv';

@Component({
  selector: 'app-train-guide',
  imports: [RouterLink, IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar],
  templateUrl: './train-guide.page.html',
  styleUrls: ['./train-guide.page.scss'],
})
export class TrainGuidePage {
  private readonly csv = inject(TrainCsvService);
  readonly sample = trainCsvTemplate();
  readonly status = signal('');
  readonly error = signal('');

  downloadTemplate(): void {
    this.error.set('');
    try {
      this.csv.downloadTemplate();
      this.status.set('CSV template download started.');
    } catch (cause) {
      this.error.set(cause instanceof Error ? cause.message : 'Unable to download the template.');
    }
  }
}
