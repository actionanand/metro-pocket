export type TvProviderKind = 'dth' | 'cable';
export interface TvProvider {
  id: string;
  name: string;
  kind: TvProviderKind;
}
export interface TvChannel {
  id: string;
  name: string;
  aliases?: string[];
  language?: string;
  genre?: string;
  quality?: 'SD' | 'HD' | '4K';
}
export interface TvMapping {
  providerId: string;
  channelId: string;
  number: string;
  country?: string;
  state?: string;
  city?: string;
  area?: string;
  revision?: string;
  verifiedAt?: string;
}
export interface TvDatabase {
  providers: TvProvider[];
  channels: TvChannel[];
  mappings: TvMapping[];
}
export interface ChannelResult {
  channel: TvChannel;
  mapping: TvMapping;
  provider: TvProvider;
}
