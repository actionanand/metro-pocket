import { Component, computed, inject, signal } from '@angular/core';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonSearchbar,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { RouterLink } from '@angular/router';
import { addIcons } from 'ionicons';
import { tvOutline } from 'ionicons/icons';
import { TvDatabaseRepositoryService } from '../../core/database/tv-database-repository.service';
import { TvChannelRepositoryService } from '../../core/database/tv-channel-repository.service';
import type { InstalledPack } from '../../shared/models/data-pack.models';
import type { TvDatabase } from '../../shared/models/tv.models';
@Component({
  selector: 'app-tv',
  imports: [
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonSearchbar,
    IonTitle,
    IonToolbar,
    RouterLink,
  ],
  templateUrl: 'tv.page.html',
  styleUrls: ['tv.page.scss'],
})
export class TvPage {
  private readonly repository = inject(TvDatabaseRepositoryService);
  private readonly channels = inject(TvChannelRepositoryService);
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly packs = signal<InstalledPack[]>([]);
  readonly packId = signal('');
  readonly database = signal<TvDatabase | null>(null);
  readonly search = signal('');
  readonly providerId = signal('');
  readonly language = signal('');
  readonly genre = signal('');
  readonly quality = signal<'' | 'SD' | 'HD' | '4K'>('');
  readonly sort = signal<'auto' | 'name' | 'number'>('auto');
  readonly visibleCount = signal(100);
  readonly providers = computed(() => this.database()?.providers ?? []);
  readonly languages = computed(() => this.options('language'));
  readonly genres = computed(() => this.options('genre'));
  readonly qualities = computed(() => this.options('quality'));
  readonly filtersActive = computed(
    () => !!(this.search() || this.providerId() || this.language() || this.genre() || this.quality()),
  );
  readonly results = computed(() => {
    const database = this.database();
    if (!database) return [];
    const sort = this.sort();
    return this.channels.query(database, {
      search: this.search(),
      providerId: this.providerId(),
      language: this.language(),
      genre: this.genre(),
      quality: this.quality() || undefined,
      sort: sort === 'auto' ? undefined : sort,
    });
  });
  readonly visibleResults = computed(() => this.results().slice(0, this.visibleCount()));
  private loadRequest = 0;
  constructor() {
    addIcons({ tvOutline });
  }
  async ionViewWillEnter(): Promise<void> {
    const request = ++this.loadRequest;
    this.loading.set(true);
    this.error.set(false);
    this.database.set(null);
    try {
      const packs = await this.repository.installed();
      if (request !== this.loadRequest) return;
      this.packs.set(packs);
      const selected = packs.find(pack => pack.id === this.packId()) ?? packs[0];
      if (selected) {
        this.packId.set(selected.id);
        const database = await this.repository.load(selected);
        if (request === this.loadRequest) this.database.set(database);
      }
    } catch {
      if (request === this.loadRequest) this.error.set(true);
    } finally {
      if (request === this.loadRequest) this.loading.set(false);
    }
  }
  async changePack(event: Event): Promise<void> {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    this.packId.set(target.value);
    this.clearFilters();
    await this.ionViewWillEnter();
  }
  changeFilter(field: 'providerId' | 'language' | 'genre' | 'quality' | 'sort', event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    if (field === 'sort') this.sort.set(target.value as 'auto' | 'name' | 'number');
    else if (field === 'quality') {
      if (target.value === '' || target.value === 'SD' || target.value === 'HD' || target.value === '4K')
        this.quality.set(target.value);
    } else this[field].set(target.value);
    this.visibleCount.set(100);
  }
  changeSearch(value: string | null | undefined): void {
    this.search.set(value ?? '');
    this.visibleCount.set(100);
  }
  clearFilters(): void {
    this.search.set('');
    this.providerId.set('');
    this.language.set('');
    this.genre.set('');
    this.quality.set('');
    this.sort.set('auto');
    this.visibleCount.set(100);
  }
  showMore(): void {
    this.visibleCount.update(count => count + 100);
  }
  private options(field: 'language' | 'genre' | 'quality'): string[] {
    const database = this.database();
    if (!database) return [];
    const mapped = new Set(database.mappings.map(mapping => mapping.channelId));
    return [...new Set(database.channels.filter(channel => mapped.has(channel.id)).map(channel => channel[field]))]
      .filter((value): value is string => typeof value === 'string' && !!value.trim())
      .sort((a, b) => a.localeCompare(b));
  }
}
