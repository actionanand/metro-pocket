import { Component, signal } from '@angular/core';
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
  IonSelectOption,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { RouterLink } from '@angular/router';
import { addIcons } from 'ionicons';
import { tvOutline } from 'ionicons/icons';
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
    IonSelectOption,
    IonTitle,
    IonToolbar,
    RouterLink,
  ],
  templateUrl: 'tv.page.html',
  styleUrls: ['tv.page.scss'],
})
export class TvPage {
  readonly query = signal('');
  constructor() {
    addIcons({ tvOutline });
  }
}
