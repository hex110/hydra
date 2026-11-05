export interface Theme {
  id: string;
  name: string;
  author?: string;
  authorName?: string;
  isActive: boolean;
  code: string;
  hasCustomSound?: boolean;
  originalSoundPath?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type MatugenPaletteStatus =
  | "off"
  | "waiting"
  | "unreadable"
  | "empty"
  | "applied";

export interface MatugenPaletteState {
  enabled: boolean;
  status: MatugenPaletteStatus;
  /** The file Hydra Plus reads. */
  path: string;
  defaultPath: string;
  /** Token name (no `--hydra-` prefix) to CSS colour. */
  palette: Record<string, string>;
  /** Where the matugen template Hydra Plus writes lives. */
  templatePath: string;
  /** The matugen config Hydra Plus can add its template to. */
  configPath: string;
  templateConfigured: boolean;
}

export interface MatugenPaletteSetupResult {
  configPath: string;
  /** False when the config already had the Hydra Plus template. */
  configChanged: boolean;
}
