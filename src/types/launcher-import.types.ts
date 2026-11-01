/** A game another Linux launcher (Heroic, Lutris) installed. */
export interface LauncherInstall {
  launcher: "heroic" | "lutris";
  store: "epic" | "gog" | "sideload" | "lutris";
  /** The launcher's own id for the game. */
  appId: string;
  title: string;
  installPath: string;
  executablePath: string | null;
  isWindows: boolean;
  /** The launcher's Wine prefix, which holds the game's saves. */
  winePrefixPath: string | null;
  playTimeInMinutes: number;
  lastPlayedAt: string | null;
}

export interface LauncherImportChoice {
  objectId: string;
  title: string;
  iconUrl: string | null;
}

/** An install with what the catalogue makes of its title. */
export interface LauncherImportCandidate {
  install: LauncherInstall;
  /** Set when exactly one catalogue game has the title. */
  match: LauncherImportChoice | null;
  choices: LauncherImportChoice[];
  /** A library game already runs this executable or lives in this folder. */
  inLibrary: boolean;
  /** The catalogue could not be reached for this title. */
  lookupFailed: boolean;
}

export interface LauncherImportPick {
  objectId: string;
  install: LauncherInstall;
}

export interface LauncherImportResult {
  added: number;
  failed: string[];
}
