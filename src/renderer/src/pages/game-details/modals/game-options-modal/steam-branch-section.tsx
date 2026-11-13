import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button, ConfirmationModal, SelectField } from "@renderer/components";
import { requestSteamAttention } from "@renderer/helpers/steam-attention";
import { useLibrary, useToast } from "@renderer/hooks";
import { logger } from "@renderer/logger";
import type {
  LibraryGame,
  SteamBranchInfo,
  SteamBranchesInfo,
  SteamBranchSwitchResult,
} from "@types";

interface SteamBranchSectionProps {
  game: LibraryGame;
  deleting: boolean;
}

const ERROR_KEYS: Record<
  Exclude<SteamBranchSwitchResult, "switched">,
  string
> = {
  "not-installed": "steam_branch_error_not_installed",
  "unknown-branch": "steam_branch_error_unknown",
  "branch-locked": "steam_branch_error_locked",
  "steam-would-not-close": "steam_branch_error_close",
  "manifest-unreadable": "steam_branch_error_manifest",
  "manifest-unwritable": "steam_branch_error_write",
  "steam-start-failed": "steam_branch_error_start",
};

/** The beta a Steam game follows; a game installed through Steam only. */
export function SteamBranchSection({
  game,
  deleting,
}: Readonly<SteamBranchSectionProps>) {
  const { t, i18n } = useTranslation("game_details");
  const { updateLibrary } = useLibrary();
  const { showSuccessToast, showErrorToast } = useToast();
  const [info, setInfo] = useState<SteamBranchesInfo | null>(null);
  const [selected, setSelected] = useState("public");
  const [confirming, setConfirming] = useState(false);
  const [switching, setSwitching] = useState(false);

  const isSteamGame = game.shop === "steam" && !!game.executablePath;

  const load = useCallback(async () => {
    const next = await window.electron
      .getSteamBranches(game.objectId)
      .catch(() => null);
    setInfo(next);
    if (next) setSelected(next.current);
  }, [game.objectId]);

  useEffect(() => {
    if (isSteamGame) void load();
    else setInfo(null);
  }, [isSteamGame, load]);

  if (!isSteamGame || !info) return null;

  const open = info.branches.filter((branch) => !branch.locked);
  const lockedCount = info.branches.length - open.length;
  if (open.length < 2) return null;

  const describe = (branch: SteamBranchInfo) =>
    [
      branch.description,
      branch.buildId
        ? t("steam_branch_build", { build: branch.buildId })
        : null,
      branch.updatedAt
        ? new Date(branch.updatedAt * 1000).toLocaleDateString(i18n.language)
        : null,
    ]
      .filter(Boolean)
      .join(" · ");
  const selectedBranch = open.find((branch) => branch.name === selected);

  const labelOf = (branch: SteamBranchInfo) =>
    branch.name === "public"
      ? t("steam_branch_public")
      : branch.name +
        (branch.name === info.current ? ` (${t("steam_branch_current")})` : "");

  const switchBranch = async () => {
    setSwitching(true);
    let result: SteamBranchSwitchResult | null = null;
    try {
      result = await window.electron.switchSteamBranch(game.objectId, selected);
    } catch (error) {
      logger.error("Failed to switch the Steam branch", error);
    } finally {
      setSwitching(false);
      setConfirming(false);
    }

    if (result === "switched") {
      showSuccessToast(
        t("steam_branch_switched", { title: game.title, branch: selected })
      );
    } else {
      if (result === "steam-would-not-close" || result === "steam-start-failed")
        requestSteamAttention();
      showErrorToast(
        t(result ? ERROR_KEYS[result] : "steam_branch_error_unknown")
      );
    }

    await load();
    void updateLibrary();
  };

  return (
    <div className="game-options-modal__downloads">
      <div className="game-options-modal__header">
        <h2>{t("steam_branch_title")}</h2>
        <h4 className="game-options-modal__header-description">
          {t("steam_branch_description")}
        </h4>
      </div>

      <SelectField
        value={selected}
        block
        disabled={deleting || switching}
        options={open.map((branch) => ({
          key: branch.name,
          value: branch.name,
          label: labelOf(branch),
        }))}
        onChange={(event) => setSelected(event.target.value)}
      />

      {selectedBranch && describe(selectedBranch) && (
        <p className="game-options-modal__header-description">
          {describe(selectedBranch)}
        </p>
      )}
      {lockedCount > 0 && (
        <p className="game-options-modal__header-description">
          {t("steam_branch_locked", { count: lockedCount })}
        </p>
      )}

      <div className="game-options-modal__row">
        <Button
          theme="outline"
          disabled={deleting || switching || selected === info.current}
          onClick={() => setConfirming(true)}
        >
          {t("steam_branch_switch")}
        </Button>
      </div>

      <ConfirmationModal
        visible={confirming}
        title={t("steam_branch_confirm_title", { branch: selected })}
        descriptionText={t("steam_branch_confirm", { title: game.title })}
        confirmButtonLabel={
          switching
            ? t("steam_branch_switching")
            : t("steam_branch_confirm_button")
        }
        cancelButtonLabel={t("cancel")}
        buttonsIsDisabled={switching}
        onConfirm={() => void switchBranch()}
        onClose={() => !switching && setConfirming(false)}
      />
    </div>
  );
}
