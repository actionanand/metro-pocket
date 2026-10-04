import { Component, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import {
  IonAlert,
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonProgressBar,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { cloudDownloadOutline, refreshOutline, trashOutline, warningOutline } from 'ionicons/icons';
import { ManifestService } from '../../core/data-packs/manifest.service';
import { PackInstallerService } from '../../core/data-packs/pack-installer.service';
import { PackStorageService } from '../../core/data-packs/pack-storage.service';
import type { PackViewModel } from '../../shared/models/data-pack.models';
@Component({
  selector: 'app-offline-data',
  imports: [
    NgTemplateOutlet,
    IonAlert,
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonNote,
    IonProgressBar,
    IonSpinner,
    IonTitle,
    IonToolbar,
  ],
  templateUrl: 'offline-data.page.html',
  styleUrls: ['offline-data.page.scss'],
})
export class OfflineDataPage {
  private readonly manifestService = inject(ManifestService);
  protected readonly installer = inject(PackInstallerService);
  private readonly storage = inject(PackStorageService);
  readonly packs = signal<PackViewModel[]>([]);
  readonly loading = signal(false);
  readonly deleteTarget = signal<PackViewModel | null>(null);
  readonly error = this.manifestService.error;
  readonly metro = computed(() => this.packs().filter(pack => pack.type === 'metro'));
  readonly tv = computed(() => this.packs().filter(pack => pack.type === 'tv'));
  constructor() {
    addIcons({ cloudDownloadOutline, refreshOutline, trashOutline, warningOutline });
    void this.checkForUpdates();
  }
  async checkForUpdates(): Promise<void> {
    this.loading.set(true);
    const [manifest, installed] = await Promise.all([this.manifestService.refresh(), this.storage.installed()]);
    this.loading.set(false);
    if (!manifest) return;
    const metadata = new Map(installed.map(item => [item.id, item]));
    this.packs.set(
      manifest.packs.map(pack => {
        const current = metadata.get(pack.id);
        return {
          ...pack,
          installed: current,
          state: !current ? 'not-installed' : current.version < pack.version ? 'update-available' : 'installed',
        };
      }),
    );
  }
  async install(pack: PackViewModel): Promise<void> {
    this.packs.update(items => items.map(item => (item.id === pack.id ? { ...item, state: 'downloading' } : item)));
    try {
      await this.installer.install(pack);
      await this.checkForUpdates();
    } catch {
      this.packs.update(items =>
        items.map(item =>
          item.id === pack.id ? { ...item, state: 'failed', error: this.installer.failures()[pack.id] } : item,
        ),
      );
    }
  }
  requestDelete(pack: PackViewModel): void {
    this.deleteTarget.set(pack);
  }
  async delete(): Promise<void> {
    const pack = this.deleteTarget();
    if (pack) {
      await this.storage.delete(pack.id);
      await this.checkForUpdates();
    }
    this.deleteTarget.set(null);
  }
  progress(pack: PackViewModel): number {
    return (this.installer.progress()[pack.id] ?? 0) / 100;
  }
}
