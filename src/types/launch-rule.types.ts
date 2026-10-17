/** Adds launch options to every game whose folder contains a matching file. */
export interface LaunchRule {
  id: string;
  name: string;
  enabled: boolean;
  /** File or folder names; `*` matches any characters. Any one match applies the rule. */
  files: string[];
  /** Launch options in the usual format, e.g. `VAR=1 %command% -arg`. */
  launchOptions: string;
  /** Set for rules that came from a built-in preset. */
  presetId?: string;
}

export interface GameLaunchRuleMatch {
  ruleId: string;
  name: string;
  /** The first matching file, relative to the game folder. */
  matchedPath: string;
  /** The user turned this rule off for the game. */
  ignored: boolean;
}

export interface GameLaunchAdditions {
  rules: GameLaunchRuleMatch[];
  /** Everything Hydra adds before the game's own launch options, or null. */
  launchOptions: string | null;
}
