import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  FileZipIcon,
  SyncIcon,
  TrashIcon,
} from "@primer/octicons-react";

import { Badge, Button, CheckboxField } from "@renderer/components";
import { setHeaderTitle } from "@renderer/features";
import { useAppDispatch, useToast } from "@renderer/hooks";
import { logger } from "@renderer/logger";
import { getMissingModRequirements } from "@shared";
import type {
  GameMods,
  GameShop,
  InstalledMod,
  ModActionResult,
  ModInstallProgress,
} from "@types";

import { NexusBrowser } from "./nexus-browser";
import "./mods.scss";

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
  const { showSuccessToast } = useToast();
  const reportResult = useModActionToast();

  const [gameMods, setGameMods] = useState<GameMods | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState<Record<string, ModInstallProgress>>(
    {}
  );

  useEffect(() => {
    if (title) dispatch(setHeaderTitle(t("page_title", { game: title })));
  }, [dispatch, title, t]);

  const refresh = useCallback(async () => {
    if (!shop || !objectId) return;
    try {
      setGameMods(await window.electron.getGameMods(shop, objectId));
    } catch (error) {
      logger.error("Failed to load mods", error);
    }
  }, [shop, objectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(
    () =>
      window.electron.onModInstallProgress((next, key) => {
        setProgress((current) => {
          const updated = { ...current };
          if (next && next.objectId === objectId) updated[key] = next;
          else delete updated[key];
          return updated;
        });
        if (!next) void refresh();
      }),
    [objectId, refresh]
  );

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

  const mods = gameMods?.mods ?? [];

  return (
    <div className="mods">
      <section className="mods__installed">
        <header className="mods__header">
          <div>
            <h2 className="mods__title">{t("installed_title")}</h2>
            <p className="mods__hint">
              {gameMods?.gameFolder
                ? t("installed_hint", { folder: gameMods.gameFolder })
                : t("no_game_folder")}
            </p>
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
              disabled={busy || !gameMods?.gameFolder}
              onClick={() =>
                run(() => window.electron.installModFromFile(shop, objectId))
              }
            >
              <FileZipIcon />
              {t("install_from_file")}
            </Button>
          </div>
        </header>

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
                    disabled={busy}
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
                        : t("source_file")}
                    </Badge>
                    {mod.fomod && (
                      <span title={t("fomod_hint")}>{t("fomod")}</span>
                    )}
                    {missing.length > 0 && (
                      <span title={t("requirements_missing_hint")}>
                        {t("requirements_missing", {
                          names: missing.map((item) => item.name).join(", "),
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
                        disabled={busy}
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
                      disabled={busy || index === 0}
                      onClick={() =>
                        run(() =>
                          window.electron.moveMod(shop, objectId, mod.id, -1)
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
                      disabled={busy || index === mods.length - 1}
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
                      disabled={busy}
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
        {mods.length > 1 && <p className="mods__hint">{t("order_hint")}</p>}
      </section>

      <NexusBrowser
        shop={shop}
        objectId={objectId}
        installedMods={mods}
        progress={progress}
        disabled={!gameMods?.gameFolder}
        onInstalled={refresh}
      />
    </div>
  );
}
