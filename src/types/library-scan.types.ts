export interface ScannedGameChoice {
  objectId: string;
  title: string;
  iconUrl: string | null;
}

/** An executable found by a library scan that needs the user to name its game. */
export interface ScannedFolderMatch {
  executablePath: string;
  choices: ScannedGameChoice[];
  /** Set for matches made by folder name. */
  folderPath?: string;
  /** The cleaned-up folder name, offered as the default search. */
  searchQuery?: string;
}
