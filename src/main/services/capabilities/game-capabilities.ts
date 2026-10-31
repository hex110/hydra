import path from "node:path";

import { db, gamesSublevel, levelKeys } from "@main/level";
import { getLaunchAdditions } from "@main/helpers/launch-additions";
import { isGamemodeAvailable } from "@main/helpers/is-gamemode-available";
import { isMangohudAvailable } from "@main/helpers/is-mangohud-available";
import { resolveGameProton } from "@main/helpers/resolve-proton-path";
import { parseExecutablePath } from "@main/events/helpers/parse-executable-path";
import { clearCapabilityCheck } from "./capability-checks";
import { buildOverviewRow } from "./compatibility-overview-core";
import { GameRuns } from "@main/services/game-runs/game-runs";
import { updateGameRecord } from "@main/services/game-record-updater";
import { logger } from "@main/services/logger";
import { OptiScaler } from "@main/services/optiscaler/optiscaler";
import { getMachineProfile } from "@main/services/machine/machine-profile";
import { RenoDx, canSwitchMonitorToHdr } from "@main/services/renodx/renodx";
import {
  CAPABILITY_LAUNCH_RULES,
  capabilityOverrideFromMode,
  resolveLaunchRules,
  resolveOptiScalerSettings,
  resolveRenoDxNeeds,
  resolveRenoDxSettings,
  withDependencyRuleOverrides,
} from "@shared";
import type {
  CompatibilityOverviewRow,
  Game,
  GameCapability,
  GameCapabilityId,
  GameCapabilityMode,
  GameCapabilityNeed,
  GameShop,
  SetGameCapabilityModeResult,
  UserPreferences,
} from "@types";

import {
  resolveLaunchRuleCapability,
  resolveDiscreteGpu,
  resolveLaunchWrapper,
  resolveOnlineFix,
  resolveOptiScaler,
  resolveRenoDx,
} from "./game-capabilities-core";

const loadPreferences = () =>
  db
    .get<string, UserPreferences | null>(levelKeys.userPreferences, {
      valueEncoding: "json",
    })
    .catch(() => null);

const loadGame = async (shop: GameShop, objectId: string) => {
  const game = await gamesSublevel.get(levelKeys.game(shop, objectId));
  if (!game) throw new Error(`Game not found: ${shop}/${objectId}`);
  return game;
};

const isWindowsGame = (game: Game) =>
  !!game.executablePath &&
  parseExecutablePath(game.executablePath).toLowerCase().endsWith(".exe");

const withCapabilityOverride = (
  game: Game,
  id: GameCapabilityId,
  value: boolean | null
) => {
  const overrides = { ...game.capabilityOverrides };
  if (value === null) delete overrides[id];
  else overrides[id] = value;
  return overrides;
};

/** Hydra's tools and fixes for one game, each with its mode and why it is on or off. */
export const getGameCapabilities = async (
  shop: GameShop,
  objectId: string
): Promise<GameCapability[]> => {
  const game = await loadGame(shop, objectId);
  const isLinux = process.platform === "linux";
  if (!game.executablePath) return [];
  const userPreferences = await loadPreferences();
  const rules = resolveLaunchRules(userPreferences?.launchRules);

  const additions = await getLaunchAdditions({
    objectId,
    gameKey: levelKeys.game(shop, objectId),
    game,
    executablePath: parseExecutablePath(game.executablePath),
    userPreferences,
    prepareMissing: false,
  }).catch((error) => {
    logger.warn("Could not resolve launch rules for capabilities", error);
    return null;
  });
  const ruleTurningOn = (action: "mangohud" | "gamemode") =>
    additions?.rules.find(
      (match) =>
        match.applied &&
        rules.find((rule) => rule.id === match.ruleId)?.actions?.[action] ===
          true
    )?.name ?? null;

  const capabilities: GameCapability[] = [];

  if (isWindowsGame(game)) {
    const [renoDxStatus, optiScalerStatus] = await Promise.all([
      RenoDx.getGameStatus(shop, objectId),
      OptiScaler.getGameStatus(shop, objectId),
    ]);
    const findRule = (id: "hdr" | "hdr_monitor") =>
      rules.find((rule) => rule.id === CAPABILITY_LAUNCH_RULES[id]);
    const canSwitchMonitor = canSwitchMonitorToHdr();
    const machine = getMachineProfile();
    const hdrDisplay = machine.displaysKnown
      ? machine.hdrDisplays.length > 0
      : undefined;
    const renoDxSettings = resolveRenoDxSettings(userPreferences);
    const effectiveOverrides = withDependencyRuleOverrides(game, {
      enableHdrRules: renoDxSettings.enableHdrRules && hdrDisplay !== false,
      canSwitchMonitor,
    });

    // OnlineFix and the HDR rules only exist for Proton launches.
    let renoDxNeeds: GameCapabilityNeed[] = [];
    if (isLinux) {
      const hdr = resolveLaunchRuleCapability("hdr", game, findRule("hdr"), {
        canSwitchMonitor,
        effectiveOverrides,
      });
      const monitor = resolveLaunchRuleCapability(
        "hdr_monitor",
        game,
        findRule("hdr_monitor"),
        { canSwitchMonitor, effectiveOverrides, hdrDisplay }
      );
      const proton = await resolveGameProton(game, additions?.protonPath);
      renoDxNeeds = resolveRenoDxNeeds({
        hdrActive: hdr.active,
        monitorActive: monitor.active,
        canSwitchMonitor,
        protonName: proton.path ? path.basename(proton.path) : null,
        hdrDisplay,
      });
      capabilities.push(resolveOnlineFix(game, userPreferences), hdr, monitor);
    }
    capabilities.push(
      resolveRenoDx(
        game,
        renoDxStatus,
        renoDxSettings.autoInstall,
        renoDxNeeds,
        hdrDisplay
      ),
      resolveOptiScaler(
        game,
        optiScalerStatus,
        resolveOptiScalerSettings(userPreferences).autoInstall
      )
    );
  }

  if (!isLinux) return capabilities;
  const offloadGpu = getMachineProfile().offloadGpu;
  if (offloadGpu) capabilities.push(resolveDiscreteGpu(game, offloadGpu));
  capabilities.push(
    resolveLaunchWrapper("mangohud", game, {
      globallyOn: userPreferences?.autoRunMangohud === true,
      ruleName: ruleTurningOn("mangohud"),
      available: isMangohudAvailable(),
    }),
    resolveLaunchWrapper("gamemode", game, {
      globallyOn: userPreferences?.autoRunGamemode === true,
      ruleName: ruleTurningOn("gamemode"),
      available: isGamemodeAvailable(),
      auto: userPreferences?.autoRunGamemode === undefined,
    })
  );

  return capabilities;
};

const setInstallCapability = async (
  game: Game,
  id: "renodx" | "optiscaler",
  mode: GameCapabilityMode
) => {
  const isRenoDx = id === "renodx";
  const installed = isRenoDx ? !!game.renoDx : !!game.optiScaler;
  const disabledField = isRenoDx
    ? "renoDxAutoInstallDisabled"
    : "optiScalerAutoInstallDisabled";

  if (mode === "off") {
    // Removing also opts the game out of automatic installs.
    if (installed) {
      if (isRenoDx) await RenoDx.uninstall(game.shop, game.objectId);
      else await OptiScaler.uninstall(game.shop, game.objectId);
    }
    await updateGameRecord(
      levelKeys.game(game.shop, game.objectId),
      (current) => ({
        [disabledField]: true,
        capabilityOverrides: withCapabilityOverride(current, id, null),
      })
    );
    return;
  }

  const updated = await updateGameRecord(
    levelKeys.game(game.shop, game.objectId),
    (current) => ({
      [disabledField]: false,
      capabilityOverrides: withCapabilityOverride(
        current,
        id,
        mode === "on" ? true : null
      ),
    })
  );
  if (installed) return;

  const current = updated ?? (await loadGame(game.shop, game.objectId));
  if (mode === "on") {
    if (isRenoDx) await RenoDx.install(game.shop, game.objectId);
    else await OptiScaler.install(game.shop, game.objectId);
    return;
  }
  // Auto: install now if Hydra would have installed it during setup.
  if (isRenoDx) await RenoDx.installIfSupported(current);
  else await OptiScaler.installIfEligible(current);
};

export const setGameCapabilityMode = async (
  shop: GameShop,
  objectId: string,
  id: GameCapabilityId,
  mode: GameCapabilityMode
): Promise<SetGameCapabilityModeResult> => {
  const gameKey = levelKeys.game(shop, objectId);
  try {
    const game = await loadGame(shop, objectId);
    // A chosen mode settles any pending or failed first-run check.
    if (id === "renodx" || id === "optiscaler")
      await clearCapabilityCheck(gameKey, id);
    switch (id) {
      case "online_fix":
        if (mode === "on") throw new Error("OnlineFix cannot be forced on");
        await updateGameRecord(gameKey, { onlineFixDisabled: mode === "off" });
        break;
      case "hdr":
      case "hdr_monitor":
        await updateGameRecord(gameKey, (current) => {
          const overrides = { ...current.launchRuleOverrides };
          const ruleId = CAPABILITY_LAUNCH_RULES[id]!;
          const value = capabilityOverrideFromMode(mode);
          if (value === null) delete overrides[ruleId];
          else overrides[ruleId] = value;
          return { launchRuleOverrides: overrides };
        });
        break;
      case "renodx":
      case "optiscaler":
        await setInstallCapability(game, id, mode);
        break;
      case "discrete_gpu":
        await updateGameRecord(gameKey, (current) => ({
          capabilityOverrides: withCapabilityOverride(
            current,
            id,
            capabilityOverrideFromMode(mode)
          ),
        }));
        break;
      case "mangohud":
      case "gamemode":
        await updateGameRecord(gameKey, (current) => ({
          capabilityOverrides: withCapabilityOverride(
            current,
            id,
            capabilityOverrideFromMode(mode)
          ),
          [id === "mangohud" ? "autoRunMangohud" : "autoRunGamemode"]: null,
        }));
        break;
    }
    return { ok: true };
  } catch (error) {
    logger.error("Failed to set a game capability", {
      gameKey,
      id,
      mode,
      error,
    });
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
};

/** Every library game with an executable against its tools and last run. */
export const getCompatibilityOverview = async (): Promise<
  CompatibilityOverviewRow[]
> => {
  const isLinux = process.platform === "linux";
  const games = (await gamesSublevel.values().all()).filter(
    (game) => !game.isDeleted && game.executablePath
  );
  return games
    .map((game) =>
      buildOverviewRow(game, GameRuns.getLatest(game.shop, game.objectId), {
        isWindows: isWindowsGame(game),
        isLinux,
      })
    )
    .sort((a, b) => a.title.localeCompare(b.title));
};
