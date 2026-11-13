import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SyncIcon } from "@primer/octicons-react";

import { requestSteamAttention } from "@renderer/helpers/steam-attention";
import { useToast } from "@renderer/hooks/use-toast";
import { logger } from "@renderer/logger";
import type { SteamUpdateResult } from "@types";

import { Button, type ButtonProps } from "../button/button";
import { ConfirmationModal } from "../confirmation-modal/confirmation-modal";

interface SteamUpdateButtonProps {
  appId: string;
  title: string;
  size?: ButtonProps["size"];
  theme?: ButtonProps["theme"];
  className?: string;
  children?: ReactNode;
}

/**
 * Has Steam update a game installed through Steam. Steam does the download, so
 * it has to be open: when it is not, the Steam button in the header pulses and
 * the player is asked whether Hydra should start Steam first.
 */
export function SteamUpdateButton({
  appId,
  title,
  size,
  theme = "outline",
  className,
  children,
}: Readonly<SteamUpdateButtonProps>) {
  const { t } = useTranslation("game_details");
  const { showSuccessToast, showErrorToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [askToStart, setAskToStart] = useState(false);

  const run = async (startSteam: boolean) => {
    setBusy(true);
    let result: SteamUpdateResult | null = null;
    try {
      result = await window.electron.updateSteamGame(appId, startSteam);
    } catch (error) {
      logger.error("Failed to update the game through Steam", error);
    } finally {
      setBusy(false);
    }

    switch (result) {
      case "started":
        setAskToStart(false);
        showSuccessToast(t("steam_update_started", { title }));
        break;
      case "steam-not-running":
        requestSteamAttention();
        setAskToStart(true);
        break;
      case "steam-not-installed":
        setAskToStart(false);
        showErrorToast(t("steam_update_not_installed"));
        break;
      case "steam-start-failed":
        setAskToStart(false);
        requestSteamAttention();
        showErrorToast(t("steam_update_start_failed"));
        break;
      default:
        setAskToStart(false);
        showErrorToast(t("steam_update_failed"));
    }
  };

  return (
    <>
      <Button
        size={size}
        theme={theme}
        className={className}
        disabled={busy}
        onClick={() => void run(false)}
      >
        {children ?? (
          <>
            <SyncIcon size={14} />
            {t("update_through_steam")}
          </>
        )}
      </Button>
      <ConfirmationModal
        visible={askToStart}
        title={t("steam_update_needs_steam_title")}
        descriptionText={t("steam_update_needs_steam", { title })}
        confirmButtonLabel={
          busy ? t("steam_update_starting") : t("steam_update_start_steam")
        }
        cancelButtonLabel={t("cancel")}
        buttonsIsDisabled={busy}
        onConfirm={() => void run(true)}
        onClose={() => setAskToStart(false)}
      />
    </>
  );
}
