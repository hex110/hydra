import { useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileDirectoryIcon, SyncIcon } from "@primer/octicons-react";

import { Button, CheckboxField, SelectField } from "@renderer/components";
import { gameDetailsContext } from "@renderer/context";
import { useDate, useToast } from "@renderer/hooks";
import { logger } from "@renderer/logger";
import type {
  LibraryGame,
  SaveImportError,
  SaveImportFileAction,
  SaveImportPreview,
  SaveImportResult,
} from "@types";

const countFiles = (preview: SaveImportPreview, action: SaveImportFileAction) =>
  preview.files.filter((file) => file.action === action).length;

export function SaveImportSection({ game }: Readonly<{ game: LibraryGame }>) {
  const { t } = useTranslation("game_details");
  const { updateGame } = useContext(gameDetailsContext);
  const { showSuccessToast, showErrorToast } = useToast();
  const { formatDateTime } = useDate();

  const [previews, setPreviews] = useState<SaveImportPreview[] | null>(null);
  const [error, setError] = useState<SaveImportError | null>(null);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [includeAchievements, setIncludeAchievements] = useState(true);
  const [overwriteNewer, setOverwriteNewer] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<SaveImportResult | null>(null);

  const search = useCallback(() => {
    setPreviews(null);
    setError(null);
    window.electron
      .previewGameSaveImport(game.shop, game.objectId)
      .then((response) => {
        if (!response.ok) {
          setError(response.error);
          setPreviews([]);
          return;
        }
        setPreviews(response.previews);
        setSourceId((current) =>
          response.previews.some((preview) => preview.sourceId === current)
            ? current
            : (response.previews[0]?.sourceId ?? null)
        );
      })
      .catch((searchError) => {
        logger.error("Failed to look for saves to import", searchError);
        setError("failed");
        setPreviews([]);
      });
  }, [game.shop, game.objectId]);

  useEffect(() => {
    search();
  }, [search, game.executablePath, game.winePrefixPath]);

  const preview = previews?.find((item) => item.sourceId === sourceId) ?? null;
  const created = preview ? countFiles(preview, "create") : 0;
  const replaced = preview ? countFiles(preview, "replace") : 0;
  const identical = preview ? countFiles(preview, "identical") : 0;
  const keptNewer = preview ? countFiles(preview, "keep-newer") : 0;
  const filesToImport = created + replaced + (overwriteNewer ? keptNewer : 0);
  const canImport =
    !!preview &&
    (filesToImport > 0 || (includeAchievements && preview.achievements > 0));

  const runImport = async () => {
    if (!preview) return;
    setImporting(true);
    const response = await window.electron.applyGameSaveImport(
      game.shop,
      game.objectId,
      preview.sourceId,
      { includeAchievements, overwriteNewer }
    );
    setImporting(false);

    if (response.ok) {
      setResult(response.result);
      showSuccessToast(
        t("save_import_done_toast", {
          files: response.result.importedFiles,
          achievements: response.result.achievements,
        })
      );
    } else {
      showErrorToast(t("save_import_failed", { message: response.message }));
    }

    search();
    await updateGame();
  };

  const dismiss = async () => {
    await window.electron.dismissGameSaveImport(game.shop, game.objectId);
    await updateGame();
  };

  const { pending, lastImport } = game.saveImport ?? {
    pending: null,
    lastImport: null,
  };

  const renderBody = () => {
    if (previews === null) {
      return (
        <p className="game-options-modal__optiscaler-hint">
          {t("save_import_searching")}
        </p>
      );
    }

    if (error) {
      return (
        <p className="game-options-modal__optiscaler-hint">
          {t(`save_import_error_${error.replaceAll("-", "_")}`)}
        </p>
      );
    }

    if (!preview) {
      return (
        <p className="game-options-modal__optiscaler-hint">
          {t("save_import_nothing_found")}
        </p>
      );
    }

    return (
      <>
        {previews.length > 1 && (
          <SelectField
            label={t("save_import_source")}
            value={preview.sourceId}
            theme="dark"
            options={previews.map((item) => ({
              key: item.sourceId,
              value: item.sourceId,
              label: item.sourceLabel,
            }))}
            onChange={(event) => setSourceId(event.target.value)}
          />
        )}

        <div className="game-options-modal__optiscaler-facts">
          <p>
            {t("save_import_found", {
              source: preview.sourceLabel,
              files: preview.files.length,
              achievements: preview.achievements,
            })}
            {preview.newestFileAt &&
              ` ${t("save_import_newest", {
                date: formatDateTime(preview.newestFileAt),
              })}`}
          </p>
          {preview.files.length > 0 && (
            <p>
              {t("save_import_file_summary", {
                created,
                replaced,
                identical,
                keptNewer,
              })}
            </p>
          )}
          {preview.unmappedFiles > 0 && (
            <p className="game-options-modal__optiscaler-warning">
              {t("save_import_unmapped", { count: preview.unmappedFiles })}
            </p>
          )}
        </div>

        {preview.files.length > 0 && (
          <details className="game-options-modal__save-import-files">
            <summary>{t("save_import_show_files")}</summary>
            <ul>
              {preview.files.map((file) => (
                <li key={`${file.rawPath}/${file.relativePath}`}>
                  <span>{file.targetPath}</span>
                  <span className="game-options-modal__optiscaler-hint">
                    {t(`save_import_action_${file.action.replace("-", "_")}`)}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}

        {preview.achievements > 0 && (
          <CheckboxField
            label={t("save_import_include_achievements", {
              count: preview.achievements,
            })}
            checked={includeAchievements}
            onChange={() => setIncludeAchievements((value) => !value)}
          />
        )}
        {keptNewer > 0 && (
          <CheckboxField
            label={t("save_import_overwrite_newer", { count: keptNewer })}
            checked={overwriteNewer}
            onChange={() => setOverwriteNewer((value) => !value)}
          />
        )}

        <div className="game-options-modal__row">
          <Button
            type="button"
            theme="outline"
            disabled={!canImport || importing}
            onClick={runImport}
          >
            {importing ? t("save_import_importing") : t("save_import_import")}
          </Button>
          {pending && (
            <Button
              type="button"
              theme="outline"
              disabled={importing}
              onClick={dismiss}
            >
              {t("save_import_dismiss")}
            </Button>
          )}
        </div>
      </>
    );
  };

  return (
    <div className="game-options-modal__section">
      <div className="game-options-modal__header">
        <h2>{t("save_import_title")}</h2>
        <h4 className="game-options-modal__header-description">
          {t("save_import_description")}
        </h4>
      </div>

      {lastImport && (
        <p className="game-options-modal__optiscaler-hint">
          {t("save_import_last_import", {
            date: formatDateTime(lastImport.at),
            files: lastImport.files,
            achievements: lastImport.achievements,
          })}
        </p>
      )}

      {renderBody()}

      {result?.backupPath && (
        <div className="game-options-modal__row">
          <p className="game-options-modal__optiscaler-hint">
            {t("save_import_backup_hint", {
              count: result.importedFiles,
            })}
          </p>
          <Button
            type="button"
            theme="outline"
            onClick={() => window.electron.openFolder(result.backupPath!)}
          >
            <FileDirectoryIcon />
            {t("save_import_open_backup")}
          </Button>
        </div>
      )}

      <div className="game-options-modal__row">
        <Button
          type="button"
          theme="outline"
          disabled={previews === null || importing}
          onClick={search}
        >
          <SyncIcon />
          {t("save_import_search_again")}
        </Button>
      </div>
    </div>
  );
}
