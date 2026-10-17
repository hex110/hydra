/**
 * Adds launch options to every game, or to every game whose folder contains
 * a matching file. Each game can override whether a rule applies to it.
 */
export interface LaunchRule {
  id: string;
  name: string;
  /** Whether the rule applies to the games it matches, unless a game overrides it. */
  enabled: boolean;
  /** Applies to every game instead of only games containing `files`. */
  matchAllGames?: boolean;
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
  /** The first matching file, relative to the game folder; null for rules that match every game. */
  matchedPath: string | null;
  /** The rule's global setting. */
  enabledByDefault: boolean;
  /** The game's own choice, or null when it follows the rule's setting. */
  override: boolean | null;
  /** Whether the rule's launch options are added for this game. */
  applied: boolean;
}

export interface GameLaunchAdditions {
  rules: GameLaunchRuleMatch[];
  /** Everything Hydra adds before the game's own launch options, or null. */
  launchOptions: string | null;
}
