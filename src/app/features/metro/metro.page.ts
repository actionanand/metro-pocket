import { Component, computed, inject, signal } from '@angular/core';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonNote,
  IonSearchbar,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { RouterLink } from '@angular/router';
import { addIcons } from 'ionicons';
import { swapVerticalOutline, trainOutline } from 'ionicons/icons';
import { PackStorageService } from '../../core/data-packs/pack-storage.service';
import { hasInstalledPackType } from '../../core/data-packs/pack-availability';

@Component({
  selector: 'app-metro',
  imports: [
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonNote,
    IonSearchbar,
    IonTitle,
    IonToolbar,
    RouterLink,
  ],
  templateUrl: 'metro.page.html',
  styleUrls: ['metro.page.scss'],
})
export class MetroPage {
  private readonly storage = inject(PackStorageService);
  readonly dataAvailable = signal(false);
  readonly routeDataReady = signal(false);
  readonly from = signal('');
  readonly to = signal('');
  readonly hasSelection = computed(() => this.routeDataReady() && Boolean(this.from().trim() && this.to().trim()));
  constructor() {
    addIcons({ swapVerticalOutline, trainOutline });
  }
  swap(): void {
    const from = this.from();
    this.from.set(this.to());
    this.to.set(from);
  }
  async ionViewWillEnter(): Promise<void> {
    const packs = await this.storage.installed();
    this.dataAvailable.set(hasInstalledPackType(packs, 'metro'));
  }
}
