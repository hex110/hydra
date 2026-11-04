import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileDirectoryIcon, FileIcon } from "@primer/octicons-react";

import {
  Button,
  CheckboxField,
  Link,
  Modal,
  SelectField,
} from "@renderer/components";
import { logger } from "@renderer/logger";
import { applyPlacementChoices } from "@shared";
import type {
  GameShop,
  ModPlacementChoice,
  PendingModPlacementDetails,
} from "@types";

import { useModActionToast } from "./mods";

interface ModPlacementDialogProps {
  shop: GameShop;
  objectId: string;
  pendingId: string | null;
  onClose: () => void;
  onDone: () => void;
}

const PREVIEW_FILES = 12;

const choiceValue = (choice: ModPlacementChoice) =>
  choice.mode === "skip" ? "skip|" : `${choice.mode}|${choice.target}`;

/**
 * Where a mod's files go, when Hydra isn't sure: the mod's description beside
 * its archive's top-level entries, each with a place to pick. Hydra's guess
 * is preselected; the result deploys like any other mod.
 */
export function ModPlacementDialog({
  shop,
  objectId,
  pendingId,
  onClose,
  onDone,
}: Readonly<ModPlacementDialogProps>) {
  const { t } = useTranslation("mods");
  const reportResult = useModActionToast();
  const [pending, setPending] = useState<PendingModPlacementDetails | null>(
    null
  );
  const [choices, setChoices] = useState<ModPlacementChoice[]>([]);
  const [example, setExample] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    setPending(null);
    setExample(false);
    if (!pendingId) return;
    window.electron
      .getPendingModPlacement(shop, objectId, pendingId)
      .then((details) => {
        setPending(details);
        setChoices(
          details.entries.map(
            (entry) =>
              details.guess.find((choice) => choice.entry === entry.name) ?? {
                entry: entry.name,
                mode: "folder",
                target: "",
              }
          )
        );
      })
      .catch((error) => {
        logger.error("Failed to read the mod waiting for placement", error);
        onClose();
      });
  }, [shop, objectId, pendingId, onClose]);

  const preview = useMemo(
    () => (pending ? applyPlacementChoices(pending.files, choices) : []),
    [pending, choices]
  );

  const folderLabel = (target: string) => target || t("placement_game_folder");

  const optionsFor = (entry: PendingModPlacementDetails["entries"][number]) => {
    if (!pending) return [];
    const options = pending.targets.flatMap((target) => [
      {
        key: `folder|${target}`,
        value: `folder|${target}`,
        label: t(
          entry.isFolder ? "placement_option_folder" : "placement_option_file",
          { name: entry.name, folder: folderLabel(target) }
        ),
      },
      ...(entry.isFolder
        ? [
            {
              key: `contents|${target}`,
              value: `contents|${target}`,
              label: t("placement_option_contents", {
                name: entry.name,
                folder: folderLabel(target),
              }),
            },
          ]
        : []),
    ]);
    return [
      ...options,
      { key: "skip|", value: "skip|", label: t("placement_option_skip") },
    ];
  };

  const choose = (entry: string, value: string) => {
    const [mode, ...rest] = value.split("|");
    setChoices((current) =>
      current.map((choice) =>
        choice.entry === entry
          ? {
              entry,
              mode: mode as ModPlacementChoice["mode"],
              target: rest.join("|"),
            }
          : choice
      )
    );
  };

  const install = async () => {
    if (!pendingId) return;
    setInstalling(true);
    try {
      const result = await window.electron.completeModPlacement(
        shop,
        objectId,
        pendingId,
        choices,
        example
      );
      if (reportResult(result)) onDone();
    } finally {
      setInstalling(false);
    }
  };

  const openFolders = () => {
    if (pendingId)
      void window.electron.openModPlacementFolder(shop, objectId, pendingId);
  };

  return (
    <Modal
      visible={pendingId !== null && pending !== null}
      title={t("placement_title", { name: pending?.name ?? "" })}
      description={pending ? t(`placement_reason_${pending.reason}`) : ""}
      onClose={onClose}
      large
    >
      {pending && (
        <div className="mods__placement">
          {pending.programs.length > 0 && (
            <p className="mods__state--error">
              {t("placement_programs", { files: pending.programs.join(", ") })}
            </p>
          )}
          <div className="mods__placement-body">
            <div className="mods__placement-description">
              <h3 className="mods__placement-heading">
                {t("placement_description")}
              </h3>
              {pending.description ? (
                <p className="mods__fomod-description">{pending.description}</p>
              ) : (
                <p className="mods__hint">{t("placement_no_description")}</p>
              )}
              {pending.pageUrl && (
                <Link to={pending.pageUrl}>{t("mod_page")}</Link>
              )}
            </div>
            <div className="mods__placement-entries">
              <h3 className="mods__placement-heading">
                {t("placement_entries")}
              </h3>
              {pending.entries.map((entry) => {
                const choice = choices.find(
                  (item) => item.entry === entry.name
                );
                return (
                  <div key={entry.name} className="mods__placement-entry">
                    <span className="mods__placement-name">
                      {entry.isFolder ? (
                        <FileDirectoryIcon size={14} />
                      ) : (
                        <FileIcon size={14} />
                      )}
                      {entry.name}
                      {entry.isFolder && (
                        <span className="mods__hint">
                          {t("placement_files", { count: entry.files })}
                        </span>
                      )}
                    </span>
                    <SelectField
                      block
                      theme="dark"
                      value={choice ? choiceValue(choice) : "folder|"}
                      options={optionsFor(entry)}
                      onChange={(event) =>
                        choose(entry.name, event.target.value)
                      }
                    />
                  </div>
                );
              })}
              <h3 className="mods__placement-heading">
                {t("placement_preview")}
              </h3>
              <ul className="mods__placement-preview">
                {preview.slice(0, PREVIEW_FILES).map((file) => (
                  <li key={file.archive}>{file.target}</li>
                ))}
                {preview.length > PREVIEW_FILES && (
                  <li className="mods__hint">
                    {t("placement_more", {
                      count: preview.length - PREVIEW_FILES,
                    })}
                  </li>
                )}
              </ul>
            </div>
          </div>
          <CheckboxField
            label={t("placement_example")}
            checked={example}
            onChange={() => setExample((value) => !value)}
          />
          <div className="mods__fomod-actions">
            <Button theme="outline" onClick={openFolders}>
              {t("placement_by_hand")}
            </Button>
            <Button theme="outline" onClick={onClose}>
              {t("fomod_later")}
            </Button>
            <Button
              theme="primary"
              disabled={installing || preview.length === 0}
              onClick={() => void install()}
            >
              {installing ? t("fomod_installing") : t("fomod_install")}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
