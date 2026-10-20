import type { GameShop, PlayStatus } from "@types";

export interface GameContextMenuGame {
  id?: string;
  objectId: string;
  shop: GameShop;
  title: string;
  executablePath?: string | null;
  download?: {
    downloadPath?: string | null;
    status?: string | null;
    extracting?: boolean;
  } | null;
  favorite?: boolean;
  isPinned?: boolean;
  isHiddenFromOthers?: boolean;
  isConcealed?: boolean;
  collectionIds?: string[];
  playStatus?: PlayStatus | null;
  discs?: { path: string }[];
  selectedDiscPath?: string | null;
  dontAskDiscSelection?: boolean;
  launchOptions?: string | null;
}
