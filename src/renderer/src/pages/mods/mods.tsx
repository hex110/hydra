import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CopyIcon,
  FileDirectoryIcon,
  FileIcon,
  FileZipIcon,
  KebabHorizontalIcon,
  SyncIcon,
  TrashIcon,
} from "@primer/octicons-react";

import {
  Badge,
  Button,
  CheckboxField,
  DropdownMenu,
  TabStrip,
} from "@renderer/components";
import { setHeaderTitle } from "@renderer/features";
import {
  useAppDispatch,
  useGameMods,
  useModDownloads,
  useToast,
} from "@renderer/hooks";
import { logger } from "@renderer/logger";
import { getMissingModRequirements } from "@shared";
import type {
  GameMods,
  GameShop,
  InstalledMod,
  ModActionResult,
  ModDownload,
  ModFolderKind,
} from "@types";

import { NexusBrowser } from "./nexus-browser";
import { FomodWizard } from "./fomod-wizard";
import { ModPlacementDialog } from "./mod-placement-dialog";
import { ModProfiles } from "./mod-profiles";
import { ModOrderSort } from "./mod-order-sort";
import { ModActivity } from "./mod-activity";
import { ModDownloadState } from "./mod-download-state";
import "./mods.scss";

type ModsTab = "installed" | "activity";

/** One line on what Hydra knows about modding this game. */
const supportText = (
  gameMods: GameMods,
  t: (key: string, options?: Record<string, unknown>) => string
) => {
  const { support } = gameMods;
  const folder = support.modFolder || t("support_game_folder");
  if (support.kind === "fallback")
    return t(
      support.source === "mod-folder-table"
        ? "support_fallback_table"
        : "support_fallback_root",
      { folder }
    );
  const options = {
    name: support.name,
    folder,
    from: t(`support_origin_${support.origin}`),
    loader: support.loader?.name ?? support.unsupportedLoader,
  };
  if (support.loader) return t("support_definition_loader", options);
  if (support.unsupportedLoader)
    return t("support_definition_unsupported_loader", options);
  return t("support_definition", options);
};

export const useModActionToast = () => {
  const { t } = useTranslation("mods");
  const { showErrorToast } = useToast();
  return useCallback(
    (result: ModActionResult | null) => {
      if (result && !result.ok) {
        showErrorToast(t(`error_${result.error.replaceAll("-", "_")}`));
        return false;
      }
      return true;
    },
    [showErrorToast, t]
  );
};

export default function Mods() {
  const { t } = useTranslation("mods");
  const [searchParams] = useSearchParams();
  const shop = searchParams.get("shop") as GameShop | null;
  const objectId = searchParams.get("objectId");
  const title = searchParams.get("title") ?? "";
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { showSuccessToast, showErrorToast } = useToast();
  const reportResult = useModActionToast();

  const {
    gameMods,
    error: loadFailed,
    refresh,
  } = useGameMods(shop, objectId, Boolean(shop && objectId));
  const [tab, setTab] = useState<ModsTab>("installed");
  const [fomodId, setFomodId] = useState<string | null>(null);
  const [placementId, setPlacementId] = useState<string | null>(null);
  const seenPending = useRef<Set<string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const allDownloads = useModDownloads();
  const downloads = allDownloads.filter(
    (download) => download.shop === shop && download.objectId === objectId
  );
  const downloadsByKey = Object.fromEntries(
    downloads
      .filter((download) => download.state !== "done")
      .map((download) => [download.key, download])
  ) as Record<string, ModDownload>;
  const finishedCount = downloads.filter(
    (download) => download.state === "done"
  ).length;

  useEffect(() => {
    if (title) dispatch(setHeaderTitle(t("page_title", { game: title })));
  }, [dispatch, title, t]);

  // A download that finished installs a mod: reload the list.
  useEffect(() => {
    if (finishedCount > 0) void refresh();
  }, [finishedCount, refresh]);

  // A FOMOD that arrives while the page is open asks for its options at once.
  useEffect(() => {
    if (!gameMods) return;
    const fomods = gameMods.pendingFomods.map((pending) => pending.id);
    const placements = gameMods.pendingPlacements.map((pending) => pending.id);
    if (seenPending.current) {
      const isFresh = (id: string) => !seenPending.current!.has(id);
      const fresh = fomods.find(isFresh);
      if (fresh) setFomodId(fresh);
      else {
        const freshPlacement = placements.find(isFresh);
        if (freshPlacement) setPlacementId(freshPlacement);
      }
    }
    seenPending.current = new Set([...fomods, ...placements]);
  }, [gameMods]);

  const closeFomod = useCallback(() => setFomodId(null), []);
  const closePlacement = useCallback(() => setPlacementId(null), []);

  if (!shop || !objectId) return null;

  const run = async (action: () => Promise<ModActionResult | null>) => {
    setBusy(true);
    try {
      reportResult(await action());
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  const checkUpdates = async () => {
    setChecking(true);
    try {
      const count = await window.electron.checkModUpdates(shop, objectId);
      showSuccessToast(t("updates_found", { count }));
    } catch (error) {
      logger.error("Failed to check mod updates", error);
    } finally {
      setChecking(false);
      await refresh();
    }
  };

  const update = (mod: InstalledMod) =>
    mod.update && mod.source.kind === "nexus"
      ? run(() =>
          window.electron.installNexusModFile(shop, objectId, {
            modId: (mod.source as { modId: number }).modId,
            fileId: mod.update!.fileId,
            name: mod.name,
            version: mod.update!.version,
            replaces: mod.id,
          })
        )
      : undefined;

  const installReShade = async () => {
    setBusy(true);
    try {
      const result = await window.electron.installGameReShade(shop, objectId);
      if (result.ok) showSuccessToast(t("reshade_installed"));
      else
        showErrorToast(
          t("reshade_install_failed", { message: result.message })
        );
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  const placeAgain = async (mod: InstalledMod) => {
    try {
      const id = await window.electron.placeModAgain(shop, objectId, mod.id);
      await refresh();
      setPlacementId(id);
    } catch (error) {
      logger.error("Failed to place the mod again", error);
      showErrorToast(t("error_failed"));
    }
  };

  const copyReport = async () => {
    try {
      await window.electron.clipboard.writeText(
        await window.electron.getModReport(shop, objectId)
      );
      showSuccessToast(t("report_copied"));
    } catch (error) {
      logger.error("Failed to copy the mods report", error);
      showErrorToast(t("report_failed"));
    }
  };

  const saveReport = () =>
    window.electron.saveModReport(shop, objectId).catch((error) => {
      logger.error("Failed to save the mods report", error);
      showErrorToast(t("report_failed"));
    });

  const openFolder = (kind: ModFolderKind) =>
    window.electron.openModFolder(shop, objectId, kind).then((opened) => {
      if (!opened) showErrorToast(t("folder_open_failed"));
    });

  const mods = gameMods?.mods ?? [];
  const neededLoader =
    gameMods?.support.kind === "definition" &&
    gameMods.support.loader &&
    !gameMods.support.loader.installed
      ? gameMods.support.loader
      : null;
  // A loader that is installed but off is turned on, not downloaded again.
  const disabledLoader = neededLoader
    ? mods.find((mod) => mod.loader?.kind === neededLoader.kind)
    : undefined;
  const blocked = Boolean(gameMods?.blocker);
  const canInstall = Boolean(gameMods?.gameFolder) && !blocked;
  const activeDownloads = downloads.filter(
    (download) => download.state !== "done"
  );

  if (loadFailed && !gameMods)
    return (
      <div className="mods mods--single">
        <div className="mods__notice">
          <p>{t("load_failed")}</p>
          <Button theme="outline" onClick={() => void refresh()}>
            <SyncIcon />
            {t("retry")}
          </Button>
        </div>
      </div>
    );

  return (
    <div className="mods">
      <section className="mods__installed">
        <header className="mods__header">
          <div>
            <h2 className="mods__title">{t("installed_title")}</h2>
            <p className="mods__hint">
              {gameMods?.gameFolder
                ? t("installed_hint", { folder: gameMods.gameFolder })
                : gameMods
                  ? t("no_game_folder")
                  : t("loading")}
            </p>
            {gameMods?.gameFolder && (
              <p
                className="mods__hint"
                title={
                  gameMods.support.kind === "definition"
                    ? gameMods.support.source
                    : undefined
                }
              >
                {supportText(gameMods, t)}
              </p>
            )}
          </div>
          <div className="mods__header-actions">
            <Button
              theme="outline"
              onClick={checkUpdates}
              disabled={checking || mods.length === 0}
            >
              <SyncIcon />
              {t("check_updates")}
            </Button>
            <Button
              theme="outline"
              disabled={busy || !canInstall}
              onClick={() =>
                run(() => window.electron.installModFromFile(shop, objectId))
              }
            >
              <FileZipIcon />
              {t("install_from_file")}
            </Button>
            <DropdownMenu
              align="end"
              items={[
                {
                  icon: <CopyIcon size={14} />,
                  label: t("copy_report"),
                  onClick: () => void copyReport(),
                },
                {
                  icon: <FileIcon size={14} />,
                  label: t("save_report"),
                  onClick: () => void saveReport(),
                },
                {
                  icon: <FileDirectoryIcon size={14} />,
                  label: t("open_game_mod_folder"),
                  disabled: !gameMods?.gameFolder,
                  onClick: () => void openFolder("game-mods"),
                },
                {
                  icon: <FileDirectoryIcon size={14} />,
                  label: t("open_staging_folder"),
                  onClick: () => void openFolder("staging"),
                },
                {
                  icon: <FileDirectoryIcon size={14} />,
                  label: t("open_store_folder"),
                  onClick: () => void openFolder("store"),
                },
                {
                  icon: <FileIcon size={14} />,
                  label: t("open_placement_examples"),
                  onClick: () =>
                    void window.electron.openModPlacementExamples(),
                },
              ]}
            >
              <Button
                theme="outline"
                aria-label={t("more_actions")}
                title={t("more_actions")}
              >
                <KebabHorizontalIcon />
              </Button>
            </DropdownMenu>
          </div>
        </header>

        {gameMods &&
          !gameMods.deployed &&
          gameMods.playMode === "plain" &&
          mods.some((mod) => mod.enabled) && (
            <p className="mods__notice">{t("mods_taken_out")}</p>
          )}

        {gameMods?.blocker === "game-running" && (
          <p className="mods__notice">{t("blocker_game_running")}</p>
        )}

        <TabStrip
          value={tab}
          onChange={setTab}
          options={[
            { value: "installed", label: t("tab_installed") },
            { value: "activity", label: t("tab_activity") },
          ]}
        />

        {tab === "activity" ? (
          <ModActivity shop={shop} objectId={objectId} />
        ) : (
          <>
            {gameMods && (
              <ModProfiles
                shop={shop}
                objectId={objectId}
                gameMods={gameMods}
                busy={busy || blocked}
                run={run}
              />
            )}

            {gameMods && gameMods.pendingPlacements.length > 0 && (
              <ul className="mods__list">
                {gameMods.pendingPlacements.map((pending) => (
                  <li key={pending.id} className="mods__row">
                    <span className="mods__file-name">{pending.name}</span>
                    <div className="mods__row-meta">
                      <span>{t("placement_waiting")}</span>
                    </div>
                    <div className="mods__row-actions">
                      <Button
                        theme="primary"
                        disabled={busy || blocked}
                        onClick={() => setPlacementId(pending.id)}
                      >
                        {t("placement_choose")}
                      </Button>
                      <Button
                        theme="outline"
                        disabled={busy || blocked}
                        onClick={() =>
                          run(() =>
                            window.electron.cancelModPlacement(
                              shop,
                              objectId,
                              pending.id
                            )
                          )
                        }
                      >
                        {t("fomod_discard")}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {gameMods && gameMods.pendingFomods.length > 0 && (
              <ul className="mods__list">
                {gameMods.pendingFomods.map((pending) => (
                  <li key={pending.id} className="mods__row">
                    <span className="mods__file-name">{pending.name}</span>
                    <div className="mods__row-meta">
                      <span>{t("fomod_waiting")}</span>
                    </div>
                    <div className="mods__row-actions">
                      <Button
                        theme="primary"
                        disabled={busy || blocked}
                        onClick={() => setFomodId(pending.id)}
                      >
                        {t("fomod_choose")}
                      </Button>
                      <Button
                        theme="outline"
                        disabled={busy || blocked}
                        onClick={() =>
                          run(() =>
                            window.electron.cancelFomod(
                              shop,
                              objectId,
                              pending.id
                            )
                          )
                        }
                      >
                        {t("fomod_discard")}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {activeDownloads.length > 0 && (
              <ul className="mods__list">
                {activeDownloads.map((download) => (
                  <li key={download.id} className="mods__row">
                    <span className="mods__file-name">{download.modName}</span>
                    <div className="mods__row-meta">
                      <ModDownloadState download={download} />
                    </div>
                    <div className="mods__row-actions">
                      <button
                        type="button"
                        className="mods__link"
                        onClick={() => navigate("/downloads")}
                      >
                        {t("see_in_downloads")}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {gameMods?.reShade.needed && !gameMods.reShade.installed && (
              <div className="mods__row mods__row--loader">
                <span className="mods__file-name">{t("reshade_needed")}</span>
                <div className="mods__row-meta">
                  <span>{t("reshade_needed_hint")}</span>
                </div>
                <div className="mods__row-actions">
                  <Button
                    theme="primary"
                    disabled={busy || !canInstall}
                    onClick={() => void installReShade()}
                  >
                    {t("install")}
                  </Button>
                </div>
              </div>
            )}

            {neededLoader && !downloadsByKey[`loader:${neededLoader.kind}`] && (
              <div className="mods__row mods__row--loader">
                <span className="mods__file-name">
                  {t("loader_needed", { loader: neededLoader.name })}
                </span>
                <div className="mods__row-meta">
                  <span>
                    {gameMods?.loaderMissing
                      ? t("loader_needed_missing_hint")
                      : t("loader_needed_hint")}
                  </span>
                </div>
                <div className="mods__row-actions">
                  <Button
                    theme="primary"
                    disabled={busy || !canInstall}
                    onClick={() =>
                      run(() =>
                        disabledLoader
                          ? window.electron.setModEnabled(
                              shop,
                              objectId,
                              disabledLoader.id,
                              true
                            )
                          : window.electron.installModLoader(shop, objectId)
                      )
                    }
                  >
                    {disabledLoader ? t("loader_turn_on") : t("install")}
                  </Button>
                </div>
              </div>
            )}

            {gameMods === null ? (
              <p className="mods__hint">{t("loading")}</p>
            ) : mods.length === 0 ? (
              <p className="mods__empty">{t("installed_empty")}</p>
            ) : (
              <ol className="mods__list">
                {mods.map((mod, index) => {
                  const overridden = gameMods.overridden[mod.id]?.length ?? 0;
                  const missing = getMissingModRequirements(mod, mods);
                  return (
                    <li key={mod.id} className="mods__row">
                      <CheckboxField
                        label={mod.name}
                        checked={mod.enabled}
                        disabled={busy || blocked}
                        onChange={() =>
                          run(() =>
                            window.electron.setModEnabled(
                              shop,
                              objectId,
                              mod.id,
                              !mod.enabled
                            )
                          )
                        }
                      />
                      <div className="mods__row-meta">
                        {mod.version && <span>{mod.version}</span>}
                        <Badge>
                          {mod.source.kind === "nexus"
                            ? t("source_nexus")
                            : mod.source.kind === "url"
                              ? t("source_web")
                              : t("source_file")}
                        </Badge>
                        {mod.loader && (
                          <span
                            title={t("loader_badge_hint", {
                              dlls: mod.loader.nativeDlls
                                .map((dll) => `${dll}.dll`)
                                .join(", "),
                            })}
                          >
                            <Badge>{t("loader_badge")}</Badge>
                          </span>
                        )}
                        {mod.fomod && (
                          <span title={t("fomod_hint")}>{t("fomod")}</span>
                        )}
                        {mod.fomodChosen && (
                          <span title={t("fomod_chosen_hint")}>
                            {t("fomod")}
                          </span>
                        )}
                        {missing.length > 0 && (
                          <span title={t("requirements_missing_hint")}>
                            {t("requirements_missing", {
                              names: missing
                                .map((item) => item.name)
                                .join(", "),
                            })}
                          </span>
                        )}
                        {overridden > 0 && (
                          <span title={gameMods.overridden[mod.id].join("\n")}>
                            {t("overridden", { count: overridden })}
                          </span>
                        )}
                      </div>
                      <div className="mods__row-actions">
                        {mod.update && (
                          <Button
                            theme="primary"
                            disabled={busy || blocked}
                            onClick={() => void update(mod)}
                            title={mod.update.name}
                          >
                            {t("update_to", {
                              version: mod.update.version ?? mod.update.name,
                            })}
                          </Button>
                        )}
                        <button
                          type="button"
                          className="mods__icon-button"
                          disabled={busy || blocked || index === 0}
                          onClick={() =>
                            run(() =>
                              window.electron.moveMod(
                                shop,
                                objectId,
                                mod.id,
                                -1
                              )
                            )
                          }
                          title={t("move_up")}
                          aria-label={t("move_up")}
                        >
                          <ArrowUpIcon />
                        </button>
                        <button
                          type="button"
                          className="mods__icon-button"
                          disabled={
                            busy || blocked || index === mods.length - 1
                          }
                          onClick={() =>
                            run(() =>
                              window.electron.moveMod(shop, objectId, mod.id, 1)
                            )
                          }
                          title={t("move_down")}
                          aria-label={t("move_down")}
                        >
                          <ArrowDownIcon />
                        </button>
                        <button
                          type="button"
                          className="mods__icon-button"
                          disabled={busy || blocked}
                          onClick={() => void placeAgain(mod)}
                          title={t("placement_again")}
                          aria-label={t("placement_again")}
                        >
                          <FileDirectoryIcon />
                        </button>
                        <button
                          type="button"
                          className="mods__icon-button"
                          disabled={busy || blocked}
                          onClick={() =>
                            run(() =>
                              window.electron.removeMod(shop, objectId, mod.id)
                            )
                          }
                          title={t("remove")}
                          aria-label={t("remove")}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            {mods.length > 1 && (
              <div className="mods__order">
                <p className="mods__hint">{t("order_hint")}</p>
                <ModOrderSort
                  shop={shop}
                  objectId={objectId}
                  disabled={busy || blocked}
                  run={run}
                />
              </div>
            )}
          </>
        )}
      </section>

      <ModPlacementDialog
        shop={shop}
        objectId={objectId}
        pendingId={placementId}
        onClose={closePlacement}
        onDone={() => {
          setPlacementId(null);
          void refresh();
        }}
      />

      <FomodWizard
        shop={shop}
        objectId={objectId}
        pendingId={fomodId}
        onClose={closeFomod}
        onDone={() => {
          setFomodId(null);
          void refresh();
        }}
      />

      <NexusBrowser
        shop={shop}
        objectId={objectId}
        installedMods={mods}
        downloads={downloadsByKey}
        disabled={!canInstall}
        onInstalled={refresh}
      />
    </div>
  );
}
