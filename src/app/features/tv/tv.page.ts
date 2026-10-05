import { Component, inject, signal } from '@angular/core';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonSearchbar,
  IonSelect,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { RouterLink } from '@angular/router';
import { addIcons } from 'ionicons';
import { tvOutline } from 'ionicons/icons';
import { PackStorageService } from '../../core/data-packs/pack-storage.service';
import { hasInstalledPackType } from '../../core/data-packs/pack-availability';
@Component({
  selector: 'app-tv',
  imports: [
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonItem,
    IonLabel,
    IonSearchbar,
    IonSelect,
    IonTitle,
    IonToolbar,
    RouterLink,
  ],
  templateUrl: 'tv.page.html',
  styleUrls: ['tv.page.scss'],
})
export class TvPage {
  private readonly storage = inject(PackStorageService);
  readonly dataAvailable = signal(false);
  readonly channelDataReady = signal(false);
  readonly query = signal('');
  constructor() {
    addIcons({ tvOutline });
  }
  async ionViewWillEnter(): Promise<void> {
    const packs = await this.storage.installed();
    this.dataAvailable.set(hasInstalledPackType(packs, 'tv'));
  }
}
