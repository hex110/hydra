import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  DeviceDesktopIcon,
  FileDirectoryIcon,
  SyncIcon,
  XIcon,
} from "@primer/octicons-react";
import cn from "classnames";

import { useNavigate } from "react-router-dom";

import { Button, CheckboxField, Modal } from "@renderer/components";
import { useAppSelector } from "@renderer/hooks";
import type { ScannedFolderMatch } from "@types";

import { ScanGamePicker } from "./scan-game-picker";
import "./scan-games-modal.scss";

type ScanMode = "automatic" | "manual";

interface FoundGame {
  title: string;
  executablePath: string;
  iconUrl: string | null;
}

export interface ScanResult {
  linkedGames: FoundGame[];
  addedGames: FoundGame[];
  ambiguousMatches: ScannedFolderMatch[];
  unidentifiedFolders: ScannedFolderMatch[];
  total: number;
}

interface Pick {
  objectId: string;
  folderPath?: string;
}

export interface ScanGamesModalProps {
  visible: boolean;
  onClose: () => void;
  isScanning: boolean;
  scanResult: ScanResult | null;
  onStartScan: (
    additionalDirectories: string[],
    includeDefaultDirectories: boolean,
    addGamesToLibrary: boolean
  ) => void;
  onCancelScan: () => void;
  onClearResult: () => void;
}

const resolveResultSummary = (
  addedCount: number,
  linkedCount: number,
  addedText: string,
  linkedText: string,
  combinedText: string
) => {
  if (addedCount === 0) return linkedText;
  if (linkedCount === 0) return addedText;

  return combinedText;
};

export function ScanGamesModal({
  visible,
  onClose,
  isScanning,
  scanResult,
  onStartScan,
  onCancelScan,
  onClearResult,
}: Readonly<ScanGamesModalProps>) {
  const { t } = useTranslation("header");

  const navigate = useNavigate();
  const isWindows = window.electron.platform === "win32";
  const libraryFolders = useAppSelector(
    (state) => state.userPreferences.value?.libraryScanDirectories ?? []
  );
  const defaultScanMode: ScanMode =
    isWindows || libraryFolders.length > 0 ? "automatic" : "manual";

  const [selectedFolders, setSelectedFolders] = useState<string[]>([]);
  const [scanMode, setScanMode] = useState<ScanMode>(defaultScanMode);
  const [addGamesToLibrary, setAddGamesToLibrary] = useState(true);
  const [pending, setPending] = useState<ScannedFolderMatch[]>([]);
  const [unidentified, setUnidentified] = useState<ScannedFolderMatch[]>([]);
  const [isIdentifying, setIsIdentifying] = useState(false);
  const [isUnidentifiedOpen, setIsUnidentifiedOpen] = useState(false);
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [isResolving, setIsResolving] = useState(false);
  const [resolvedGames, setResolvedGames] = useState<FoundGame[]>([]);

  useEffect(() => {
    if (visible) setScanMode(defaultScanMode);
  }, [visible, defaultScanMode]);

  const isManualMode = scanMode === "manual";
  const requiresFolderSelection = isManualMode && selectedFolders.length === 0;

  const addedGames = [...(scanResult?.addedGames ?? []), ...resolvedGames];

  const linkedGames = scanResult?.linkedGames ?? [];

  const hasResults = Boolean(
    scanResult && addedGames.length + linkedGames.length > 0
  );

  const addedText = t("scan_games_result_added", { count: addedGames.length });
  const linkedText = t("scan_games_result_linked", {
    count: linkedGames.length,
  });

  const resultSummary = resolveResultSummary(
    addedGames.length,
    linkedGames.length,
    addedText,
    linkedText,
    t("scan_games_result_summary", { added: addedText, linked: linkedText })
  );

  useEffect(() => {
    setPicks({});
    setIsIdentifying(false);

    if (!scanResult) {
      setPending([]);
      setUnidentified([]);
      setResolvedGames([]);
      return;
    }

    setPending(scanResult.ambiguousMatches);
    setUnidentified(scanResult.unidentifiedFolders ?? []);
    setIsUnidentifiedOpen(scanResult.ambiguousMatches.length === 0);
  }, [scanResult]);

  const isPicking = pending.length > 0 || isIdentifying;

  const handlePick = useCallback(
    (match: ScannedFolderMatch, objectId: string) => {
      setPicks((prev) => ({
        ...prev,
        [match.executablePath]: { objectId, folderPath: match.folderPath },
      }));
    },
    []
  );

  const handleStopPicking = () => {
    setPending([]);
    setIsIdentifying(false);
  };

  const handleIdentifyFolders = () => {
    setIsUnidentifiedOpen(true);
    setIsIdentifying(true);
  };

  const handleConfirmPicks = async () => {
    setIsResolving(true);

    try {
      const added: FoundGame[] = await window.electron
        .addScannedGames(
          Object.entries(picks).map(([executablePath, pick]) => ({
            ...pick,
            executablePath,
          }))
        )
        .catch(() => []);

      setResolvedGames((prev) => [...prev, ...added]);
      setUnidentified((prev) =>
        prev.filter((match) => !picks[match.executablePath])
      );
    } finally {
      setPicks({});
      setIsResolving(false);
      handleStopPicking();
    }
  };

  const handleClose = () => {
    setSelectedFolders([]);
    setScanMode(defaultScanMode);
    onClose();
  };

  const handleStartScan = () => {
    if (isManualMode) {
      onStartScan(selectedFolders, false, addGamesToLibrary);
    } else {
      onStartScan([], true, addGamesToLibrary);
    }
  };

  const handleScanAgain = () => {
    onClearResult();
  };

  const handleAddFolder = async () => {
    const { canceled, filePaths } = await window.electron.showOpenDialog({
      properties: ["openDirectory", "multiSelections"],
    });

    if (canceled) return;

    setSelectedFolders((prev) => [
      ...prev,
      ...filePaths.filter((filePath) => !prev.includes(filePath)),
    ]);
  };

  const handleRemoveFolder = (folder: string) => {
    setSelectedFolders((prev) => prev.filter((item) => item !== folder));
  };

  const renderGamesList = (games: FoundGame[]) => (
    <ul className="scan-games-modal__games-list">
      {games.map((game) => (
        <li key={game.executablePath} className="scan-games-modal__game-item">
          {game.iconUrl ? (
            <img
              src={game.iconUrl}
              alt=""
              className="scan-games-modal__game-icon"
            />
          ) : (
            <span className="scan-games-modal__game-icon scan-games-modal__game-icon--empty">
              <DeviceDesktopIcon size={16} />
            </span>
          )}
          <span className="scan-games-modal__game-info">
            <span className="scan-games-modal__game-title">{game.title}</span>
            <span className="scan-games-modal__game-path">
              {game.executablePath}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <Modal
      visible={visible}
      title={t("scan_games_title")}
      onClose={handleClose}
      clickOutsideToClose={!isScanning}
    >
      <div className="scan-games-modal">
        {!scanResult && !isScanning && (
          <>
            <div className="scan-games-modal__mode-toggle">
              <button
                type="button"
                className={cn("scan-games-modal__mode-option", {
                  "scan-games-modal__mode-option--active":
                    scanMode === "automatic",
                })}
                onClick={() => setScanMode("automatic")}
              >
                {t("scan_games_mode_automatic")}
              </button>
              <button
                type="button"
                className={cn("scan-games-modal__mode-option", {
                  "scan-games-modal__mode-option--active":
                    scanMode === "manual",
                })}
                onClick={() => setScanMode("manual")}
              >
                {t("scan_games_mode_manual")}
              </button>
            </div>

            {!isManualMode && (
              <div className="scan-games-modal__folders">
                <div className="scan-games-modal__folders-header">
                  <span className="scan-games-modal__folders-title">
                    {t("scan_games_folders_title")}
                  </span>
                  <Button
                    theme="outline"
                    onClick={() => {
                      handleClose();
                      navigate("/settings?tab=library_folders");
                    }}
                  >
                    <FileDirectoryIcon size={14} />
                    {t("scan_games_manage_folders")}
                  </Button>
                </div>

                {libraryFolders.length > 0 && (
                  <ul className="scan-games-modal__folders-list">
                    {libraryFolders.map((folder) => (
                      <li
                        key={folder}
                        className="scan-games-modal__folder-item"
                      >
                        <span className="scan-games-modal__folder-path">
                          {folder}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                <p className="scan-games-modal__folders-hint">
                  {t("scan_games_folders_hint_automatic")}
                </p>
              </div>
            )}

            {isManualMode && (
              <div className="scan-games-modal__folders">
                <div className="scan-games-modal__folders-header">
                  <span className="scan-games-modal__folders-title">
                    {t("scan_games_folders_title")}
                  </span>
                  <Button theme="outline" onClick={handleAddFolder}>
                    <FileDirectoryIcon size={14} />
                    {t("scan_games_add_folder")}
                  </Button>
                </div>

                {selectedFolders.length > 0 ? (
                  <ul className="scan-games-modal__folders-list">
                    {selectedFolders.map((folder) => (
                      <li
                        key={folder}
                        className="scan-games-modal__folder-item"
                      >
                        <span className="scan-games-modal__folder-path">
                          {folder}
                        </span>
                        <button
                          type="button"
                          className="scan-games-modal__folder-remove"
                          onClick={() => handleRemoveFolder(folder)}
                          aria-label={t("scan_games_remove_folder")}
                        >
                          <XIcon size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="scan-games-modal__folders-hint">
                    {t("scan_games_folders_hint_manual")}
                  </p>
                )}
              </div>
            )}

            <div className="scan-games-modal__option">
              <CheckboxField
                label={t("scan_games_add_to_library")}
                checked={addGamesToLibrary}
                onChange={() => setAddGamesToLibrary((prev) => !prev)}
              />
            </div>
          </>
        )}

        {isScanning && !scanResult && (
          <div className="scan-games-modal__scanning">
            <SyncIcon size={24} className="scan-games-modal__spinner" />
            <p className="scan-games-modal__scanning-text">
              {t("scan_games_in_progress")}
            </p>
            <p className="scan-games-modal__scanning-hint">
              {t("scan_games_in_progress_hint")}
            </p>
          </div>
        )}

        {scanResult && isPicking && (
          <div className="scan-games-modal__ambiguous">
            {pending.length > 0 && (
              <>
                <p className="scan-games-modal__ambiguous-title">
                  {t("scan_games_ambiguous_title", { count: pending.length })}
                </p>
                <p className="scan-games-modal__ambiguous-hint">
                  {t("scan_games_ambiguous_hint")}
                </p>

                <ul className="scan-games-modal__ambiguous-list">
                  {pending.map((match) => (
                    <ScanGamePicker
                      key={match.executablePath}
                      match={match}
                      pickedObjectId={picks[match.executablePath]?.objectId}
                      onPick={handlePick}
                    />
                  ))}
                </ul>
              </>
            )}

            {unidentified.length > 0 && (
              <>
                <button
                  type="button"
                  className="scan-games-modal__unidentified-toggle"
                  onClick={() => setIsUnidentifiedOpen((prev) => !prev)}
                  aria-expanded={isUnidentifiedOpen}
                >
                  {isUnidentifiedOpen ? (
                    <ChevronDownIcon size={14} />
                  ) : (
                    <ChevronRightIcon size={14} />
                  )}
                  {t("scan_games_unidentified_title", {
                    count: unidentified.length,
                  })}
                </button>

                {isUnidentifiedOpen && (
                  <>
                    <p className="scan-games-modal__ambiguous-hint">
                      {t("scan_games_unidentified_hint")}
                    </p>
                    <ul className="scan-games-modal__ambiguous-list">
                      {unidentified.map((match) => (
                        <ScanGamePicker
                          key={match.executablePath}
                          match={match}
                          pickedObjectId={picks[match.executablePath]?.objectId}
                          onPick={handlePick}
                        />
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {scanResult && !isPicking && (
          <div className="scan-games-modal__results">
            {hasResults ? (
              <div className="scan-games-modal__result-section">
                <p className="scan-games-modal__result">{resultSummary}</p>
                {renderGamesList([...addedGames, ...linkedGames])}
              </div>
            ) : (
              <p className="scan-games-modal__no-results">
                {t("scan_games_no_results")}
              </p>
            )}

            {unidentified.length > 0 && (
              <div className="scan-games-modal__unidentified-notice">
                <span>
                  {t("scan_games_unidentified_title", {
                    count: unidentified.length,
                  })}
                </span>
                <Button theme="outline" onClick={handleIdentifyFolders}>
                  {t("scan_games_identify_folders")}
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="scan-games-modal__actions">
          {scanResult && isPicking ? (
            <>
              <Button theme="outline" onClick={handleStopPicking}>
                {pending.length > 0
                  ? t("scan_games_ambiguous_skip")
                  : t("scan_games_back")}
              </Button>
              <Button
                onClick={handleConfirmPicks}
                disabled={isResolving || Object.keys(picks).length === 0}
              >
                {t("scan_games_ambiguous_confirm")}
              </Button>
            </>
          ) : (
            <>
              <Button theme="outline" onClick={handleClose}>
                {scanResult
                  ? t("scan_games_close")
                  : isScanning
                    ? t("scan_games_hide")
                    : t("scan_games_cancel")}
              </Button>
              {!scanResult && isScanning && (
                <Button theme="danger" onClick={onCancelScan}>
                  {t("scan_games_cancel_scan")}
                </Button>
              )}
              {!scanResult && !isScanning && (
                <Button
                  onClick={handleStartScan}
                  disabled={requiresFolderSelection}
                >
                  {t("scan_games_start")}
                </Button>
              )}
              {scanResult && (
                <Button onClick={handleScanAgain}>
                  {t("scan_games_scan_again")}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
