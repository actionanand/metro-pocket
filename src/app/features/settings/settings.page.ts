import { Component, inject } from '@angular/core';
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonRadio,
  IonRadioGroup,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { RouterLink } from '@angular/router';
import { ThemeService, type ThemePreference } from '../../core/theme/theme.service';
@Component({
  selector: 'app-settings',
  imports: [
    IonBackButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonItem,
    IonLabel,
    IonList,
    IonRadio,
    IonRadioGroup,
    IonTitle,
    IonToolbar,
    RouterLink,
  ],
  templateUrl: 'settings.page.html',
  styleUrls: ['settings.page.scss'],
})
export class SettingsPage {
  protected readonly theme = inject(ThemeService);
  setTheme(value: string | number | undefined): void {
    if (value === 'system' || value === 'light' || value === 'dark') this.theme.set(value as ThemePreference);
  }
}
