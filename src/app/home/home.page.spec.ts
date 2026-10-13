import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HomePage } from './home.page';
import { AppPlatformService } from '../core/platform/app-platform.service';
import { TrainRepositoryService } from '../core/trains/train-repository.service';

describe('Home platform Train card', () => {
  let web = true;
  const trains = { trainCount: signal<number | null>(0), count: vi.fn() };
  beforeEach(async () => {
    vi.clearAllMocks();
    web = true;
    trains.trainCount.set(0);
    trains.count.mockImplementation(async () => trains.trainCount() ?? 0);
    await TestBed.configureTestingModule({
      imports: [HomePage],
      providers: [
        provideRouter([]),
        { provide: TrainRepositoryService, useValue: trains },
        { provide: AppPlatformService, useValue: { isWeb: () => web, isAndroid: () => !web } },
      ],
    }).compileComponents();
  });
  it.each([0, 3])('Web always exposes all three features with %s trains', count => {
    trains.trainCount.set(count);
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    const links = Array.from(fixture.nativeElement.querySelectorAll('.feature')) as HTMLAnchorElement[];
    expect(links.map(link => link.getAttribute('href'))).toEqual(['/metro', '/tv', '/trains']);
    expect(links.map(link => link.querySelector('strong')?.textContent)).toEqual(['Metro', 'TV Channels', 'Trains']);
    expect(trains.count).not.toHaveBeenCalled();
  });
  it('Android hides the card with zero trains and shows it immediately after restored state publishes', async () => {
    web = false;
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    await fixture.componentInstance.ionViewWillEnter();
    expect(fixture.nativeElement.querySelector('a[href="/trains"]')).toBeNull();
    trains.trainCount.set(3);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a[href="/trains"]')).not.toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('CSV');
  });
  it.each(['delete all', 'delete last train'])('Android hides the card reactively after %s', operation => {
    web = false;
    trains.trainCount.set(operation === 'delete all' ? 3 : 1);
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a[href="/trains"]')).not.toBeNull();
    trains.trainCount.set(0);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a[href="/trains"]')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.feature')).toHaveLength(2);
  });
});
