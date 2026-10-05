import { Injectable } from '@angular/core';
import type { ChannelResult, TvDatabase } from '../../shared/models/tv.models';

@Injectable({ providedIn: 'root' })
export class TvChannelRepositoryService {
  search(
    database: TvDatabase,
    query: string,
    providerId?: string,
    region?: { state?: string; city?: string; area?: string },
  ): ChannelResult[] {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return [];
    const providers = new Map(database.providers.map(provider => [provider.id, provider]));
    const channels = new Map(database.channels.map(channel => [channel.id, channel]));
    return database.mappings
      .filter(mapping => {
        const channel = channels.get(mapping.channelId);
        if (!channel || (providerId && mapping.providerId !== providerId)) return false;
        if (region && !this.regionMatches(mapping, region)) return false;
        return (
          mapping.number.includes(needle) ||
          [channel.name, ...(channel.aliases ?? [])].some(name => name.toLocaleLowerCase().includes(needle))
        );
      })
      .flatMap(mapping => {
        const channel = channels.get(mapping.channelId);
        const provider = providers.get(mapping.providerId);
        return channel && provider ? [{ channel, mapping, provider }] : [];
      });
  }
  private regionMatches(
    mapping: { state?: string; city?: string; area?: string },
    region: { state?: string; city?: string; area?: string },
  ): boolean {
    return (
      (!mapping.state || mapping.state === region.state) &&
      (!mapping.city || mapping.city === region.city) &&
      (!mapping.area || mapping.area === region.area)
    );
  }
}
