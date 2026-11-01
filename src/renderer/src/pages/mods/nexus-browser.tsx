import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DownloadIcon,
  HeartIcon,
  LinkExternalIcon,
} from "@primer/octicons-react";

import { Button, SelectField, TextField } from "@renderer/components";
import { logger } from "@renderer/logger";
import { formatBytes, nexusFilePageUrl, nexusModPageUrl } from "@shared";
import type {
  GameShop,
  InstalledMod,
  ModInstallProgress,
  NexusGameMatch,
  NexusMod,
  NexusModFile,
  NexusModSort,
} from "@types";

import { useModActionToast } from "./mods";

const SEARCH_DELAY_MS = 400;
const LISTED_CATEGORIES = new Set([
  "MAIN",
  "OPTIONAL",
  "UPDATE",
  "MISCELLANEOUS",
]);

interface NexusBrowserProps {
  shop: GameShop;
  objectId: string;
  installedMods: InstalledMod[];
  progress: Record<string, ModInstallProgress>;
  disabled: boolean;
  onInstalled: () => void;
}

export function NexusBrowser({
  shop,
  objectId,
  installedMods,
  progress,
  disabled,
  onInstalled,
}: Readonly<NexusBrowserProps>) {
  const { t, i18n } = useTranslation("mods");
  const reportResult = useModActionToast();
  const numberFormat = useMemo(
    () => new Intl.NumberFormat(i18n.language, { notation: "compact" }),
    [i18n.language]
  );

  const [nexusGame, setNexusGame] = useState<NexusGameMatch | null>(null);
  const [gameLoaded, setGameLoaded] = useState(false);
  const [hasTorBox, setHasTorBox] = useState(true);
  const [isNxmHandler, setIsNxmHandler] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<NexusModSort>("downloads");
  const [mods, setMods] = useState<NexusMod[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  // Nexus's offset counts adult mods, which are left out of the list.
  const [nextOffset, setNextOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [openModId, setOpenModId] = useState<number | null>(null);
  const [files, setFiles] = useState<NexusModFile[] | null>(null);
  const [gameSearch, setGameSearch] = useState("");
  const [gameResults, setGameResults] = useState<NexusGameMatch[]>([]);

  useEffect(() => {
    window.electron
      .getNexusGameForLibraryGame(shop, objectId)
      .then(setNexusGame)
      .catch((error) => logger.error("Nexus game lookup failed", error))
      .finally(() => setGameLoaded(true));
    window.electron
      .hasTorBoxToken()
      .then(setHasTorBox)
      .catch(() => setHasTorBox(false));
    window.electron
      .isNxmHandler()
      .then(setIsNxmHandler)
      .catch(() => setIsNxmHandler(true));
  }, [shop, objectId]);

  const load = useCallback(
    async (offset: number) => {
      if (!nexusGame) return;
      setLoading(true);
      setFailed(false);
      try {
        const result = await window.electron.searchNexusMods(
          nexusGame.domainName,
          search,
          sort,
          offset
        );
        const visible = result.mods.filter((mod) => !mod.adult);
        setMods((current) =>
          offset === 0 ? visible : [...current, ...visible]
        );
        setTotalCount(result.totalCount);
        setNextOffset(offset + result.mods.length);
      } catch (error) {
        logger.error("Nexus mod search failed", error);
        setFailed(true);
      } finally {
        setLoading(false);
      }
    },
    [nexusGame, search, sort]
  );

  useEffect(() => {
    const timeout = setTimeout(() => void load(0), SEARCH_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [load]);

  useEffect(() => {
    if (!gameSearch.trim()) {
      setGameResults([]);
      return;
    }
    const timeout = setTimeout(() => {
      window.electron
        .searchNexusGames(gameSearch.trim())
        .then(setGameResults)
        .catch(() => setGameResults([]));
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [gameSearch]);

  const toggleMod = async (mod: NexusMod) => {
    if (openModId === mod.modId) {
      setOpenModId(null);
      return;
    }
    setOpenModId(mod.modId);
    setFiles(null);
    try {
      const result = await window.electron.getNexusModFiles(
        nexusGame!.id,
        mod.modId
      );
      setFiles(
        result
          .filter((file) => LISTED_CATEGORIES.has(file.category))
          .toSorted((a, b) => b.uploadedAt - a.uploadedAt)
      );
    } catch (error) {
      logger.error("Nexus file list failed", error);
      setFiles([]);
    }
  };

  const pickGame = async (game: NexusGameMatch) => {
    await window.electron.setNexusGameForLibraryGame(shop, objectId, game);
    setNexusGame(game);
    setGameSearch("");
  };

  const install = async (mod: NexusMod, file: NexusModFile) => {
    const result = await window.electron.installNexusModFile(shop, objectId, {
      modId: mod.modId,
      fileId: file.fileId,
      name: mod.name,
      version: file.version ?? mod.version,
    });
    if (reportResult(result)) onInstalled();
  };

  const installedFileIds = new Set(
    installedMods.flatMap((mod) =>
      mod.source.kind === "nexus" ? [mod.source.fileId] : []
    )
  );

  const gamePicker = (
    <div className="mods__game-picker">
      <TextField
        value={gameSearch}
        onChange={(event) => setGameSearch(event.target.value)}
        placeholder={t("nexus_game_search_placeholder")}
      />
      {gameResults.length > 0 && (
        <ul className="mods__game-results">
          {gameResults.map((game) => (
            <li key={game.id}>
              <button
                type="button"
                className="mods__game-result"
                onClick={() => void pickGame(game)}
              >
                {game.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <section className="mods__browser">
      <header className="mods__header">
        <div>
          <h2 className="mods__title">{t("nexus_title")}</h2>
          <p className="mods__hint">
            {nexusGame
              ? t("nexus_hint", { game: nexusGame.name })
              : gameLoaded
                ? t("nexus_no_game")
                : t("loading")}
          </p>
        </div>
      </header>

      {!hasTorBox && <p className="mods__notice">{t("no_torbox")}</p>}

      {hasTorBox && !isNxmHandler && (
        <div className="mods__nxm">
          <p className="mods__hint">{t("nxm_hint")}</p>
          <Button
            theme="outline"
            onClick={async () =>
              setIsNxmHandler(await window.electron.registerNxmHandler())
            }
          >
            {t("nxm_register")}
          </Button>
        </div>
      )}

      {gameLoaded && !nexusGame && gamePicker}

      {nexusGame && (
        <>
          <div className="mods__browser-filters">
            <TextField
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("nexus_search_placeholder")}
            />
            <SelectField
              value={sort}
              onChange={(event) => setSort(event.target.value as NexusModSort)}
              options={(["downloads", "endorsements", "updated"] as const).map(
                (value) => ({
                  key: value,
                  value,
                  label: t(`sort_${value}`),
                })
              )}
            />
          </div>

          {failed && <p className="mods__notice">{t("nexus_failed")}</p>}

          <ul className="mods__results">
            {mods.map((mod) => (
              <li key={mod.modId} className="mods__result">
                <button
                  type="button"
                  className="mods__result-summary"
                  onClick={() => void toggleMod(mod)}
                  aria-expanded={openModId === mod.modId}
                >
                  {mod.pictureUrl ? (
                    <img
                      className="mods__result-image"
                      src={mod.pictureUrl}
                      alt=""
                      loading="lazy"
                    />
                  ) : (
                    <span className="mods__result-image" />
                  )}
                  <span className="mods__result-text">
                    <span className="mods__result-name">{mod.name}</span>
                    <span className="mods__result-meta">
                      {mod.author && t("by_author", { author: mod.author })}
                      <span>
                        <DownloadIcon size={12} />{" "}
                        {numberFormat.format(mod.downloads)}
                      </span>
                      <span>
                        <HeartIcon size={12} />{" "}
                        {numberFormat.format(mod.endorsements)}
                      </span>
                    </span>
                    {mod.summary && (
                      <span className="mods__result-summary-text">
                        {mod.summary}
                      </span>
                    )}
                  </span>
                </button>

                {openModId === mod.modId && (
                  <div className="mods__files">
                    {files === null ? (
                      <p className="mods__hint">{t("loading")}</p>
                    ) : files.length === 0 ? (
                      <p className="mods__hint">{t("no_files")}</p>
                    ) : (
                      files.map((file) => {
                        const key = `nexus:${mod.modId}:${file.fileId}`;
                        const state = progress[key];
                        const installed = installedFileIds.has(file.fileId);
                        return (
                          <div key={file.fileId} className="mods__file">
                            <div className="mods__file-text">
                              <span className="mods__file-name">
                                {file.name}
                              </span>
                              <span className="mods__result-meta">
                                <span>{t(`category_${file.category}`)}</span>
                                {file.version && <span>{file.version}</span>}
                                {file.sizeInBytes != null && (
                                  <span>{formatBytes(file.sizeInBytes)}</span>
                                )}
                              </span>
                            </div>
                            {hasTorBox ? (
                              <Button
                                theme={installed ? "outline" : "primary"}
                                disabled={disabled || Boolean(state)}
                                onClick={() => void install(mod, file)}
                              >
                                {state
                                  ? t(`stage_${state.stage}`, {
                                      percent: Math.round(
                                        (state.progress ?? 0) * 100
                                      ),
                                    })
                                  : installed
                                    ? t("reinstall")
                                    : t("install")}
                              </Button>
                            ) : (
                              <Button
                                theme="outline"
                                onClick={() =>
                                  window.electron.openExternal(
                                    nexusFilePageUrl(
                                      nexusGame.domainName,
                                      mod.modId,
                                      file.fileId
                                    )
                                  )
                                }
                              >
                                <LinkExternalIcon />
                                {t("open_on_nexus")}
                              </Button>
                            )}
                          </div>
                        );
                      })
                    )}
                    <button
                      type="button"
                      className="mods__link"
                      onClick={() =>
                        window.electron.openExternal(
                          nexusModPageUrl(nexusGame.domainName, mod.modId)
                        )
                      }
                    >
                      {t("mod_page")}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>

          {!loading && mods.length === 0 && !failed && (
            <p className="mods__hint">{t("nexus_empty")}</p>
          )}
          {loading && <p className="mods__hint">{t("loading")}</p>}
          {!loading && mods.length > 0 && nextOffset < totalCount && (
            <Button theme="outline" onClick={() => void load(nextOffset)}>
              {t("load_more")}
            </Button>
          )}

          <details className="mods__wrong-game">
            <summary>{t("nexus_wrong_game")}</summary>
            {gamePicker}
          </details>
        </>
      )}
    </section>
  );
}
