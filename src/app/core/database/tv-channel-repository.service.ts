import { Injectable } from '@angular/core';
import type { ChannelResult, TvChannel, TvDatabase } from '../../shared/models/tv.models';

export interface TvRegion {
  country?: string;
  state?: string;
  city?: string;
  area?: string;
}

export interface TvQuery {
  search?: string;
  providerId?: string;
  language?: string;
  genre?: string;
  quality?: TvChannel['quality'];
  region?: TvRegion;
  sort?: 'name' | 'number';
}

const order = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

@Injectable({ providedIn: 'root' })
export class TvChannelRepositoryService {
  query(database: TvDatabase, filters: TvQuery = {}): ChannelResult[] {
    const needle = filters.search?.trim().toLocaleLowerCase() ?? '';
    const providers = new Map(database.providers.map(provider => [provider.id, provider]));
    const channels = new Map(database.channels.map(channel => [channel.id, channel]));
    const results = database.mappings.flatMap(mapping => {
      const channel = channels.get(mapping.channelId);
      const provider = providers.get(mapping.providerId);
      if (!channel || !provider) return [];
      if (
        (filters.providerId && provider.id !== filters.providerId) ||
        (filters.language && channel.language !== filters.language) ||
        (filters.genre && channel.genre !== filters.genre) ||
        (filters.quality && channel.quality !== filters.quality) ||
        (filters.region && !this.regionMatches(mapping, filters.region)) ||
        (needle &&
          !mapping.number.toLocaleLowerCase().includes(needle) &&
          ![channel.name, ...(channel.aliases ?? [])].some(name => name.toLocaleLowerCase().includes(needle)))
      )
        return [];
      return [{ channel, mapping, provider }];
    });
    const sort = filters.sort ?? (filters.providerId ? 'number' : 'name');
    return results.sort((a, b) => {
      const first =
        sort === 'number'
          ? order.compare(a.mapping.number, b.mapping.number)
          : order.compare(a.channel.name, b.channel.name);
      return (
        first ||
        order.compare(a.channel.name, b.channel.name) ||
        order.compare(a.mapping.number, b.mapping.number) ||
        order.compare(a.provider.name, b.provider.name)
      );
    });
  }
  private regionMatches(mapping: TvRegion, region: TvRegion): boolean {
    return (['country', 'state', 'city', 'area'] as const).every(
      scope =>
        (scope === 'country' && !region.country) ||
        !mapping[scope] ||
        mapping[scope]?.toLocaleLowerCase() === region[scope]?.toLocaleLowerCase(),
    );
  }
}
