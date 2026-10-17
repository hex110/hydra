import type {
  GameRepack,
  GameShop,
  GameStats,
  CatalogueGameIdentity,
  LibraryGame,
  LibraryGamePresentation,
  ShopDetailsWithAssets,
  UserAchievement,
} from "@types";

export type GameOptionsCategoryId =
  | "general"
  | "locations"
  | "assets"
  | "hydra_cloud"
  | "epic_cloud"
  | "hydra_cloud_legacy"
  | "compatibility"
  | "downloads"
  | "danger_zone";

export interface GameDetailsContext {
  game: LibraryGame | null;
  downloadGame: LibraryGame | null;
  presentation: LibraryGamePresentation | null;
  catalogueGame: CatalogueGameIdentity;
  shopDetails: ShopDetailsWithAssets | null;
  repacks: GameRepack[];
  /** False while download options are being fetched. */
  repacksLoaded: boolean;
  /**
   * Set when the browser add-on asked to download this game: "select"
   * preselects the best repack, "start" also starts it.
   */
  autoDownloadRequest: "select" | "start" | null;
  clearAutoDownloadRequest: () => void;
  shop: GameShop;
  gameTitle: string;
  isGameRunning: boolean;
  isLoading: boolean;
  objectId: string | undefined;
  showRepacksModal: boolean;
  showGameOptionsModal: boolean;
  gameOptionsInitialCategory: GameOptionsCategoryId;
  stats: GameStats | null;
  achievements: UserAchievement[] | null;
  hasNSFWContentBlocked: boolean;
  lastDownloadedOption: GameRepack | null;
  isTransferring: boolean;
  transferProgress: number;
  selectGameExecutable: () => Promise<string | null>;
  updateGame: () => Promise<void>;
  refreshGameDetails: () => Promise<void>;
  setShowRepacksModal: React.Dispatch<React.SetStateAction<boolean>>;
  setShowGameOptionsModal: React.Dispatch<React.SetStateAction<boolean>>;
  setGameOptionsInitialCategory: React.Dispatch<
    React.SetStateAction<GameOptionsCategoryId>
  >;
  setHasNSFWContentBlocked: React.Dispatch<React.SetStateAction<boolean>>;
  cancelTransfer: () => void;
}
