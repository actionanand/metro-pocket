import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  AlertController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { TrainRepositoryService } from '../../core/trains/train-repository.service';
import { dayOffsetLabel, runningDaysLabel, type UserTrain } from '../../shared/models/train.models';

@Component({
  selector: 'app-train-detail',
  imports: [IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar],
  templateUrl: './train-detail.page.html',
  styleUrls: ['./train-detail.page.scss'],
})
export class TrainDetailPage {
  private readonly repository = inject(TrainRepositoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly alerts = inject(AlertController);
  readonly train = signal<UserTrain | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly daysLabel = runningDaysLabel;
  readonly offsetLabel = dayOffsetLabel;

  async ionViewWillEnter(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    this.train.set(null);
    try {
      this.train.set((await this.repository.get(this.route.snapshot.paramMap.get('trainNumber') ?? '')) ?? null);
    } catch (cause) {
      this.error.set(cause instanceof Error ? cause.message : 'Unable to load this train.');
    } finally {
      this.loading.set(false);
    }
  }

  async deleteTrain(): Promise<void> {
    const train = this.train();
    if (!train || this.busy()) return;
    this.busy.set(true);
    try {
      const alert = await this.alerts.create({
        header: `Delete train ${train.trainNumber}?`,
        htmlAttributes: { role: 'dialog', 'aria-modal': 'true' },
        message: 'This removes its local schedule from this device.',
        buttons: [
          { text: 'Cancel', role: 'cancel' },
          { text: 'Delete', role: 'confirm' },
        ],
      });
      await alert.present();
      const result = await alert.onDidDismiss();
      if (result.role !== 'confirm') return;
      await this.repository.deleteTrain(train.trainNumber);
      await this.router.navigateByUrl('/trains');
    } catch (cause) {
      this.error.set(cause instanceof Error ? cause.message : 'Unable to delete this train.');
    } finally {
      this.busy.set(false);
    }
  }
}
