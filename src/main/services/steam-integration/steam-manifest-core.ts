/** Fields of an `appmanifest_<id>.acf` that Hydra reads. */
export interface SteamManifestState {
  appId: string | null;
  name: string | null;
  stateFlags: number | null;
  buildId: string | null;
  targetBuildId: string | null;
  /** 0 always, 1 only when launched, 2 high priority. */
  autoUpdateBehavior: number | null;
  /** The branch picked in Steam's properties; null for the default one. */
  betaKey: string | null;
}

export const STEAM_STATE_FULLY_INSTALLED = 4;
export const STEAM_STATE_UPDATE_REQUIRED = 2;

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const valuePattern = (key: string) =>
  new RegExp(`"${escapeRegExp(key)}"\\s*"((?:\\\\.|[^"\\\\])*)"`, "i");

const readValue = (content: string, key: string): string | null => {
  const match = content.match(valuePattern(key));
  if (!match) return null;

  return match[1].replaceAll("\\\\", "\\").replaceAll('\\"', '"');
};

/** The text of a `"Name" { ... }` section, without its braces. */
const readSection = (content: string, name: string): string | null => {
  const match = new RegExp(
    `"${escapeRegExp(name)}"\\s*\\{([^}]*)\\}`,
    "i"
  ).exec(content);
  return match ? match[1] : null;
};

const toNumber = (value: string | null) => {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
};

export const parseSteamManifestState = (
  content: string
): SteamManifestState => {
  const userConfig = readSection(content, "UserConfig");
  const betaKey = userConfig ? readValue(userConfig, "BetaKey") : null;

  return {
    appId: readValue(content, "appid"),
    name: readValue(content, "name"),
    stateFlags: toNumber(readValue(content, "StateFlags")),
    buildId: readValue(content, "buildid"),
    targetBuildId: readValue(content, "TargetBuildID"),
    autoUpdateBehavior: toNumber(readValue(content, "AutoUpdateBehavior")),
    betaKey: betaKey && betaKey !== "public" ? betaKey : null,
  };
};

export interface SteamUpdateStatus {
  branch: string;
  installedBuildId: string;
  /** Build of the branch in Steam's app cache; null when it has none. */
  availableBuildId: string | null;
}

const isNewerBuild = (available: string, installed: string) => {
  try {
    return BigInt(available) > BigInt(installed);
  } catch {
    return false;
  }
};

/**
 * Whether Steam has a newer build for an installed app. Steam's own marks
 * (update-required flag, a target build that differs from the installed one)
 * count, and so does a branch build in appinfo newer than the installed one.
 * Appinfo is a cache that Steam refreshes while it runs, so a stale cache can
 * only hide an update, never invent one: builds are compared with `>`.
 */
export const findSteamUpdate = (
  state: SteamManifestState,
  branches: { name: string; buildId: string | null }[]
): SteamUpdateStatus | null => {
  if (
    state.stateFlags === null ||
    (state.stateFlags & STEAM_STATE_FULLY_INSTALLED) === 0 ||
    !state.buildId
  ) {
    return null;
  }

  const branch = state.betaKey ?? "public";
  const branchBuildId =
    branches.find((candidate) => candidate.name === branch)?.buildId ?? null;
  const targetDiffers =
    !!state.targetBuildId &&
    state.targetBuildId !== "0" &&
    state.targetBuildId !== state.buildId;
  const flagged = (state.stateFlags & STEAM_STATE_UPDATE_REQUIRED) !== 0;
  const behind = !!branchBuildId && isNewerBuild(branchBuildId, state.buildId);

  if (!flagged && !targetDiffers && !behind) return null;

  return {
    branch,
    installedBuildId: state.buildId,
    availableBuildId: behind
      ? branchBuildId
      : targetDiffers
        ? state.targetBuildId
        : branchBuildId,
  };
};

const lineBreakOf = (content: string) =>
  content.includes("\r\n") ? "\r\n" : "\n";

/**
 * Sets the branch Steam should follow (`null` for the default one) and marks
 * the app as needing an update, leaving every other byte of the manifest as
 * it was. `MountedConfig` keeps the branch that is installed, which is how
 * Steam notices the difference. Returns null when the manifest has no
 * `StateFlags` to mark.
 */
export const setSteamManifestBranch = (
  content: string,
  branch: string | null
): string | null => {
  const flagsMatch = /("StateFlags"\s*")(\d+)(")/i.exec(content);
  if (!flagsMatch) return null;

  const lineBreak = lineBreakOf(content);
  const nextFlags = Number(flagsMatch[2]) | STEAM_STATE_UPDATE_REQUIRED;
  let next =
    content.slice(0, flagsMatch.index) +
    `${flagsMatch[1]}${nextFlags}${flagsMatch[3]}` +
    content.slice(flagsMatch.index + flagsMatch[0].length);

  const section = /("UserConfig"\s*\{)([^}]*)(\})/i.exec(next);
  const betaLine = /[ \t]*"BetaKey"[ \t]*"(?:\\.|[^"\\])*"[ \t]*(?:\r?\n)?/i;
  const keep = branch !== null && branch !== "public";

  if (section) {
    let body = section[2];
    if (betaLine.test(body)) {
      body = keep
        ? body.replace(
            /("BetaKey"[ \t]*")(?:\\.|[^"\\])*(")/i,
            (_all, open: string, close: string) =>
              `${open}${branch.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}${close}`
          )
        : body.replace(betaLine, "");
    } else if (keep) {
      const indent = /([ \t]+)"/.exec(body)?.[1] ?? "\t\t";
      const closingIndent = /([ \t]*)$/.exec(body)?.[1] ?? "\t";
      const trimmed = body.slice(0, body.length - closingIndent.length);
      const endsWithBreak = /\n$/.test(trimmed);
      body = `${trimmed}${endsWithBreak ? "" : lineBreak}${indent}"BetaKey"\t\t"${branch}"${lineBreak}${closingIndent}`;
    }
    next =
      next.slice(0, section.index) +
      section[1] +
      body +
      section[3] +
      next.slice(section.index + section[0].length);
  } else if (keep) {
    const closing = next.lastIndexOf("}");
    if (closing === -1) return null;
    next =
      next.slice(0, closing) +
      `\t"UserConfig"${lineBreak}\t{${lineBreak}\t\t"BetaKey"\t\t"${branch}"${lineBreak}\t}${lineBreak}` +
      next.slice(closing);
  }

  return next;
};
