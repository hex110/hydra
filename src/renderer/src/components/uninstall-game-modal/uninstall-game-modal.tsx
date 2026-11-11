import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { formatBytes } from "@shared";
import type { GameShop, GameUninstallPlan } from "@types";
import { logger } from "@renderer/logger";

import { Button } from "../button/button";
import { CheckboxField } from "../checkbox-field/checkbox-field";
import { Modal } from "../modal/modal";

import "./uninstall-game-modal.scss";

interface UninstallGameModalProps {
  visible: boolean;
  target: { shop: GameShop; objectId: string; title: string } | null;
  onClose: () => void;
  onUninstalled: () => void;
  onError: (message: string) => void;
}

/** Confirms deleting a game Hydra didn't download, listing every folder it removes. */
export function UninstallGameModal({
  visible,
  target,
  onClose,
  onUninstalled,
  onError,
}: Readonly<UninstallGameModalProps>) {
  const { t } = useTranslation("game_details");
  const [plan, setPlan] = useState<GameUninstallPlan | null>(null);
  const [deletePrefix, setDeletePrefix] = useState(true);
  const [uninstalling, setUninstalling] = useState(false);

  const shop = target?.shop;
  const objectId = target?.objectId;

  useEffect(() => {
    if (!visible || !shop || !objectId) return;
    let cancelled = false;
    setPlan(null);
    setDeletePrefix(true);
    globalThis.window.electron
      .getGameUninstallPlan(shop, objectId)
      .then((result) => {
        if (!cancelled) setPlan(result);
      })
      .catch((error) => {
        logger.error("Failed to plan uninstall", error);
        if (!cancelled) setPlan({ ok: false, error: "not-found" });
      });
    return () => {
      cancelled = true;
    };
  }, [visible, shop, objectId]);

  const handleClose = () => {
    if (!uninstalling) onClose();
  };

  const handleUninstall = async () => {
    if (!target || !plan?.ok) return;
    setUninstalling(true);
    try {
      const result = await globalThis.window.electron.uninstallGameFolder(
        target.shop,
        target.objectId,
        {
          folder: plan.folder.path,
          prefix: plan.prefix && deletePrefix ? plan.prefix.path : null,
        }
      );
      if (result.ok) {
        onUninstalled();
      } else {
        onError(
          t(`uninstall_error_${result.error}`, {
            defaultValue: t("remove_files_failed"),
          })
        );
      }
    } catch (error) {
      logger.error("Failed to uninstall game", error);
      onError(t("remove_files_failed"));
    } finally {
      setUninstalling(false);
      onClose();
    }
  };

  const renderBody = () => {
    if (!plan) {
      return <p className="uninstall-game-modal__hint">{t("loading")}</p>;
    }
    if (!plan.ok) {
      return (
        <p className="uninstall-game-modal__hint">
          {t(`uninstall_error_${plan.error}`)}
        </p>
      );
    }
    return (
      <ul className="uninstall-game-modal__list">
        <li className="uninstall-game-modal__item">
          <span className="uninstall-game-modal__hint">
            {t("uninstall_game_folder", {
              size: formatBytes(plan.folder.sizeInBytes),
            })}
          </span>
          <span className="uninstall-game-modal__path">{plan.folder.path}</span>
        </li>
        {plan.prefix && (
          <li className="uninstall-game-modal__item">
            <CheckboxField
              label={
                plan.prefix.sizeInBytes === null
                  ? t("uninstall_prefix_holding_game")
                  : t("uninstall_prefix", {
                      size: formatBytes(plan.prefix.sizeInBytes),
                    })
              }
              checked={deletePrefix}
              disabled={uninstalling}
              onChange={(event) => setDeletePrefix(event.target.checked)}
            />
            <span className="uninstall-game-modal__path">
              {plan.prefix.path}
            </span>
            <span className="uninstall-game-modal__hint">
              {t("uninstall_prefix_hint")}
            </span>
          </li>
        )}
      </ul>
    );
  };

  return (
    <Modal
      visible={visible}
      title={t("uninstall_title", { game: target?.title ?? "" })}
      description={t("uninstall_description")}
      onClose={handleClose}
      clickOutsideToClose={!uninstalling}
    >
      <div className="uninstall-game-modal">
        {renderBody()}

        <div className="uninstall-game-modal__actions">
          <Button theme="outline" disabled={uninstalling} onClick={handleClose}>
            {t("cancel")}
          </Button>
          <Button
            theme="danger"
            disabled={uninstalling || !plan?.ok}
            onClick={() => void handleUninstall()}
          >
            {t("uninstall")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
