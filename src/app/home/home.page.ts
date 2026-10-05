import { Component } from '@angular/core';
import { IonButton, IonContent, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowForwardOutline, cloudDownloadOutline, settingsOutline, trainOutline, tvOutline } from 'ionicons/icons';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [IonButton, IonContent, IonIcon, RouterLink],
})
export class HomePage {
  constructor() {
    addIcons({ arrowForwardOutline, cloudDownloadOutline, settingsOutline, trainOutline, tvOutline });
  }
}
