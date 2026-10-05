import { Injectable, signal } from '@angular/core';
export type ThemePreference = 'system' | 'light' | 'dark';
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly media = window.matchMedia('(prefers-color-scheme: dark)');
  readonly preference = signal<ThemePreference>(
    (localStorage.getItem('metropocket-theme') as ThemePreference) || 'system',
  );
  constructor() {
    this.apply(this.preference());
    this.media.addEventListener('change', () => {
      if (this.preference() === 'system') this.apply('system');
    });
  }
  set(preference: ThemePreference): void {
    this.preference.set(preference);
    localStorage.setItem('metropocket-theme', preference);
    this.apply(preference);
  }
  private apply(preference: ThemePreference): void {
    document.documentElement.classList.toggle(
      'ion-palette-dark',
      preference === 'dark' || (preference === 'system' && this.media.matches),
    );
  }
}
