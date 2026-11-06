import type {
  BackgroundTask,
  GameShop,
  LibraryGame,
  ModDownload,
  SteamDownload,
} from "@types";

export type ActivitySection = "now" | "upNext" | "needsYou" | "recent";

export type ActivityKind =
  | "game-download"
  | "steam-install"
  | "mod-download"
  | "game-update"
  | "task";

/** What a row was made from; the page renders actions from it. */
export type ActivitySource =
  | { kind: "game-download"; game: LibraryGame }
  | { kind: "steam-install"; download: SteamDownload }
  | { kind: "mod-download"; download: ModDownload }
  | { kind: "game-update"; game: LibraryGame }
  | { kind: "task"; task: BackgroundTask };

export interface ActivityItem {
  /** Stable: `${kind}:${id}`. */
  key: string;
  kind: ActivityKind;
  section: ActivitySection;
  title: string;
  game: {
    shop: GameShop;
    objectId: string;
    title: string;
    coverUrl: string | null;
  } | null;
  /** Already translated. */
  badge: string;
  /** Already translated, one line. */
  status: string;
  isError: boolean;
  /** 0 to 1; null is indeterminate (when `showProgress`). */
  progress: number | null;
  showProgress: boolean;
  /** Finish time for recent, start or queue time otherwise. */
  sortTime: number;
  /** Lower first; only used for "now". */
  bottomBarPriority: number;
  canClear: boolean;
  source: ActivitySource;
}

export interface ActivityGroups {
  now: ActivityItem[];
  upNext: ActivityItem[];
  needsYou: ActivityItem[];
  recent: ActivityItem[];
}
