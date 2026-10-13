import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { TrainDetailPage } from './train-detail.page';
import { TrainRepositoryService } from '../../core/trains/train-repository.service';
import { sampleTrain } from '../../core/trains/train-test-fixtures';

describe('Train timetable page', () => {
  const repository = { get: vi.fn(), deleteTrain: vi.fn() };
  const alert = { present: vi.fn(), onDidDismiss: vi.fn() };
  const alerts = { create: vi.fn() };
  beforeEach(async () => {
    vi.clearAllMocks();
    repository.get.mockResolvedValue(sampleTrain());
    alerts.create.mockResolvedValue(alert);
    alert.onDidDismiss.mockResolvedValue({ role: 'cancel' });
    await TestBed.configureTestingModule({
      imports: [TrainDetailPage],
      providers: [
        provideRouter([]),
        { provide: TrainRepositoryService, useValue: repository },
        { provide: AlertController, useValue: alerts },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ trainNumber: '00123' }) } } },
      ],
    }).compileComponents();
  });
  it('shows a vertical timetable, codes, +1 day, and only the available time labels', async () => {
    const fixture = TestBed.createComponent(TrainDetailPage);
    await fixture.componentInstance.ionViewWillEnter();
    fixture.detectChanges();
    const stops = fixture.nativeElement.querySelectorAll('.timeline li') as NodeListOf<HTMLElement>;
    expect(stops).toHaveLength(3);
    expect(stops[0].textContent).toContain('Depart 23:50');
    expect(stops[0].textContent).not.toContain('Arrive');
    expect(stops[0].textContent).toContain('SMPA');
    expect(stops[1].textContent).toContain('+1 day');
    expect(stops[2].textContent).toContain('Arrive 03:00');
    expect(stops[2].textContent).not.toContain('Depart');
  });
  it('handles missing schedules and names', async () => {
    const train = sampleTrain();
    delete train.trainName;
    repository.get.mockResolvedValueOnce(train).mockResolvedValueOnce(undefined);
    const fixture = TestBed.createComponent(TrainDetailPage);
    await fixture.componentInstance.ionViewWillEnter();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Train name not provided');
    await fixture.componentInstance.ionViewWillEnter();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Train not found');
  });
  it('Cancel leaves the timetable saved; confirmed deletion navigates to My Trains', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(TrainDetailPage);
    await fixture.componentInstance.ionViewWillEnter();
    await fixture.componentInstance.deleteTrain();
    expect(alerts.create).toHaveBeenCalledWith(expect.objectContaining({ header: 'Delete train 00123?' }));
    expect(repository.deleteTrain).not.toHaveBeenCalled();
    alert.onDidDismiss.mockResolvedValue({ role: 'confirm' });
    await fixture.componentInstance.deleteTrain();
    expect(repository.deleteTrain).toHaveBeenCalledWith('00123');
    expect(navigate).toHaveBeenCalledWith('/trains');
  });
  it('reports a failed deletion instead of navigating or claiming success', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    repository.deleteTrain.mockRejectedValueOnce(new Error('Storage failed'));
    alert.onDidDismiss.mockResolvedValue({ role: 'confirm' });
    const fixture = TestBed.createComponent(TrainDetailPage);
    await fixture.componentInstance.ionViewWillEnter();
    await fixture.componentInstance.deleteTrain();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain('Storage failed');
    expect(navigate).not.toHaveBeenCalled();
  });
});
