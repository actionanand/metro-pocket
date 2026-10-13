import { Component } from '@angular/core';
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

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [NgOptimizedImage, IonButton, IonContent, IonIcon, RouterLink],
})
export class HomePage {
  constructor() {
    addIcons({ arrowForwardOutline, cloudDownloadOutline, settingsOutline, trainOutline, tvOutline, trainSharp });
  }
}
