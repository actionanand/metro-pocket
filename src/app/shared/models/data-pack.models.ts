export type PackType = 'metro' | 'tv';
export type PackState = 'not-installed' | 'downloading' | 'installing' | 'installed' | 'update-available' | 'failed';

export interface DataPackDescriptor {
  id: string;
  type: PackType;
  name: string;
  version: number;
  schemaVersion: number;
  file: string;
  downloadUrl: string;
  downloadBytes?: number;
  installedBytes?: number;
  sha256?: string;
  city?: string;
  networkAsOf?: string;
  description?: string;
  changes?: string[];
}

export interface DataManifest {
  schemaVersion: number;
  releaseVersion: number;
  generatedAt: string;
  packs: DataPackDescriptor[];
}

export interface InstalledPack {
  id: string;
  version: number;
  schemaVersion: number;
  installedAt: string;
  checksum?: string;
  size: number;
  networkAsOf?: string;
}

export interface PackViewModel extends DataPackDescriptor {
  state: PackState;
  progress?: number;
  installed?: InstalledPack;
  error?: string;
}
