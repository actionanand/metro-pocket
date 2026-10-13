import { Component, inject, viewChild } from '@angular/core';
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
import { TrainDataComponent } from './train-data.component';
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
    TrainDataComponent,
  ],
  templateUrl: 'settings.page.html',
  styleUrls: ['settings.page.scss'],
})
export class SettingsPage {
  protected readonly theme = inject(ThemeService);
  private readonly trainData = viewChild(TrainDataComponent);
  async ionViewWillEnter(): Promise<void> {
    await this.trainData()?.refresh();
  }
  setTheme(value: string | number | undefined): void {
    if (value === 'system' || value === 'light' || value === 'dark') this.theme.set(value as ThemePreference);
  }
}
