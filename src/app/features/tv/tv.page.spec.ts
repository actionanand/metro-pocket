import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TvPage } from './tv.page';
import { TvDatabaseRepositoryService } from '../../core/database/tv-database-repository.service';
import type { TvDatabase } from '../../shared/models/tv.models';
import type { InstalledPack } from '../../shared/models/data-pack.models';

const pack: InstalledPack = {
  id: 'tv-test',
  type: 'tv',
  version: 1,
  schemaVersion: 1,
  installedAt: '2026-10-12',
  size: 100,
};
const database: TvDatabase = {
  providers: [
    { id: 'jiotv-plus', name: 'JioTV+', kind: 'iptv' },
    { id: 'airtel', name: 'Airtel Digital TV', kind: 'dth' },
  ],
  channels: [
    { id: 'sun-news', name: 'Sun News', aliases: ['சன் நியூஸ்'], language: 'Tamil', genre: 'News', quality: 'HD' },
    { id: 'sun-tv', name: 'Sun TV', language: 'Tamil', genre: 'Entertainment', quality: 'SD' },
    { id: 'unknown', name: 'Untitled' },
  ],
  mappings: [
    { providerId: 'jiotv-plus', channelId: 'sun-news', number: '1559' },
    { providerId: 'airtel', channelId: 'sun-tv', number: '754' },
    ...Array.from({ length: 100 }, (_, index) => ({
      providerId: 'jiotv-plus',
      channelId: 'unknown',
      number: String(index + 1),
    })),
  ],
};

describe('TV installed-data browser', () => {
  const repository = { installed: vi.fn(), load: vi.fn() };
  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [TvPage],
      providers: [provideRouter([]), { provide: TvDatabaseRepositoryService, useValue: repository }],
    }).compileComponents();
  });
  it('shows no-pack state and an Offline Data action', async () => {
    repository.installed.mockResolvedValue([]);
    const fixture = TestBed.createComponent(TvPage);
    await fixture.componentInstance.ionViewWillEnter();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No TV channel data installed');
    expect(fixture.nativeElement.textContent).toContain('Browse Offline Data');
  });
  it('loads dynamic options, renders results and limits the first batch', async () => {
    repository.installed.mockResolvedValue([pack]);
    repository.load.mockResolvedValue(database);
    const fixture = TestBed.createComponent(TvPage);
    const page = fixture.componentInstance;
    await page.ionViewWillEnter();
    fixture.detectChanges();
    expect(page.providers().map(item => item.name)).toEqual(['JioTV+', 'Airtel Digital TV']);
    expect(page.languages()).toEqual(['Tamil']);
    expect(page.genres()).toEqual(['Entertainment', 'News']);
    expect(page.qualities()).toEqual(['HD', 'SD']);
    expect(page.results()).toHaveLength(102);
    expect(fixture.nativeElement.querySelectorAll('.channel')).toHaveLength(100);
    expect(fixture.nativeElement.textContent).toContain('Sun News');
    page.showMore();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.channel')).toHaveLength(102);
  });
  it('composes filters, shows empty result state, and clears filters', async () => {
    repository.installed.mockResolvedValue([pack]);
    repository.load.mockResolvedValue(database);
    const fixture = TestBed.createComponent(TvPage);
    const page = fixture.componentInstance;
    await page.ionViewWillEnter();
    const select = document.createElement('select');
    const option = document.createElement('option');
    option.value = 'jiotv-plus';
    select.add(option);
    select.value = 'jiotv-plus';
    page.changeFilter('providerId', { target: select } as unknown as Event);
    page.changeSearch('சன் நியூஸ்');
    fixture.detectChanges();
    expect(page.results()).toHaveLength(1);
    expect(page.visibleResults()).toHaveLength(1);
    expect(fixture.nativeElement.textContent).toContain('1559');
    page.changeSearch('not found');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No channels match your current filters.');
    page.clearFilters();
    expect(page.results()).toHaveLength(102);
    expect(page.visibleResults()).toHaveLength(100);
  });
  it('shows reinstall guidance when installed bytes cannot be opened', async () => {
    repository.installed.mockResolvedValue([pack]);
    repository.load.mockRejectedValue(new Error('Bad SQLite'));
    const fixture = TestBed.createComponent(TvPage);
    await fixture.componentInstance.ionViewWillEnter();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('TV data could not be opened');
    expect(fixture.nativeElement.textContent).toContain('Reinstall it from Offline Data.');
  });
});
