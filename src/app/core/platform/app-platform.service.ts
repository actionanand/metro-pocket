import { Service } from '@angular/core';
import { Capacitor } from '@capacitor/core';

/** Capacitor distinguishes an installed Android app from Android browsers/PWAs. */
@Service()
export class AppPlatformService {
  private readonly platform = Capacitor.getPlatform();
  isWeb(): boolean {
    return this.platform === 'web';
  }
  isAndroid(): boolean {
    return this.platform === 'android';
  }
}
