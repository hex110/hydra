import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LauncherImportCandidate } from "@types";

import {
  Button,
  CheckboxField,
  Modal,
  SelectField,
} from "@renderer/components";
import { useToast } from "@renderer/hooks";
import { logger } from "@renderer/logger";

import "./launcher-import-modal.scss";

interface LauncherImportModalProps {
  visible: boolean;
  onClose: () => void;
}

const candidateKey = (candidate: LauncherImportCandidate) =>
  `${candidate.install.launcher}:${candidate.install.store}:${candidate.install.appId}`;

/** Why a found install can't be imported, or null when it can. */
const blockedReason = (candidate: LauncherImportCandidate) => {
  if (candidate.inLibrary) return "launcher_import_in_library";
  if (!candidate.install.executablePath) return "launcher_import_no_executable";
  if (candidate.lookupFailed) return "launcher_import_lookup_failed";
  if (!candidate.match && candidate.choices.length === 0)
    return "launcher_import_unknown";
  return null;
};

export function LauncherImportModal({
  visible,
  onClose,
}: Readonly<LauncherImportModalProps>) {
  const { t } = useTranslation("settings");
  const { showSuccessToast, showErrorToast } = useToast();
  const [candidates, setCandidates] = useState<
    LauncherImportCandidate[] | null
  >(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [chosenIds, setChosenIds] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);

  const load = useCallback(() => {
    setCandidates(null);
    window.electron
      .listLauncherImportCandidates()
      .then((found) => {
        setCandidates(found);
        setSelected(
          new Set(
            found
              .filter(
                (candidate) => candidate.match && !blockedReason(candidate)
              )
              .map(candidateKey)
          )
        );
        setChosenIds(
          Object.fromEntries(
            found.flatMap((candidate) => {
              const id =
                candidate.match?.objectId ?? candidate.choices[0]?.objectId;
              return id ? [[candidateKey(candidate), id]] : [];
            })
          )
        );
      })
      .catch((error) => {
        logger.error("Failed to look for Heroic and Lutris games", error);
        setCandidates([]);
      });
  }, []);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const picks = useMemo(
    () =>
      (candidates ?? []).flatMap((candidate) => {
        const key = candidateKey(candidate);
        const objectId = chosenIds[key];
        return selected.has(key) && objectId && !blockedReason(candidate)
          ? [{ objectId, install: candidate.install }]
          : [];
      }),
    [candidates, chosenIds, selected]
  );

  const toggle = (key: string) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const handleImport = async () => {
    setImporting(true);
    try {
      const result = await window.electron.importLauncherGames(picks);
      if (result.added > 0) {
        showSuccessToast(t("launcher_import_done", { count: result.added }));
      }
      if (result.failed.length > 0) {
        showErrorToast(
          t("launcher_import_failed", { titles: result.failed.join(", ") })
        );
      }
      onClose();
    } catch (error) {
      logger.error("Failed to import Heroic and Lutris games", error);
      showErrorToast(t("launcher_import_failed_generic"));
    } finally {
      setImporting(false);
    }
  };

  const renderBody = () => {
    if (candidates === null) {
      return (
        <p className="launcher-import__hint">
          {t("launcher_import_searching")}
        </p>
      );
    }
    if (candidates.length === 0) {
      return (
        <p className="launcher-import__hint">{t("launcher_import_none")}</p>
      );
    }
    return (
      <ul className="launcher-import__list">
        {candidates.map((candidate) => {
          const key = candidateKey(candidate);
          const reason = blockedReason(candidate);
          const { install } = candidate;
          return (
            <li key={key} className="launcher-import__item">
              <CheckboxField
                label={install.title}
                checked={!reason && selected.has(key)}
                disabled={Boolean(reason) || importing}
                onChange={() => toggle(key)}
              />
              <p className="launcher-import__meta">
                {t(`launcher_import_source_${install.store}`)}
                {install.winePrefixPath && ` · ${t("launcher_import_prefix")}`}
                {install.playTimeInMinutes > 0 &&
                  ` · ${t("launcher_import_playtime", {
                    hours: Math.round(install.playTimeInMinutes / 6) / 10,
                  })}`}
              </p>
              {reason ? (
                <p className="launcher-import__meta">{t(reason)}</p>
              ) : candidate.match ? (
                <p className="launcher-import__meta">
                  {t("launcher_import_matched", {
                    title: candidate.match.title,
                  })}
                </p>
              ) : (
                <SelectField
                  label={t("launcher_import_which_game")}
                  theme="dark"
                  value={chosenIds[key] ?? ""}
                  disabled={importing}
                  options={candidate.choices.map((choice) => ({
                    key: choice.objectId,
                    value: choice.objectId,
                    label: choice.title,
                  }))}
                  onChange={(event) =>
                    setChosenIds((previous) => ({
                      ...previous,
                      [key]: event.target.value,
                    }))
                  }
                />
              )}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <Modal
      visible={visible}
      title={t("launcher_import_title")}
      description={t("launcher_import_description")}
      onClose={onClose}
      large
    >
      <div className="launcher-import">
        {renderBody()}
        <div className="launcher-import__actions">
          <Button type="button" theme="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            type="button"
            disabled={picks.length === 0 || importing}
            onClick={handleImport}
          >
            {importing
              ? t("launcher_import_importing")
              : t("launcher_import_import", { count: picks.length })}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
