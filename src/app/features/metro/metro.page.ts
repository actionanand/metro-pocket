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
import { MetroNetworkRepositoryService } from '../../core/database/metro-network-repository.service';
import { MetroRoutePlannerService } from '../../core/database/metro-route-planner.service';
import type { MetroNetwork, MetroStation, PlannedRoute } from '../../shared/models/metro.models';
import type { InstalledPack } from '../../shared/models/data-pack.models';

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
  private readonly repository = inject(MetroNetworkRepositoryService);
  private readonly planner = inject(MetroRoutePlannerService);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly packs = signal<InstalledPack[]>([]);
  readonly packId = signal('');
  readonly network = signal<MetroNetwork | null>(null);
  readonly dataAvailable = signal(false);
  readonly routeDataReady = signal(false);
  readonly from = signal('');
  readonly to = signal('');
  readonly fromId = signal('');
  readonly toId = signal('');
  readonly fromResults = signal<MetroStation[]>([]);
  readonly toResults = signal<MetroStation[]>([]);
  readonly route = signal<PlannedRoute | null>(null);
  readonly routeMessage = signal('');
  readonly hasSelection = computed(() => this.routeDataReady() && Boolean(this.fromId() && this.toId()));
  private loadRequest = 0;
  constructor() {
    addIcons({ swapVerticalOutline, trainOutline });
  }
  swap(): void {
    const from = this.from();
    const id = this.fromId();
    this.from.set(this.to());
    this.to.set(from);
    this.fromId.set(this.toId());
    this.toId.set(id);
    this.clearResult();
  }
  async ionViewWillEnter(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    this.routeDataReady.set(false);
    try {
      const packs = await this.repository.installed();
      this.packs.set(packs);
      this.dataAvailable.set(packs.length > 0);
      const selected = packs.find(pack => pack.id === this.packId()) ?? packs[0];
      if (selected) await this.load(selected.id);
      else {
        this.network.set(null);
        this.resetSelection();
      }
    } catch (cause) {
      this.error.set(this.message(cause));
    } finally {
      this.loading.set(false);
    }
  }
  async load(id: string): Promise<void> {
    const request = ++this.loadRequest;
    this.packId.set(id);
    this.loading.set(true);
    this.routeDataReady.set(false);
    this.error.set('');
    this.network.set(null);
    this.resetSelection();
    try {
      const pack = this.packs().find(item => item.id === id);
      if (!pack) throw new Error('The selected metro pack is no longer installed.');
      const network = await this.repository.load(pack);
      if (request === this.loadRequest) {
        this.network.set(network);
        this.routeDataReady.set(true);
      }
    } catch (cause) {
      if (request === this.loadRequest) this.error.set(this.message(cause));
    } finally {
      if (request === this.loadRequest) this.loading.set(false);
    }
  }
  changePack(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLSelectElement) void this.load(target.value);
  }
  search(field: 'from' | 'to', value: string | null | undefined): void {
    const term = value ?? '';
    const network = this.network();
    (field === 'from' ? this.from : this.to).set(term);
    (field === 'from' ? this.fromId : this.toId).set('');
    (field === 'from' ? this.fromResults : this.toResults).set(network ? this.planner.search(network, term) : []);
    this.route.set(null);
    this.routeMessage.set('');
  }
  select(field: 'from' | 'to', station: MetroStation): void {
    (field === 'from' ? this.from : this.to).set(station.name);
    (field === 'from' ? this.fromId : this.toId).set(station.id);
    (field === 'from' ? this.fromResults : this.toResults).set([]);
  }
  findRoute(): void {
    const network = this.network();
    if (!network || !this.hasSelection()) return;
    const route = this.planner.plan(network, this.fromId(), this.toId());
    this.route.set(route);
    this.routeMessage.set(route ? '' : 'No operational route was found between these stations.');
  }
  private resetSelection(): void {
    this.from.set('');
    this.to.set('');
    this.fromId.set('');
    this.toId.set('');
    this.clearResult();
  }
  private clearResult(): void {
    this.fromResults.set([]);
    this.toResults.set([]);
    this.route.set(null);
    this.routeMessage.set('');
  }
  private message(cause: unknown): string {
    return `${cause instanceof Error ? cause.message : 'Unable to open metro data.'} Reinstall or update this pack in Offline Data.`;
  }
}
