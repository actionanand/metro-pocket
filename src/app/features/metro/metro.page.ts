import { Component, computed, signal } from '@angular/core';
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
  readonly from = signal('');
  readonly to = signal('');
  readonly hasSelection = computed(() => Boolean(this.from().trim() && this.to().trim()));
  constructor() {
    addIcons({ swapVerticalOutline, trainOutline });
  }
  swap(): void {
    const from = this.from();
    this.from.set(this.to());
    this.to.set(from);
  }
}
