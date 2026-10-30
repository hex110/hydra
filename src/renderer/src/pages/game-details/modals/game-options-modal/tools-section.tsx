import { useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { SegmentedControl } from "@renderer/components";
import { gameDetailsContext } from "@renderer/context";
import { useToast } from "@renderer/hooks";
import { logger } from "@renderer/logger";
import type {
  GameCapability,
  GameCapabilityId,
  GameCapabilityMode,
  LibraryGame,
} from "@types";

import type { GameSettingsCategoryId } from "./types";

/** Where each capability's own settings live, when it has more than a mode. */
const DETAILS_CATEGORY: Partial<
  Record<GameCapabilityId, GameSettingsCategoryId>
> = {
  renodx: "renodx",
  optiscaler: "optiscaler",
  mangohud: "compatibility",
};

const statusOf = (capability: GameCapability) =>
  capability.blocked || capability.failed
    ? "failed"
    : capability.active
      ? "done"
      : "never";

export function ToolsSection({
  game,
  onOpenCategory,
}: Readonly<{
  game: LibraryGame;
  onOpenCategory: (category: GameSettingsCategoryId) => void;
}>) {
  const { t } = useTranslation("game_details");
  const { updateGame } = useContext(gameDetailsContext);
  const { showErrorToast } = useToast();
  const [capabilities, setCapabilities] = useState<GameCapability[] | null>(
    null
  );
  const [busyId, setBusyId] = useState<GameCapabilityId | null>(null);

  const refresh = useCallback(() => {
    window.electron
      .getGameCapabilities(game.shop, game.objectId)
      .then(setCapabilities)
      .catch((error) => {
        logger.error("Failed to load game capabilities", error);
        setCapabilities([]);
      });
  }, [game.shop, game.objectId]);

  useEffect(() => {
    refresh();
  }, [refresh, game.executablePath]);

  const changeMode = async (id: GameCapabilityId, mode: GameCapabilityMode) => {
    setBusyId(id);
    try {
      const result = await window.electron.setGameCapabilityMode(
        game.shop,
        game.objectId,
        id,
        mode
      );
      if (!result.ok) {
        showErrorToast(
          t("capability_change_failed", { name: t(`capability_${id}`) }),
          result.message
        );
      }
    } finally {
      setBusyId(null);
      refresh();
      await updateGame();
    }
  };

  return (
    <div className="game-options-modal__section">
      <div className="game-options-modal__header">
        <h2>{t("tools_title")}</h2>
        <h4 className="game-options-modal__header-description">
          {t("tools_description")}
        </h4>
      </div>

      {capabilities === null && (
        <p className="game-options-modal__optiscaler-hint">
          {t("tools_loading")}
        </p>
      )}

      {capabilities?.length === 0 && (
        <p className="game-options-modal__optiscaler-hint">
          {t("tools_empty")}
        </p>
      )}

      {capabilities && capabilities.length > 0 && (
        <ul className="game-options-modal__setup-log">
          {capabilities.map((capability) => {
            const detailsCategory = DETAILS_CATEGORY[capability.id];
            const isBusy = busyId === capability.id;
            return (
              <li
                key={capability.id}
                className="game-options-modal__setup-log-step"
              >
                <span
                  className={`game-options-modal__setup-log-status game-options-modal__setup-log-status--${statusOf(capability)}`}
                >
                  {isBusy
                    ? t("capability_state_working")
                    : capability.failed
                      ? t("capability_state_check_failed")
                      : t(`capability_state_${statusOf(capability)}`)}
                </span>
                <div className="game-options-modal__setup-log-details">
                  <strong>{t(`capability_${capability.id}`)}</strong>
                  <span>
                    {t(
                      `capability_reason_${capability.reason.code}`,
                      capability.reason.params
                    )}
                  </span>
                  {capability.needs.map((need) => (
                    <small key={need.id}>
                      {t(
                        need.met
                          ? "capability_need_met"
                          : "capability_need_unmet",
                        { name: t(`capability_need_${need.id}`) }
                      )}
                      {": "}
                      {t(
                        `capability_reason_${need.reason.code}`,
                        need.reason.params
                      )}
                    </small>
                  ))}
                  {detailsCategory && (
                    <small>
                      <button
                        type="button"
                        className="game-options-modal__link-button"
                        onClick={() => onOpenCategory(detailsCategory)}
                      >
                        {t(`capability_details_${capability.id}`)}
                      </button>
                    </small>
                  )}
                </div>
                {capability.modes.length > 0 && (
                  <SegmentedControl
                    label={t(`capability_${capability.id}`)}
                    value={capability.mode}
                    disabled={busyId !== null}
                    options={capability.modes.map((mode) => ({
                      value: mode,
                      label: t(`capability_mode_${mode}`),
                    }))}
                    onChange={(mode) => void changeMode(capability.id, mode)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
