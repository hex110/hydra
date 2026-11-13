export type SteamBranchSwitchOutcome =
  | "switched"
  | "unknown-branch"
  | "branch-locked"
  | "steam-would-not-close"
  | "manifest-unreadable"
  | "manifest-unwritable"
  | "steam-start-failed";

export interface SteamBranchSwitchSteps {
  /** The branch's state in Steam's app cache; null when it has no such branch. */
  branch: () => { name: string; passwordRequired: boolean } | null;
  isSteamRunning: () => Promise<boolean>;
  /** Asks Steam to exit and waits for it; false when it is still running. */
  shutdownSteam: () => Promise<boolean>;
  readManifest: () => Promise<string | null>;
  backupManifest: () => Promise<void>;
  /** The manifest with the branch set, null when it cannot be edited. */
  editManifest: (content: string) => string | null;
  writeManifest: (content: string) => Promise<void>;
  /** Starts Steam, waits until it runs and has settled; false on timeout. */
  startSteam: () => Promise<boolean>;
  /** Has Steam download the new branch's files. */
  validate: () => Promise<void>;
}

/**
 * The branch switch in the only order that works: Steam rewrites its manifests
 * while it runs, so it is closed first and the manifest is read and written
 * only after that, with a copy kept beside it. Nothing is written while Steam
 * still runs.
 */
export const runSteamBranchSwitch = async (
  steps: SteamBranchSwitchSteps
): Promise<SteamBranchSwitchOutcome> => {
  const branch = steps.branch();
  if (!branch) return "unknown-branch";
  if (branch.passwordRequired) return "branch-locked";

  if ((await steps.isSteamRunning()) && !(await steps.shutdownSteam())) {
    return "steam-would-not-close";
  }

  const content = await steps.readManifest();
  const edited = content === null ? null : steps.editManifest(content);
  if (edited === null) return "manifest-unreadable";

  try {
    await steps.backupManifest();
    await steps.writeManifest(edited);
  } catch {
    return "manifest-unwritable";
  }

  if (!(await steps.startSteam())) return "steam-start-failed";

  await steps.validate();
  return "switched";
};
