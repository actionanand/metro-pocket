import { inject } from '@angular/core';
import { Router, type CanMatchFn } from '@angular/router';
import { AppPlatformService } from './app-platform.service';

export const webTrainGuideGuard: CanMatchFn = () =>
  inject(AppPlatformService).isWeb() ? true : inject(Router).createUrlTree(['/settings']);
