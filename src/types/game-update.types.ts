import type { GameShop } from "./game.types";

export interface GameUpdateCheckResult {
  checked: number;
  updates: number;
  checkedAt: string;
}

export type GameUpdateFailure =
  | "game-running"
  | "install-missing"
  | "not-extracted"
  | "installer"
  | "layout-mismatch"
  | "failed";

export interface GameUpdateFailedEvent {
  shop: GameShop;
  objectId: string;
  code: GameUpdateFailure;
}

export interface GameSaveBackups {
  shop: GameShop;
  objectId: string;
  title: string;
  directory: string;
  count: number;
  sizeInBytes: number;
  /** Folder name of the newest backup (its timestamp). */
  latest: string;
}
