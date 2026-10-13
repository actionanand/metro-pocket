import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AppPlatformService } from './app-platform.service';
import { webTrainGuideGuard } from './web-train-guide.guard';

@Component({ selector: 'app-guide-test', template: '<h1>Guide route</h1>' })
class GuideTestComponent {}
@Component({ selector: 'app-settings-test', template: '<h1>Settings route</h1>' })
class SettingsTestComponent {}

describe('Web-only /train-guide route', () => {
  it.each([true, false])('navigates safely when isWeb=%s', async web => {
    const load = vi.fn().mockResolvedValue(GuideTestComponent);
    TestBed.configureTestingModule({
      providers: [
        { provide: AppPlatformService, useValue: { isWeb: () => web, isAndroid: () => !web } },
        provideRouter([
          { path: 'train-guide', canMatch: [webTrainGuideGuard], loadComponent: load },
          { path: 'settings', component: SettingsTestComponent },
        ]),
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/train-guide');
    expect(TestBed.inject(Router).url).toBe(web ? '/train-guide' : '/settings');
    expect(harness.routeNativeElement?.textContent).toContain(web ? 'Guide route' : 'Settings route');
    expect(load).toHaveBeenCalledTimes(web ? 1 : 0);
  });
});
