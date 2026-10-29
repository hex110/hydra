import type { Downloader } from "@shared";
import type { GameSetupLog, GameShop } from "./game.types";
import type { DownloadStatus } from "./download.types";
import type { ClassicsDisc } from "./emulator.types";
import type { PlayStatus } from "./library-metadata.types";
import type { SaveStoreConfig } from "./save-store.types";
import type { LaunchRule } from "./launch-rule.types";
import type { MangoHudSettings, ProtonFlavor } from "./linux-gaming.types";
import type {
  GameSaveImportState,
  SaveImportCustomSource,
  SaveImportMode,
} from "./save-import.types";
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

/** The download source release a download came from. */
export interface DownloadRelease {
  title: string;
  downloadSourceId: string | null;
  downloadSourceName: string | null;
  uploadDate: string | null;
  fileSize: string | null;
  uris: string[];
}

/** Which release of a game is installed; the title carries its version. */
export interface GameInstalledVersion extends DownloadRelease {
  /** Folder the game is installed in. */
  directory: string | null;
  /** "folder": read from the install folder's name (scanned or older installs). */
  origin: "download" | "update" | "folder";
  recordedAt: string;
}

export interface GameAvailableUpdate {
  release: DownloadRelease;
  detectedAt: string;
}

/** Set on a download that updates an installed game in place. */
export interface DownloadUpdateTarget {
  installDirectory: string;
  executablePath: string;
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
  /** When the game last went from having no executable to having one. */
  installedAt?: Date | null;
  /** Set when the executable is gone ("missing") or its drive is not mounted ("offline"). */
  executableStatus?: "missing" | "offline" | null;
  trackingExecutablePaths?: string[] | null;
  trackingExecutablePathsUpdatedAt?: Date | null;
  launchOptions?: string | null;
  ignoreDefaultLaunchOptions?: boolean;
  postInstallCommandRanAt?: Date | null;
  setupLog?: GameSetupLog | null;
  installedVersion?: GameInstalledVersion | null;
  availableUpdate?: GameAvailableUpdate | null;
  /** Release titles the user chose not to update to. */
  dismissedUpdateTitles?: string[];
  optiScaler?: GameOptiScalerInstallation | null;
  /** OnlineFix found in the game folder; null when checked and absent. */
  onlineFix?: GameOnlineFix | null;
  /** Skip OnlineFix preparation and its DLL overrides for this game. */
  onlineFixDisabled?: boolean;
  /** Run the publisher launcher instead of the game it starts (see launcher redirects). */
  useGameLauncher?: boolean;
  saveImport?: GameSaveImportState;
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
  /** This game's MangoHud layout; the default from settings applies when unset. */
  mangoHud?: MangoHudSettings | null;
  favorite?: boolean;
  playStatus?: PlayStatus | null;
  /** When the status last changed here, for save-store sync: the latest edit wins. */
  playStatusUpdatedAt?: string;
  /** On the wishlist: notify when a download source adds the game. */
  wishlisted?: boolean;
  /** When the wish last changed here, for save-store sync. */
  wishlistedUpdatedAt?: string;
  /** Playtime the user's other devices tracked, from the save store; added to this device's own. */
  syncedPlayTimeInMilliseconds?: number;
  /** When each synced profile field (notes, rating, favorite, …) last changed here. */
  profileEditedAt?: Record<string, string>;
  /**
   * Added by the Steam history import: kept off Hydra's profile uploads, shown
   * under the Steam tab.
   */
  steamHistoryImported?: boolean;
  /** Added from the Steam wishlist while unreleased: kept off profile uploads. */
  steamWishlistImported?: boolean;
  /** Steam's playtime counts on top of Hydra's instead of the larger of the two. */
  steamPlaytimeAdditive?: boolean;
  /** Added from a Floppy entry: kept off profile uploads. */
  floppyImported?: boolean;
  /** The user cut the link to Floppy: never match this game again. */
  floppyUnlinked?: boolean;
  /** The user declined the "mark as finished" suggestion. */
  completionSuggestionDismissed?: boolean;
  /** IGDB id of the matching Floppy entry; set by the Floppy sync. */
  floppyMediaId?: string | null;
  /** The user's own notes about the game. */
  notes?: string | null;
  /** Your rating from 1 to 10, kept in step with the score in Floppy. */
  rating?: number | null;
  /** Replaces the store description on the game page. */
  customDescription?: string | null;
  /** Replaces the catalogue genres on the game page and in library filters. */
  customGenres?: string[] | null;
  /** Language of the store details shown for this game; the app language when unset. */
  metadataLanguage?: string | null;
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
  /** When the download finished; older downloads only have `timestamp`. */
  completedAt?: number;
  /** Cleared from the Downloads page; the files and the record stay. */
  dismissed?: boolean;
  extracting: boolean;
  /** The last extraction failed, so a folder next to the archive may be half unpacked. */
  extractionFailed?: boolean;
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
  release?: DownloadRelease | null;
  update?: DownloadUpdateTarget | null;
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
  /** Push playtime, play status and wishlist to a Floppy instance. */
  /** Steam Web API key and SteamID64 for the local Steam history import. */
  steamHistoryApiKey?: string | null;
  steamHistorySteamId?: string | null;
  /** Add owned Steam games to the library, uninstalled, with their history. */
  steamHistoryAddToLibrary?: boolean;
  /** Minutes played a game needs to be added; 0 adds every owned game. */
  steamHistoryMinMinutes?: number;
  /** Follow the Steam wishlist: notify on release, optionally list upcoming games. */
  steamWishlistTrack?: boolean;
  /** Add unreleased wishlist games to the library; on unless set to false. */
  steamWishlistAddToLibrary?: boolean;
  /** Also notify when an unreleased wishlist game gets a release date. */
  steamWishlistNotifyDate?: boolean;
  /** Fill Floppy start and end dates from Steam; on unless set to false. */
  floppyFillDates?: boolean;
  floppyEnabled?: boolean;
  /** Add Floppy games played outside Steam to the library. */
  floppyAddToLibrary?: boolean;
  floppyUrl?: string | null;
  floppyApiToken?: string | null;
  /** The user's own SteamGridDB key; artwork then needs no Hydra account. */
  steamGridDbApiKey?: string | null;
  /** Self-hosted save backups; when set, they replace Hydra Cloud. */
  saveStore?: SaveStoreConfig | null;
  /** Versions kept per game in the save store; 0 keeps them all. */
  saveStoreKeepVersions?: number;
  /** Also sync playtime, play status and wishlist through the save store; on unless false. */
  saveStoreSyncLibrary?: boolean;
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
  /** Notify when a download source adds a wishlisted game; on by default. */
  wishlistNotificationsEnabled?: boolean;
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
  /** Linux: a desktop entry per installed game, for app launchers. */
  addGamesToAppLauncher?: boolean;
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
  /** Folders the scan should never offer as games (launchers, mod managers). */
  libraryScanIgnoredFolders?: string[];
  scanLibraryOnStartup?: boolean;
  /** Scan again when a library folder gains or loses a game folder. */
  watchLibraryFolders?: boolean;
  identifyGamesByFolderName?: boolean;
  /** What game setup does when a source has saves for a new game. */
  saveImportMode?: SaveImportMode;
  saveImportCustomSources?: SaveImportCustomSource[];
  /** Ids of detected sources the user turned off. */
  saveImportDisabledSources?: string[];
  /** Backups kept per game (save import and updates); unset keeps all. */
  saveBackupsToKeep?: number | null;
  /** Look for newer releases of installed games in the download sources. */
  checkGameUpdates?: boolean;
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
  /** List AnkerGames releases from Hydra's own reading of ankergames.net. */
  ankerGamesSource?: boolean;
  /** Where the browser saves AnkerGames archives; the system Downloads folder when unset. */
  ankerGamesBrowserDownloadsPath?: string;
  optiScalerAutoInstall?: boolean;
  optiScalerChannel?: OptiScalerChannel;
  optiScalerProxyDll?: OptiScalerProxyDll | null;
  optiScalerDetectNativeUpscalers?: boolean;
  optiScalerUseCompatibilityList?: boolean;
  optiScalerInstallOptiPatcher?: boolean;
  /** INI fragment applied to OptiScaler.ini on every install. */
  optiScalerIniOverrides?: string;
  /** INI fragment applied to every game's ReShade.ini; unset means the default overlay key. */
  reShadeIniOverrides?: string;
  autoRunMangohud?: boolean;
  autoRunGamemode?: boolean;
  /** MangoHud layout for every game; unset leaves MangoHud's own config alone. */
  mangoHud?: MangoHudSettings | null;
  /** Proton builds Hydra installs new releases of when it starts. */
  protonAutoUpdate?: ProtonFlavor[];
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
