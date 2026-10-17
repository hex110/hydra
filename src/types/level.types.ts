import type { Downloader } from "@shared";
import type { GameShop } from "./game.types";
import type { DownloadStatus } from "./download.types";
import type { ClassicsDisc } from "./emulator.types";
import type { LaunchRule } from "./launch-rule.types";
import type {
  GameOptiScalerInstallation,
  OptiScalerChannel,
  OptiScalerProxyDll,
} from "./optiscaler.types";
import type {
  EpicDownloadMetadata,
  EpicInstallation,
} from "./epic-managed.types";

export type SubscriptionStatus = "active" | "pending" | "cancelled";

export interface Subscription {
  id: string;
  status: SubscriptionStatus;
  plan: { id: string; name: string };
  expiresAt: string | null;
  paymentMethod: "pix" | "paypal";
}

export interface Auth {
  accessToken: string;
  refreshToken: string;
  tokenExpirationTimestamp: number;
  workwondersJwt: string;
}

export interface User {
  id: string;
  displayName: string;
  profileImageUrl: string | null;
  backgroundImageUrl: string | null;
  subscription: Subscription | null;
}

export interface CatalogueGameIdentity {
  shop: GameShop;
  objectId: string;
}

export interface LibraryCatalogueMetadata {
  canonicalId?: string;
  catalogueGame?: CatalogueGameIdentity;
  availableShops?: GameShop[];
}

export interface GameOnlineFix {
  directory: string;
  /** Proxy DLLs (without ".dll") Wine must load from the game folder. */
  proxyDlls: string[];
}

export interface Game extends LibraryCatalogueMetadata {
  title: string;
  iconUrl: string | null;
  libraryHeroImageUrl: string | null;
  logoImageUrl: string | null;
  customIconUrl?: string | null;
  customLogoImageUrl?: string | null;
  customHeroImageUrl?: string | null;
  customCoverImageUrl?: string | null;
  originalIconPath?: string | null;
  originalLogoPath?: string | null;
  originalHeroPath?: string | null;
  customOriginalIconPath?: string | null;
  customOriginalLogoPath?: string | null;
  customOriginalHeroPath?: string | null;
  customOriginalCoverPath?: string | null;
  playTimeInMilliseconds: number;
  steamPlayTimeInMilliseconds?: number;
  epicPlayTimeInMilliseconds?: number;
  epicInstallation?: EpicInstallation;
  hasActiveEpicImport?: boolean;
  epicImportScope?: {
    environment: string;
    userId: string;
    connectionId: string;
  };
  hasActiveSteamImport?: boolean;
  enableHydraPlaytimeTracking?: boolean;
  unsyncedDeltaPlayTimeInMilliseconds?: number;
  lastTimePlayed: Date | null;
  addedToLibraryAt?: Date | null;
  objectId: string;
  shop: GameShop;
  remoteId: string | null;
  source?: "hydra" | "steam" | "epic";
  collectionIds?: string[];
  isDeleted: boolean;
  winePrefixPath?: string | null;
  protonPath?: string | null;
  executablePath?: string | null;
  executablePathUpdatedAt?: Date | null;
  trackingExecutablePaths?: string[] | null;
  trackingExecutablePathsUpdatedAt?: Date | null;
  launchOptions?: string | null;
  ignoreDefaultLaunchOptions?: boolean;
  postInstallCommandRanAt?: Date | null;
  optiScaler?: GameOptiScalerInstallation | null;
  /** OnlineFix found in the game folder; null when checked and absent. */
  onlineFix?: GameOnlineFix | null;
  /** Per-rule choices that replace a launch rule's global setting for this game. */
  launchRuleOverrides?: Record<string, boolean>;
  /** @deprecated Migrated to launchRuleOverrides (false). */
  ignoredLaunchRules?: string[];
  /** @deprecated Migrated to the HDR launch rule's override. */
  hdrEnabled?: boolean | null;
  /** Set when the user removed OptiScaler or opted the game out of auto-install. */
  optiScalerAutoInstallDisabled?: boolean;
  /** Per-game proxy DLL; the global preference applies when unset. */
  optiScalerProxyDll?: OptiScalerProxyDll | null;
  autoRunMangohud?: boolean | null;
  autoRunGamemode?: boolean | null;
  favorite?: boolean;
  isHiddenFromOthers?: boolean;
  isConcealed?: boolean;
  isPinned?: boolean;
  achievementCount?: number;
  unlockedAchievementCount?: number;
  reportedUnlockedAchievementCount?: number;
  pinnedDate?: Date | null;
  automaticCloudSync?: boolean;
  hasManuallyUpdatedPlaytime?: boolean;
  newDownloadOptionsCount?: number;
  installedSizeInBytes?: number | null;
  installerSizeInBytes?: number | null;
  steamShortcutAppId?: number;
  platform?: string | null;
  discs?: ClassicsDisc[];
  selectedDiscPath?: string | null;
  dontAskDiscSelection?: boolean;
  romSizeBytes?: number | null;
}

export interface DownloadFile {
  index: number;
  path: string;
  size: number;
  bytesDownloaded: number;
  completed: boolean;
}

export interface Download {
  epic?: EpicDownloadMetadata;
  shop: GameShop;
  objectId: string;
  uri: string;
  folderName: string | null;
  downloadPath: string;
  progress: number;
  downloader: Downloader;
  bytesDownloaded: number;
  fileSize: number | null;
  shouldSeed: boolean;
  status: DownloadStatus | null;
  queued: boolean;
  pinnedToHero?: boolean;
  timestamp: number;
  extracting: boolean;
  extractionProgress?: number;
  automaticallyExtract: boolean;
  automaticallyDeleteArchiveFiles: boolean;
  fileIndices?: number[];
  files?: DownloadFile[];
  selectedFilesSize?: number | null;
  realDebridTorrentId?: string;
  awaitingDebrid?: boolean;
  debridAutoResume?: boolean;
  debridQueueOnly?: boolean;
  debridQueuePosition?: number;
  debridPreparationDeadline?: number;
  customTrackers?: string[];
}

export interface DownloadLayoutState {
  version: 1;
  queueOrder: string[];
  pausedOrder: string[];
}

export type AchievementCustomNotificationPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export type BigPictureDiagnosticsPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export interface DownloadDirectoryPreference {
  path: string;
  createdAt: string;
  source: "manual" | "auto";
}

export interface UserPreferences {
  downloadsPath?: string | null;
  defaultWinePrefixPath?: string | null;
  downloadDirectories?: DownloadDirectoryPreference[];
  optionalDownloadsPaths?: string[];
  ggDealsApiKey?: string | null;
  language?: string;
  realDebridApiToken?: string | null;
  premiumizeApiToken?: string | null;
  allDebridApiToken?: string | null;
  torBoxApiToken?: string | null;
  retroAchievementsWebApiKey?: string | null;
  retroAchievementsUsername?: string | null;
  preferQuitInsteadOfHiding?: boolean;
  runAtStartup?: boolean;
  startMinimized?: boolean;
  launchToLibraryPage?: boolean;
  bigPictureLaunchToLibraryPage?: boolean;
  launchInBigPicture?: boolean;
  disableNsfwAlert?: boolean;
  enableAutoInstall?: boolean;
  seedAfterDownloadComplete?: boolean;
  showHiddenAchievementsDescription?: boolean;
  showDownloadSpeedInMegabits?: boolean;
  downloadNotificationsEnabled?: boolean;
  repackUpdatesNotificationsEnabled?: boolean;
  achievementNotificationsEnabled?: boolean;
  achievementCustomNotificationsEnabled?: boolean;
  achievementCustomNotificationPosition?: AchievementCustomNotificationPosition;
  achievementSoundVolume?: number;
  friendRequestNotificationsEnabled?: boolean;
  friendStartGameNotificationsEnabled?: boolean;
  chatMessageNotificationsEnabled?: boolean;
  showDownloadSpeedInMegabytes?: boolean;
  extractFilesByDefault?: boolean;
  deleteArchiveFilesAfterExtractionByDefault?: boolean;
  enableSteamAchievements?: boolean;
  enableAchievementSouvenirs?: boolean;
  achievementScreenshotsPath?: string;
  autoplayGameTrailers?: boolean;
  hideToTrayOnGameStart?: boolean;
  enableNewDownloadOptionsBadges?: boolean;
  createStartMenuShortcut?: boolean;
  bigPictureSoundsEnabled?: boolean;
  bigPictureVirtualKeyboardEnabled?: boolean;
  bigPictureDiagnosticsEnabled?: boolean;
  bigPictureDiagnosticsPosition?: BigPictureDiagnosticsPosition;
  maxDownloadSpeedBytesPerSecond?: number | null;
  torrentNetworkInterface?: string | null;
  globalTrackers?: string[];
  appendGlobalTrackers?: boolean;
  globalTrackersUrl?: string;
  appendGlobalTrackersUrl?: boolean;
  defaultProtonPath?: string | null;
  defaultLaunchOptions?: string | null;
  prepareWinePrefixOnInstall?: boolean;
  postInstallCommand?: string | null;
  libraryScanDirectories?: string[];
  scanLibraryOnStartup?: boolean;
  identifyGamesByFolderName?: boolean;
  /** Download source ids, most preferred first, for choosing a repack automatically. */
  preferredDownloadSourceIds?: string[];
  repackSortPreference?: "newest" | "smallest";
  /** Comma-separated words that rule a release out of automatic choice. */
  repackExcludedWords?: string;
  repackMaxSizeInGigabytes?: number | null;
  /** Start downloads requested by the browser add-on without confirmation. */
  startBrowserDownloadsImmediately?: boolean;
  /** Unset until first edited; the built-in presets apply until then. */
  launchRules?: LaunchRule[];
  /** @deprecated Migrated to the HDR launch rule. */
  enableHdr?: boolean;
  /** Load OnlineFix's proxy DLLs and give its games Steam's client files. */
  prepareOnlineFixGames?: boolean;
  /** Also match games against Hydra's own copy of each download source. */
  matchDownloadSourcesLocally?: boolean;
  optiScalerAutoInstall?: boolean;
  optiScalerChannel?: OptiScalerChannel;
  optiScalerProxyDll?: OptiScalerProxyDll;
  optiScalerDetectNativeUpscalers?: boolean;
  optiScalerUseCompatibilityList?: boolean;
  optiScalerInstallOptiPatcher?: boolean;
  /** INI fragment applied to OptiScaler.ini on every install. */
  optiScalerIniOverrides?: string;
  autoRunMangohud?: boolean;
  autoRunGamemode?: boolean;
  hideClassicsBookmark?: boolean;
  classicsUseHeroLayout?: boolean;
  hideLibraryGameBadges?: boolean;
  hideLibraryReadySizeBadges?: boolean;
  hideLibraryClassicsBadges?: boolean;
  hideSteamLibraryBadges?: boolean;
  hideEpicLibraryBadges?: boolean;
  hideLibraryAchievementProgress?: boolean;
  autoplayAnimatedArtwork?: boolean;
  persistFiltersAndSorting?: boolean;
}

export interface NetworkInterface {
  name: string;
  addresses: string[];
}

export interface ScreenState {
  x?: number;
  y?: number;
  height: number;
  width: number;
  isMaximized: boolean;
}
