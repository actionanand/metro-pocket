import { TvChannelRepositoryService } from './tv-channel-repository.service';
import type { TvDatabase } from '../../shared/models/tv.models';
const database: TvDatabase = {
  providers: [
    { id: 'jiotv-plus', name: 'JioTV+', kind: 'iptv' },
    { id: 'airtel-digital-tv', name: 'Airtel Digital TV', kind: 'dth' },
    { id: 'cable', name: 'Fixture Cable', kind: 'cable' },
  ],
  channels: [
    { id: 'sun-news', name: 'Sun News', aliases: ['சன் நியூஸ்'], language: 'Tamil', genre: 'News', quality: 'HD' },
    { id: 'sun-tv', name: 'Sun TV', aliases: ['சன் TV'], language: 'Tamil', genre: 'Entertainment', quality: 'SD' },
    { id: 'ktv', name: 'KTV', aliases: ['கே TV'], language: 'Tamil', genre: 'Movies' },
    { id: 'sun-music', name: 'Sun Music', aliases: ['சன் மியூசிக்'], language: 'Tamil', genre: 'Music' },
    { id: 'chutti-tv', name: 'Chutti TV', aliases: ['சுட்டி TV'], language: 'Tamil', genre: 'Kids' },
    { id: 'ptc-news', name: 'PTC news', language: 'Punjabi', genre: 'News' },
    { id: 'abp-sanjha', name: 'ABP SANJHA', language: 'Punjabi', genre: 'News' },
    { id: 'english-hd', name: 'English HD', language: 'English', genre: 'Movies', quality: 'HD' },
  ],
  mappings: [
    { providerId: 'jiotv-plus', channelId: 'sun-news', number: '1559' },
    { providerId: 'jiotv-plus', channelId: 'sun-tv', number: '1503' },
    { providerId: 'jiotv-plus', channelId: 'ktv', number: '1540' },
    { providerId: 'jiotv-plus', channelId: 'sun-music', number: '1579' },
    { providerId: 'jiotv-plus', channelId: 'chutti-tv', number: '693' },
    { providerId: 'airtel-digital-tv', channelId: 'sun-tv', number: '754' },
    { providerId: 'airtel-digital-tv', channelId: 'ptc-news', number: '563' },
    { providerId: 'airtel-digital-tv', channelId: 'abp-sanjha', number: '564' },
    { providerId: 'airtel-digital-tv', channelId: 'english-hd', number: '9' },
    { providerId: 'cable', channelId: 'sun-news', number: '10', country: 'IN', state: 'Tamil Nadu', city: 'Chennai' },
  ],
};
describe('TvChannelRepositoryService', () => {
  const service = new TvChannelRepositoryService();
  it('browses all mappings and keeps duplicate canonical channels separate', () => {
    expect(service.query(database)).toHaveLength(10);
    expect(service.query(database, { search: 'Sun TV' }).map(result => result.provider.name)).toEqual([
      'Airtel Digital TV',
      'JioTV+',
    ]);
  });
  it('searches English names, native aliases and numbers', () => {
    expect(service.query(database, { search: 'Sun News' }).map(result => result.mapping.number)).toContain('1559');
    expect(service.query(database, { search: 'சன் நியூஸ்' }).map(result => result.mapping.number)).toContain('1559');
    expect(service.query(database, { search: '1559' })[0].channel.name).toBe('Sun News');
    expect(service.query(database, { search: 'கே TV' })[0].mapping.number).toBe('1540');
    expect(service.query(database, { search: 'சன் மியூசிக்' })[0].mapping.number).toBe('1579');
    expect(service.query(database, { search: 'சுட்டி TV' })[0].mapping.number).toBe('693');
    expect(service.query(database, { search: '563' })[0].channel.name).toBe('PTC news');
    expect(service.query(database, { search: '564' })[0].channel.name).toBe('ABP SANJHA');
  });
  it('combines provider, language, genre, quality and search without mutating data', () => {
    expect(service.query(database, { providerId: 'jiotv-plus', language: 'Tamil', genre: 'News' })).toHaveLength(1);
    expect(
      service.query(database, { providerId: 'airtel-digital-tv', language: 'English', quality: 'HD' }),
    ).toHaveLength(1);
    expect(service.query(database, { providerId: 'jiotv-plus' })).toHaveLength(5);
    expect(service.query(database, { language: 'Punjabi' })).toHaveLength(2);
    expect(service.query(database, { genre: 'Movies' })).toHaveLength(2);
    expect(service.query(database, { quality: 'SD' })).toHaveLength(2);
    expect(service.query(database, { providerId: 'jiotv-plus', language: 'Tamil', search: 'Sun' })).toHaveLength(3);
    expect(service.query(database, { language: 'Tamil', genre: 'Music' })[0].channel.id).toBe('sun-music');
    expect(service.query(database, { quality: '4K' })).toEqual([]);
    expect(service.query(database, { quality: 'HD' })).toHaveLength(3);
    expect(service.query(database)).toHaveLength(10);
  });
  it('matches regional cable only in scope while national rows work everywhere', () => {
    const chennai = service.query(database, {
      search: 'Sun News',
      region: { country: 'IN', state: 'Tamil Nadu', city: 'Chennai' },
    });
    expect(chennai).toHaveLength(2);
    const kerala = service.query(database, { search: 'Sun News', region: { country: 'IN', state: 'Kerala' } });
    expect(kerala.map(result => result.provider.id)).toEqual(['jiotv-plus']);
  });
  it('sorts names and channel numbers naturally', () => {
    expect(service.query(database, { providerId: 'airtel-digital-tv' }).map(result => result.mapping.number)).toEqual([
      '9',
      '563',
      '564',
      '754',
    ]);
    expect(service.query(database, { sort: 'name' })[0].channel.name).toBe('ABP SANJHA');
    expect(service.query(database, { sort: 'number' })[0].mapping.number).toBe('9');
  });
});
