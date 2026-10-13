import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { HomePage } from './home.page';

describe('HomePage', () => {
  let component: HomePage;
  let fixture: ComponentFixture<HomePage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ providers: [provideRouter([])] }).compileComponents();
    fixture = TestBed.createComponent(HomePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
  it('shows Metro, TV Channels and Trains with lazy feature links', () => {
    const links = Array.from(fixture.nativeElement.querySelectorAll('.feature')) as HTMLAnchorElement[];
    expect(links.map(link => link.getAttribute('href'))).toEqual(['/metro', '/tv', '/trains']);
    expect(links.map(link => link.querySelector('strong')?.textContent)).toEqual(['Metro', 'TV Channels', 'Trains']);
  });
});
