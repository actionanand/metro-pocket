import { TvChannelRepositoryService } from './tv-channel-repository.service';
import type { TvDatabase } from '../../shared/models/tv.models';
const database: TvDatabase = {
  providers: [
    { id: 'dth', name: 'Fixture DTH', kind: 'dth' },
    { id: 'cable', name: 'Fixture Cable', kind: 'cable' },
  ],
  channels: [
    { id: 'one', name: 'Example One', aliases: ['One TV'], language: 'Tamil', genre: 'Entertainment', quality: 'HD' },
  ],
  mappings: [
    { providerId: 'dth', channelId: 'one', number: '101' },
    { providerId: 'cable', channelId: 'one', number: '201', state: 'Tamil Nadu', city: 'Chennai' },
  ],
};
describe('TvChannelRepositoryService', () => {
  const service = new TvChannelRepositoryService();
  it('searches names, aliases and channel numbers', () => {
    expect(service.search(database, 'one')).toHaveLength(2);
    expect(service.search(database, '101')).toHaveLength(1);
    expect(service.search(database, 'tv')).toHaveLength(2);
  });
  it('filters provider and cable region', () => {
    expect(service.search(database, 'one', 'cable', { state: 'Tamil Nadu', city: 'Chennai' })).toHaveLength(1);
    expect(service.search(database, 'one', 'cable', { state: 'Kerala' })).toHaveLength(0);
  });
});
