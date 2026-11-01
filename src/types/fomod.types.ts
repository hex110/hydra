/** FOMOD installer config as plain data; parsed in main, evaluated in `@shared` fomod. */

export interface FomodFile {
  /** Relative to the folder holding `fomod/`, `/`-separated. */
  source: string;
  /** Relative to where the mod deploys; "" for its root. */
  destination: string;
  isFolder: boolean;
  priority: number;
}

export type FomodPluginType =
  | "Required"
  | "Optional"
  | "Recommended"
  | "NotUsable"
  | "CouldBeUsable";

export interface FomodFlagCondition {
  kind: "flag";
  flag: string;
  value: string;
}

export interface FomodFileCondition {
  kind: "file";
  file: string;
  state: "Active" | "Inactive" | "Missing";
}

/** Game and mod-manager version checks: always met here. */
export interface FomodOtherCondition {
  kind: "other";
}

export interface FomodConditionGroup {
  kind: "group";
  operator: "And" | "Or";
  conditions: FomodCondition[];
}

export type FomodCondition =
  | FomodFlagCondition
  | FomodFileCondition
  | FomodOtherCondition
  | FomodConditionGroup;

export interface FomodPlugin {
  name: string;
  description: string;
  /** Relative to the folder holding `fomod/`. */
  image: string | null;
  files: FomodFile[];
  flags: { name: string; value: string }[];
  defaultType: FomodPluginType;
  /** The first pattern whose condition holds decides the type. */
  typePatterns: { condition: FomodCondition; type: FomodPluginType }[];
}

export type FomodGroupType =
  | "SelectExactlyOne"
  | "SelectAtMostOne"
  | "SelectAtLeastOne"
  | "SelectAll"
  | "SelectAny";

export interface FomodGroup {
  name: string;
  type: FomodGroupType;
  plugins: FomodPlugin[];
}

export interface FomodStep {
  name: string;
  visible: FomodCondition | null;
  groups: FomodGroup[];
}

export interface FomodConfig {
  moduleName: string;
  requiredFiles: FomodFile[];
  steps: FomodStep[];
  conditionalFiles: { condition: FomodCondition; files: FomodFile[] }[];
}

/** A FOMOD archive unpacked and waiting for the user's choices. */
export interface PendingFomodInstall {
  id: string;
  name: string;
  version: string | null;
  moduleName: string;
  createdAt: number;
}

export interface PendingFomodDetails extends PendingFomodInstall {
  config: FomodConfig;
  /** Absolute folder the config's image paths are relative to. */
  imageRoot: string;
}
