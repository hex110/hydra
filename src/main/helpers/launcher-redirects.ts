import fs from "node:fs";
import path from "node:path";
import type { Game } from "@types";

/**
 * Publisher launchers and the game executable each one starts, relative to
 * the folder the launcher path starts in. Based on bgmod's launcher table
 * (MIT, © 2024 Michał Lewandowski). When one launcher name serves several
 * games, the first target that exists wins.
 */
const LAUNCHER_REDIRECTS: { launcher: string; game: string }[] = [
  { launcher: "REDprelauncher.exe", game: "bin/x64/Cyberpunk2077.exe" },
  { launcher: "REDprelauncher.exe", game: "bin/x64_dx12/witcher3.exe" },
  { launcher: "REDprelauncher.exe", game: "bin/x64/witcher3.exe" },
  { launcher: "Launcher/LariLauncher.exe", game: "bin/bg3_dx11.exe" },
  { launcher: "Launcher.exe", game: "Retail/HITMAN3.exe" },
  { launcher: "Launcher/sop_launcher.exe", game: "SYNCED.exe" },
  { launcher: "launcher/Launcher.exe", game: "binaries/Darktide.exe" },
  {
    launcher: "launcher/Launcher.exe",
    game: "binaries_dx12/vermintide2_dx12.exe",
  },
  {
    launcher: "FactoryGameSteam.exe",
    game: "Engine/Binaries/Win64/FactoryGameSteam-Win64-Shipping.exe",
  },
  { launcher: "boot/ffxivboot.exe", game: "game/ffxiv_dx11.exe" },
  {
    launcher: "Launcher/FuncomLauncher.exe",
    game: "DuneSandbox/Binaries/Win64/DuneSandbox-Win64-Shipping.exe",
  },
];

const segmentsOf = (value: string) => value.split(/[\\/]/).filter(Boolean);

/** Resolves `segments` under `root`, matching each name case-insensitively. */
const findFile = (root: string, segments: string[]): string | null => {
  let current = root;

  for (const [index, segment] of segments.entries()) {
    const entries = (() => {
      try {
        return fs.readdirSync(current, { withFileTypes: true });
      } catch {
        return [];
      }
    })();
    const isLast = index === segments.length - 1;
    const entry = entries.find(
      (item) =>
        item.name.toLowerCase() === segment.toLowerCase() &&
        (isLast ? item.isFile() : item.isDirectory())
    );
    if (!entry) return null;
    current = path.join(current, entry.name);
  }

  return current;
};

/** The game executable that `executablePath`, a known launcher, starts. */
export const findLauncherRedirect = (executablePath: string): string | null => {
  if (path.extname(executablePath).toLowerCase() !== ".exe") return null;

  const pathSegments = segmentsOf(executablePath).map((segment) =>
    segment.toLowerCase()
  );

  for (const redirect of LAUNCHER_REDIRECTS) {
    const launcherSegments = segmentsOf(redirect.launcher.toLowerCase());
    if (launcherSegments.length >= pathSegments.length) continue;

    const tail = pathSegments.slice(-launcherSegments.length);
    if (tail.some((segment, index) => segment !== launcherSegments[index])) {
      continue;
    }

    const root = path.resolve(
      path.dirname(executablePath),
      ...Array(launcherSegments.length - 1).fill("..")
    );
    const target = findFile(root, segmentsOf(redirect.game));
    if (target) return target;
  }

  return null;
};

/** What Hydra runs for a game: the redirect target, unless the game keeps its launcher. */
export const getLaunchExecutable = (
  game: Pick<Game, "useGameLauncher"> | null | undefined,
  executablePath: string
) =>
  game?.useGameLauncher
    ? executablePath
    : (findLauncherRedirect(executablePath) ?? executablePath);
