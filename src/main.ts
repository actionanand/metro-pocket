import { bootstrapApplication } from '@angular/platform-browser';
import { isDevMode } from '@angular/core';
import {
  RouteReuseStrategy,
  provideRouter,
  withComponentInputBinding,
  withPreloading,
  PreloadAllModules,
} from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular';
import { provideServiceWorker } from '@angular/service-worker';

import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideRouter(routes, withPreloading(PreloadAllModules), withComponentInputBinding()),
    provideServiceWorker('ngsw-worker.js', { enabled: !isDevMode(), registrationStrategy: 'registerWhenStable:30000' }),
  ],
});
