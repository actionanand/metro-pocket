import { Component, computed, inject, type OnInit } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { IonButton, IonContent, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  arrowForwardOutline,
  cloudDownloadOutline,
  settingsOutline,
  trainOutline,
  tvOutline,
  trainSharp,
} from 'ionicons/icons';
import { RouterLink } from '@angular/router';
import { AppPlatformService } from '../core/platform/app-platform.service';
import { TrainRepositoryService } from '../core/trains/train-repository.service';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [NgOptimizedImage, IonButton, IonContent, IonIcon, RouterLink],
})
export class HomePage implements OnInit {
  protected readonly platform = inject(AppPlatformService);
  private readonly trains = inject(TrainRepositoryService);
  readonly showTrains = computed(() => this.platform.isWeb() || (this.trains.trainCount() ?? 0) > 0);
  constructor() {
    addIcons({ arrowForwardOutline, cloudDownloadOutline, settingsOutline, trainOutline, tvOutline, trainSharp });
  }
  ngOnInit(): void {
    void this.ionViewWillEnter();
  }
  async ionViewWillEnter(): Promise<void> {
    if (!this.platform.isWeb()) {
      try {
        await this.trains.count();
      } catch {
        /* Settings shows storage errors without presenting CSV creation. */
      }
    }
  }
}
