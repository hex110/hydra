import { useEffect, useState } from "react";
import type { GameLauncherStatusPayload } from "@types";
import {
  getLaunchPhase,
  type CompatibilityLayerStatus,
  type LaunchPhase,
} from "../../game-launcher/game-launcher-state";

/** Follows the launcher statuses of one game while `active`. */
export function useLaunchPhase(
  shop: string | undefined,
  objectId: string | undefined,
  active: boolean
) {
  const [phase, setPhase] = useState<LaunchPhase>("start");
  const [gameStarted, setGameStarted] = useState(false);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    if (!active || !shop || !objectId) {
      setPhase("start");
      setGameStarted(false);
      setEnded(false);
      return;
    }

    const gameKey = `${shop}:${objectId}`;
    let preflightStatus = "idle";
    let compatibilityLayerStatus: CompatibilityLayerStatus = "idle";
    let achievementsExportStatus = "idle";

    const update = () =>
      setPhase(
        getLaunchPhase({
          preflightStatus,
          compatibilityLayerStatus,
          achievementsExportStatus,
        })
      );

    const stopPreflight = window.electron.onPreflightProgress?.(
      ({ status }) => {
        preflightStatus = status;
        update();
      }
    );

    const stopStatus = window.electron.onGameLauncherStatus?.(
      (payload: GameLauncherStatusPayload) => {
        if (payload.gameKey !== gameKey) return;

        if (payload.status === "preparing_compatibility_layer") {
          compatibilityLayerStatus = "preparing";
        } else if (payload.status === "launch_cancelled") {
          setEnded(true);
        } else if (
          payload.status === "compatibility_layer_failed" ||
          payload.status === "game_exited_early"
        ) {
          compatibilityLayerStatus = "failed";
          setEnded(true);
        } else if (payload.status === "game_started") {
          compatibilityLayerStatus = "idle";
          setGameStarted(true);
        } else if (payload.status === "compatibility_layer_ready") {
          compatibilityLayerStatus = "idle";
        } else {
          achievementsExportStatus = payload.status;
        }

        update();
      }
    );

    return () => {
      stopPreflight?.();
      stopStatus?.();
    };
  }, [active, shop, objectId]);

  return { phase, gameStarted, ended };
}
