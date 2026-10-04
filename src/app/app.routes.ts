import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'home',
    loadComponent: () => import('./home/home.page').then(m => m.HomePage),
  },
  { path: 'metro', loadComponent: () => import('./features/metro/metro.page').then(m => m.MetroPage) },
  { path: 'tv', loadComponent: () => import('./features/tv/tv.page').then(m => m.TvPage) },
  {
    path: 'offline-data',
    loadComponent: () => import('./features/offline-data/offline-data.page').then(m => m.OfflineDataPage),
  },
  { path: 'settings', loadComponent: () => import('./features/settings/settings.page').then(m => m.SettingsPage) },
  { path: 'about', loadComponent: () => import('./features/about/about.page').then(m => m.AboutPage) },
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full',
  },
];
