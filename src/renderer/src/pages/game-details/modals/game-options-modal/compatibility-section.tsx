import { useTranslation } from "react-i18next";

import { Button, ProtonPathPicker, TextField } from "@renderer/components";
import type { LibraryGame, ProtonVersion } from "@types";
import { FileDirectoryIcon } from "@primer/octicons-react";
import { Tooltip } from "react-tooltip";
import { GameSetupButton } from "./game-setup-button";
import { SetupLogSection } from "./setup-log-section";
import { PrefixTools } from "./prefix-tools";
import { GameMangoHud } from "./game-mangohud";

interface CompatibilitySettingsSectionProps {
  game: LibraryGame;
  displayedWinePrefixPath: string | null;
  winePrefixPlaceholder?: string;
  effectiveProtonName?: string | null;
  protonVersions: ProtonVersion[];
  selectedProtonPath: string;
  winetricksAvailable: boolean;
  onChangeWinePrefixPath: () => Promise<void>;
  onClearWinePrefixPath: () => Promise<void>;
  onOpenWinetricks: () => Promise<void>;
  onChangeProtonVersion: (value: string) => void;
  onOpenTools: () => void;
}

export function CompatibilitySettingsSection({
  game,
  displayedWinePrefixPath,
  winePrefixPlaceholder,
  effectiveProtonName,
  protonVersions,
  selectedProtonPath,
  winetricksAvailable,
  onChangeWinePrefixPath,
  onClearWinePrefixPath,
  onOpenWinetricks,
  onChangeProtonVersion,
  onOpenTools,
}: Readonly<CompatibilitySettingsSectionProps>) {
  const { t } = useTranslation("game_details");

  const showWinetricksUnavailableTooltip = !winetricksAvailable;
  const protonVersionAutoLabel = t("proton_version_auto", {
    ns: ["game_details", "settings"],
    defaultValue: "Auto (global default or umu default)",
  });

  const protonSourceUmuDefault = t("proton_source_umu_default", {
    ns: ["game_details", "settings"],
    defaultValue: "umu default selection",
  });

  const protonSourceSteam = t("proton_source_steam", {
    ns: ["game_details", "settings"],
    defaultValue: "Installed by Steam",
  });

  const protonSourceCompatibilityTools = t(
    "proton_source_compatibility_tools",
    {
      ns: ["game_details", "settings"],
      defaultValue: "Installed in Steam compatibilitytools.d",
    }
  );

  return (
    <>
      <div className="game-options-modal__wine-prefix">
        <div className="game-options-modal__header">
          <h2>{t("wine_prefix")}</h2>
          <h4 className="game-options-modal__header-description">
            {t("wine_prefix_description")}
          </h4>
        </div>

        <TextField
          value={displayedWinePrefixPath || ""}
          readOnly
          theme="dark"
          disabled
          placeholder={winePrefixPlaceholder ?? t("no_directory_selected")}
          rightContent={
            <>
              <Button
                type="button"
                theme="outline"
                onClick={onChangeWinePrefixPath}
              >
                <FileDirectoryIcon />
                {t("select_executable")}
              </Button>
              {game.winePrefixPath && (
                <Button onClick={onClearWinePrefixPath} theme="outline">
                  {t("clear")}
                </Button>
              )}
            </>
          }
        />

        <div className="game-options-modal__row">
          <span
            className="game-options-modal__tool-button-wrapper"
            data-tooltip-id="winetricks-unavailable-tooltip"
            data-tooltip-content={
              showWinetricksUnavailableTooltip
                ? t("winetricks_not_available_tooltip")
                : undefined
            }
          >
            <Button
              type="button"
              theme="outline"
              onClick={onOpenWinetricks}
              disabled={!winetricksAvailable}
            >
              {t("open_winetricks")}
            </Button>
          </span>

          {showWinetricksUnavailableTooltip && (
            <Tooltip id="winetricks-unavailable-tooltip" />
          )}

          <GameSetupButton game={game} />
        </div>

        <p className="game-options-modal__header-description">
          {t("compatibility_tools_moved")}{" "}
          <button
            type="button"
            className="game-options-modal__link-button"
            onClick={onOpenTools}
          >
            {t("compatibility_open_tools")}
          </button>
        </p>
      </div>

      <SetupLogSection game={game} />
      <PrefixTools game={game} />
      <GameMangoHud game={game} />

      <div className="game-options-modal__section">
        <div className="game-options-modal__header">
          <h2>{t("proton_version")}</h2>
          <h4 className="game-options-modal__header-description">
            {t("proton_version_description")}
          </h4>
        </div>

        <ProtonPathPicker
          versions={protonVersions}
          selectedPath={selectedProtonPath}
          onChange={onChangeProtonVersion}
          radioName={`proton-version-${game.objectId}`}
          autoLabel={protonVersionAutoLabel}
          autoSourceDescription={effectiveProtonName ?? protonSourceUmuDefault}
          steamSourceDescription={protonSourceSteam}
          compatibilityToolsSourceDescription={protonSourceCompatibilityTools}
        />
      </div>
    </>
  );
}
