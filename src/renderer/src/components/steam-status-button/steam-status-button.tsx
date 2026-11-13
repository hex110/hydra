import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import cn from "classnames";

import SteamLogo from "@renderer/assets/steam-logo.svg?react";
import { useSteamState } from "@renderer/hooks/use-steam-state";
import { onSteamAttention } from "@renderer/helpers/steam-attention";
import { logger } from "@renderer/logger";

import "./steam-status-button.scss";

const ATTENTION_MS = 5000;

/**
 * Steam's state in the header: a light that says whether Steam runs, and a
 * button that starts Steam, or shows and focuses its window. It pulses when a
 * feature asks for Steam to be open (`requestSteamAttention`).
 */
export function SteamStatusButton({
  className,
}: Readonly<{ className?: string }>) {
  const { t } = useTranslation("header");
  const state = useSteamState();
  const [attention, setAttention] = useState(false);
  const attentionTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(
    () =>
      onSteamAttention(() => {
        clearTimeout(attentionTimer.current);
        setAttention(true);
        attentionTimer.current = setTimeout(
          () => setAttention(false),
          ATTENTION_MS
        );
      }),
    []
  );
  useEffect(() => () => clearTimeout(attentionTimer.current), []);

  const open = useCallback(() => {
    setAttention(false);
    window.electron
      .openSteam()
      .catch((error) => logger.error("Failed to open Steam", error));
  }, []);

  if (!state?.installed) return null;

  const status = t(state.running ? "steam_running" : "steam_not_running");

  return (
    <button
      type="button"
      className={cn(
        "steam-status-button",
        "header__action-button",
        "header__action-button--outlined",
        {
          "steam-status-button--running": state.running,
          "steam-status-button--attention": attention,
        },
        className
      )}
      onClick={open}
      title={t(state.running ? "steam_show" : "steam_start")}
    >
      <SteamLogo className="steam-status-button__icon" />
      <span className="steam-status-button__label">{t("steam")}</span>
      <span
        className="steam-status-button__light"
        role="img"
        aria-label={status}
        title={status}
      />
    </button>
  );
}
