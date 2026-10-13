import { TestBed } from '@angular/core/testing';
import { Capacitor } from '@capacitor/core';
import { AppPlatformService } from './app-platform.service';

describe('Capacitor platform abstraction', () => {
  afterEach(() => vi.restoreAllMocks());
  it.each(['web', 'android'])('detects %s from Capacitor, not a browser user agent', platform => {
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue(platform);
    const service = TestBed.inject(AppPlatformService);
    expect(service.isWeb()).toBe(platform === 'web');
    expect(service.isAndroid()).toBe(platform === 'android');
  });
});
