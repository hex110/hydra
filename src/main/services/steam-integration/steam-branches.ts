import fs from "node:fs";
import path from "node:path";
import { shell } from "electron";
import type { SteamBranchesInfo, SteamBranchSwitchResult } from "@types";
import { steamSyncLogger } from "../logger";
import { loadSteamAppInfo } from "./steam-launch-executables";
import { findSteamManifest } from "./steam-manifest";
import { setSteamManifestBranch } from "./steam-manifest-core";
import { runSteamBranchSwitch } from "./steam-branch-switch-core";
import { SteamStateService } from "./steam-state";

const SHUTDOWN_TIMEOUT_MS = 30_000;
const START_TIMEOUT_MS = 60_000;
// Steam takes a moment after starting before it handles steam:// URLs.
const SETTLE_MS = 8_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const getSteamBranches = async (
  appId: string
): Promise<SteamBranchesInfo | null> => {
  const [manifest, appInfos] = await Promise.all([
    findSteamManifest(appId),
    loadSteamAppInfo([appId]),
  ]);
  const branches = appInfos.get(appId)?.branches ?? [];
  if (!manifest || branches.length === 0) return null;

  return {
    current: manifest.state.betaKey ?? "public",
    branches: branches.map((branch) => ({
      name: branch.name,
      description: branch.description,
      buildId: branch.buildId,
      updatedAt: branch.updatedAt,
      locked: branch.passwordRequired,
    })),
  };
};

/**
 * Makes Steam follow another branch of an installed game, then has it download
 * that branch. Steam is closed while the manifest is edited (see
 * `runSteamBranchSwitch`) and started again afterwards.
 */
export const switchSteamBranch = async (
  appId: string,
  branchName: string
): Promise<SteamBranchSwitchResult> => {
  const [initial, appInfos] = await Promise.all([
    findSteamManifest(appId),
    loadSteamAppInfo([appId]),
  ]);
  if (!initial) return "not-installed";

  const branch = appInfos
    .get(appId)
    ?.branches.find((candidate) => candidate.name === branchName);
  const manifestPath = initial.path;

  try {
    return await runSteamBranchSwitch({
      branch: () =>
        branch
          ? { name: branch.name, passwordRequired: branch.passwordRequired }
          : null,
      isSteamRunning: async () => (await SteamStateService.refresh()).running,
      shutdownSteam: () => SteamStateService.shutdown(SHUTDOWN_TIMEOUT_MS),
      // Steam rewrote the manifest on its way out: read it again.
      readManifest: () =>
        fs.promises.readFile(manifestPath, "utf8").catch(() => null),
      backupManifest: () =>
        fs.promises.copyFile(
          manifestPath,
          path.join(
            path.dirname(manifestPath),
            `hydra-backup-${path.basename(manifestPath)}`
          )
        ),
      editManifest: (content) => setSteamManifestBranch(content, branchName),
      writeManifest: (content) => fs.promises.writeFile(manifestPath, content),
      startSteam: async () => {
        await SteamStateService.open();
        if (!(await SteamStateService.waitFor(true, START_TIMEOUT_MS))) {
          return false;
        }
        await sleep(SETTLE_MS);
        return true;
      },
      validate: () => shell.openExternal(`steam://validate/${appId}`),
    });
  } catch (error) {
    steamSyncLogger.error("Switching a Steam branch failed", error);
    throw error;
  }
};
