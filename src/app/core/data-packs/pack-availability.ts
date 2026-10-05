import type { InstalledPack, PackType } from '../../shared/models/data-pack.models';

/** Old metadata without a type remains unknown until the pack is reinstalled. */
export const hasInstalledPackType = (packs: InstalledPack[], type: PackType): boolean =>
  packs.some(pack => pack.type === type);
