import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button, SplitButton } from "@renderer/components";
import { useLibrary, useToast } from "@renderer/hooks";
import { logger } from "@renderer/logger";
import type { GameInstallerInfo, InstallerRunMode, LibraryGame } from "@types";

interface InstallerSectionProps {
  game: LibraryGame;
  deleting: boolean;
}

export function InstallerSection({
  game,
  deleting,
}: Readonly<InstallerSectionProps>) {
  const { t } = useTranslation("game_details");
  const { updateLibrary } = useLibrary();
  const { showErrorToast } = useToast();
  const [installer, setInstaller] = useState<GameInstallerInfo | null>(null);

  const folderName = game.download?.folderName;
  const extracting = game.download?.extracting;

  useEffect(() => {
    let cancelled = false;

    globalThis.window.electron
      .getGameInstallerInfo(game.shop, game.objectId)
      .then((info) => {
        if (!cancelled) setInstaller(info);
      })
      .catch(() => {
        if (!cancelled) setInstaller(null);
      });

    return () => {
      cancelled = true;
    };
  }, [game.shop, game.objectId, folderName, extracting]);

  if (!installer) return null;

  const running = !!game.download?.installerRunning;

  const runInstaller = async (mode: InstallerRunMode) => {
    const opened = await globalThis.window.electron
      .openGameInstaller(game.shop, game.objectId, mode)
      .catch((error) => {
        logger.error("Failed to open game installer", error);
        return false;
      });

    if (!opened) showErrorToast(t("installer_launch_failed"));
    updateLibrary();
  };

  const showInstaller = () =>
    void globalThis.window.electron.showGameInstaller(game.shop, game.objectId);

  const disabled = deleting || running;
  const runLabel = running ? t("installer_running") : t("run_installer");

  return (
    <div className="game-options-modal__downloads">
      <div className="game-options-modal__header">
        <h2>{t("installer_section_title")}</h2>
        <h4 className="game-options-modal__header-description">
          {t("installer_section_description", { name: installer.name })}
        </h4>
      </div>

      <div className="game-options-modal__row">
        {installer.supportsUnattended ? (
          <SplitButton
            onClick={() => void runInstaller("default")}
            disabled={disabled}
            menuLabel={t("run_installer_menu")}
            options={[
              {
                id: "unattended",
                label: t("run_installer_unattended"),
                hint: t("run_installer_unattended_hint"),
                onSelect: () => void runInstaller("unattended"),
              },
              {
                id: "wizard",
                label: t("run_installer_wizard"),
                hint: t("run_installer_wizard_hint"),
                onSelect: () => void runInstaller("wizard"),
              },
            ]}
          >
            {runLabel}
          </SplitButton>
        ) : (
          <Button
            onClick={() => void runInstaller("default")}
            theme="outline"
            disabled={disabled}
          >
            {runLabel}
          </Button>
        )}
        <Button onClick={showInstaller} theme="outline" disabled={deleting}>
          {t("show_installer_file")}
        </Button>
      </div>
    </div>
  );
}
