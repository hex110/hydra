import type { GameShop } from "../types/game.types.js";
import type { GameRun, GameRunMods } from "../types/game-runs.types.js";
import type {
  InstalledMod,
  ModActivityEntry,
  ModGameSupport,
  ModPlayMode,
  ModSource,
  NexusGameMatch,
} from "../types/mods.types.js";

/** Activity lines a report carries. */
export const MOD_REPORT_ACTIVITY_LINES = 200;

export const describeModSource = (source: ModSource) =>
  source.kind === "nexus"
    ? `Nexus Mods ${source.gameDomain}/mods/${source.modId} file ${source.fileId}`
    : `file ${source.fileName}`;

/** One activity entry as a single line of text. */
export const formatModActivityLine = (entry: ModActivityEntry) => {
  const details =
    entry.details && Object.keys(entry.details).length > 0
      ? ` ${JSON.stringify(entry.details)}`
      : "";
  const mod = entry.modName ? ` (${entry.modName})` : "";
  return `${entry.at} [${entry.kind}]${mod} ${entry.message}${details}`;
};

/** The "Mods" part of a run's summary. */
export const formatRunModsSection = (mods: GameRunMods | null | undefined) => {
  if (!mods) return [];
  const lines = [
    "",
    "## Mods",
    "",
    `- Started: ${mods.modded ? "Play (modded)" : "Play (without the loader)"}`,
    `- Loader: ${mods.loader ? `${mods.loader.name}${mods.loader.version ? ` ${mods.loader.version}` : ""}` : "none"}`,
  ];
  if (mods.mods.length === 0) lines.push("- Mods on: none");
  else {
    lines.push(`- Mods on (${mods.mods.length}, in load order):`);
    for (const mod of mods.mods)
      lines.push(
        `  - ${mod.name}${mod.version ? ` ${mod.version}` : ""} (${mod.source})`
      );
  }
  return lines;
};

/** The mods part of a run record, from the list as it is at launch. */
export const buildRunMods = (
  mods: InstalledMod[],
  playMode: ModPlayMode,
  loader: GameRunMods["loader"]
): GameRunMods | null => {
  const enabled = mods.filter((mod) => mod.enabled);
  if (enabled.length === 0 && !loader) return null;
  return {
    modded: playMode === "modded",
    loader: playMode === "modded" ? loader : null,
    mods: enabled.map((mod) => ({
      name: mod.name,
      version: mod.version,
      source: describeModSource(mod.source),
    })),
  };
};

export interface ModReportInput {
  generatedAt: string;
  game: {
    title: string;
    shop: GameShop;
    objectId: string;
    executablePath: string | null;
    protonPath: string | null;
    winePrefixPath: string | null;
  };
  gameFolder: string | null;
  storeFolder: string;
  support: ModGameSupport;
  nexusGame: NexusGameMatch | null;
  profileName: string | null;
  playMode: ModPlayMode;
  loader: GameRunMods["loader"];
  mods: InstalledMod[];
  overridden: Record<string, string[]>;
  deployed: {
    files: number;
    linked: number;
    copied: number;
    backedUp: number;
  } | null;
  lastRun: GameRun | null;
  /** Lines of the loader's log that mention errors. */
  loaderErrors: string[];
  activity: ModActivityEntry[];
}

const count = (amount: number, noun: string) =>
  `${amount} ${noun}${amount === 1 ? "" : "s"}`;

const describeSupport = (input: ModReportInput) => {
  const folder = input.support.modFolder || "the game folder";
  const where =
    input.support.source === "mod-folder-table"
      ? `from Hydra's mod folder table for Nexus game "${input.nexusGame?.domainName}"`
      : "the game folder, since Hydra has no entry for this game";
  return `No support definition. Hydra places files in ${folder} (${where}); it doesn't know this game's loader or mod list.`;
};

/**
 * Everything about a game's mods in one Markdown block, to paste into
 * Claude Code or a bug report.
 */
export const formatModReport = (input: ModReportInput) => {
  const { game } = input;
  const lines = [
    `# Mods report: ${game.title}`,
    "",
    `Generated ${input.generatedAt} by Hydra Plus.`,
    "",
    "## Game",
    "",
    `- Game: ${game.title} (${game.shop}/${game.objectId})`,
    `- Executable: ${game.executablePath ?? "not set"}`,
    `- Mods go into: ${input.gameFolder ?? "unknown (no executable)"}`,
    `- Proton: ${game.protonPath ?? "Hydra's default"}`,
    `- Prefix: ${game.winePrefixPath ?? "Hydra's default for this game"}`,
    `- Nexus game: ${input.nexusGame ? `${input.nexusGame.name} (${input.nexusGame.domainName})` : "not matched"}`,
    `- Mod store: ${input.storeFolder}`,
    "",
    "## Support",
    "",
    describeSupport(input),
    "",
    "## Launch",
    "",
    `- Play starts: ${input.playMode === "modded" ? "Play (modded)" : "Play (without the loader)"}`,
    `- Loader: ${input.loader ? `${input.loader.name}${input.loader.version ? ` ${input.loader.version}` : ""}` : "none"}`,
    "",
    `## Mods${input.profileName ? ` (profile ${input.profileName})` : ""}`,
    "",
  ];

  if (input.mods.length === 0) lines.push("None installed.");
  input.mods.forEach((mod, index) => {
    const overridden = input.overridden[mod.id]?.length ?? 0;
    const notes = [
      mod.enabled ? "on" : "off",
      mod.version ? `version ${mod.version}` : null,
      describeModSource(mod.source),
      `${count(mod.files.length, "file")} into ${mod.deployRoot || "the game folder"}`,
      overridden > 0
        ? `${count(overridden, "file")} replaced by mods below it`
        : null,
      mod.fomodChosen ? "FOMOD options chosen" : null,
      mod.fomod ? "FOMOD archive installed as packed" : null,
      mod.update
        ? `update available: ${mod.update.version ?? mod.update.name}`
        : null,
    ].filter(Boolean);
    lines.push(`${index + 1}. ${mod.name}: ${notes.join(", ")}`);
  });

  lines.push("", "## Deployed", "");
  if (!input.deployed) lines.push("Nothing is deployed.");
  else
    lines.push(
      `${count(input.deployed.files, "file")} in the game folder (${count(input.deployed.linked, "hard link")}, ${input.deployed.copied} ${input.deployed.copied === 1 ? "copy" : "copies"}), ${count(input.deployed.backedUp, "file")} of the game's own backed up.`
    );

  lines.push("", "## Last run", "");
  const run = input.lastRun;
  if (!run) lines.push("The game has not been started from Hydra yet.");
  else {
    lines.push(
      `- Run ${run.id}: ${run.outcome}${run.exitCode !== null ? `, exit code ${run.exitCode}` : ""}${run.signal ? `, signal ${run.signal}` : ""}`,
      `- Started: ${run.mods ? (run.mods.modded ? "Play (modded)" : "Play (without the loader)") : "without mods"}${run.mods ? `, ${run.mods.mods.length} mods on` : ""}`,
      `- Run folder: ${run.directory} (summary.md has the full record)`
    );
  }

  lines.push("", "## Loader log errors", "");
  if (!input.loader) lines.push("No loader, so no loader log.");
  else if (input.loaderErrors.length === 0) lines.push("No error lines found.");
  else lines.push("```", ...input.loaderErrors, "```");

  const activity = input.activity.slice(-MOD_REPORT_ACTIVITY_LINES);
  lines.push(
    "",
    `## Activity (last ${activity.length}, oldest first)`,
    "",
    "```"
  );
  for (const entry of activity) lines.push(formatModActivityLine(entry));
  lines.push("```");

  return `${lines.join("\n")}\n`;
};
