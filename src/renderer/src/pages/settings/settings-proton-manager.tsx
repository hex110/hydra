import { useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DownloadIcon, SyncIcon, TrashIcon } from "@primer/octicons-react";

import {
  Button,
  CheckboxField,
  ConfirmationModal,
  SelectField,
} from "@renderer/components";
import { settingsContext } from "@renderer/context";
import { useAppSelector, useDate, useToast } from "@renderer/hooks";
import { formatBytes } from "@shared";
import type {
  ManagedProtonBuild,
  ProtonFlavor,
  ProtonFlavorOverview,
  ProtonInstallProgress,
} from "@types";

import "./settings-proton-manager.scss";

const FLAVOR_NAMES: Record<ProtonFlavor, string> = {
  "ge-proton": "GE-Proton",
  "proton-cachyos": "Proton-CachyOS",
};

export function SettingsProtonManager({
  onChange,
}: Readonly<{ onChange: () => void }>) {
  const { t } = useTranslation("settings");
  const { updateUserPreferences } = useContext(settingsContext);
  const { showSuccessToast, showErrorToast } = useToast();
  const { formatDate } = useDate();
  const userPreferences = useAppSelector(
    (state) => state.userPreferences.value
  );

  const [overview, setOverview] = useState<ProtonFlavorOverview[] | null>(null);
  const [selectedTags, setSelectedTags] = useState<
    Partial<Record<ProtonFlavor, string>>
  >({});
  const [progress, setProgress] = useState<
    Partial<Record<ProtonFlavor, ProtonInstallProgress>>
  >({});
  const [removal, setRemoval] = useState<{
    build: ManagedProtonBuild;
    usage: { games: string[]; isDefault: boolean };
  } | null>(null);

  const refresh = useCallback((force = false) => {
    window.electron
      .getProtonOverview(force)
      .then(setOverview)
      .catch(() => setOverview([]));
  }, []);

  useEffect(() => refresh(), [refresh]);

  useEffect(
    () =>
      window.electron.onProtonInstallProgress((event) =>
        setProgress((current) => ({ ...current, [event.flavor]: event }))
      ),
    []
  );

  const install = async (flavor: ProtonFlavor) => {
    const tag = selectedTags[flavor];
    const result = await window.electron.installProton(flavor, tag);
    if (result.ok) {
      showSuccessToast(t("proton_installed", { name: FLAVOR_NAMES[flavor] }));
    } else {
      showErrorToast(t("proton_install_failed", { message: result.message }));
    }
    setProgress((current) => ({ ...current, [flavor]: undefined }));
    refresh();
    onChange();
  };

  const askRemove = async (build: ManagedProtonBuild) => {
    setRemoval({
      build,
      usage: await window.electron.getProtonUsage(build.path),
    });
  };

  const remove = async () => {
    if (!removal) return;
    await window.electron.removeProton(removal.build.path);
    if (removal.usage.isDefault) {
      await updateUserPreferences({ defaultProtonPath: null });
    }
    setRemoval(null);
    refresh();
    onChange();
  };

  const toggleAutoUpdate = (flavor: ProtonFlavor) => {
    const current = userPreferences?.protonAutoUpdate ?? [];
    updateUserPreferences({
      protonAutoUpdate: current.includes(flavor)
        ? current.filter((item) => item !== flavor)
        : [...current, flavor],
    });
  };

  const describeProgress = (event: ProtonInstallProgress | undefined) => {
    if (!event || event.stage === "done" || event.stage === "failed") {
      return null;
    }
    return event.stage === "downloading"
      ? t("proton_downloading", { percent: Math.round(event.progress * 100) })
      : t(`proton_${event.stage}`);
  };

  return (
    <div className="settings-context-panel__group settings-proton-manager">
      <div className="settings-proton-manager__header">
        <h3>{t("proton_manager")}</h3>
        <Button type="button" theme="outline" onClick={() => refresh(true)}>
          <SyncIcon size={14} />
          {t("proton_check_releases")}
        </Button>
      </div>
      <p className="settings-general__common-redist-description">
        {t("proton_manager_description")}
      </p>

      {overview === null && (
        <p className="settings-general__common-redist-description">
          {t("proton_loading")}
        </p>
      )}

      {overview?.map((flavor) => {
        const installedTags = new Set(flavor.installed.map((b) => b.tag));
        const busy = describeProgress(progress[flavor.flavor]);
        const tag = selectedTags[flavor.flavor] ?? flavor.latest?.tag ?? "";
        const release = flavor.releases.find((item) => item.tag === tag);
        const autoUpdate =
          userPreferences?.protonAutoUpdate?.includes(flavor.flavor) ?? false;

        return (
          <div key={flavor.flavor} className="settings-proton-manager__flavor">
            <strong>{FLAVOR_NAMES[flavor.flavor]}</strong>
            {flavor.error && (
              <p className="settings-general__common-redist-description">
                {t("proton_check_failed", { message: flavor.error })}
              </p>
            )}

            {flavor.releases.length > 0 && (
              <div className="settings-proton-manager__install">
                <SelectField
                  value={tag}
                  theme="dark"
                  options={flavor.releases.map((item, index) => ({
                    key: item.tag,
                    value: item.tag,
                    label: `${item.tag}${index === 0 ? ` (${t("proton_latest")})` : ""}${
                      installedTags.has(item.tag)
                        ? ` · ${t("proton_installed_label")}`
                        : ""
                    } · ${formatDate(item.publishedAt)}`,
                  }))}
                  onChange={(event) =>
                    setSelectedTags((current) => ({
                      ...current,
                      [flavor.flavor]: event.target.value,
                    }))
                  }
                />
                <Button
                  type="button"
                  theme="outline"
                  disabled={!!busy || installedTags.has(tag)}
                  onClick={() => install(flavor.flavor)}
                >
                  <DownloadIcon size={14} />
                  {busy ??
                    (release
                      ? t("proton_install", {
                          size: formatBytes(release.sizeInBytes),
                        })
                      : t("proton_install_plain"))}
                </Button>
              </div>
            )}

            {flavor.installed.length > 0 && (
              <ul className="settings-proton-manager__builds">
                {flavor.installed.map((build) => (
                  <li key={build.path}>
                    <span title={build.path}>{build.tag}</span>
                    <button
                      type="button"
                      className="settings-proton-manager__remove"
                      onClick={() => askRemove(build)}
                      aria-label={t("proton_remove")}
                      title={t("proton_remove")}
                    >
                      <TrashIcon size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <CheckboxField
              label={t("proton_auto_update", {
                name: FLAVOR_NAMES[flavor.flavor],
              })}
              checked={autoUpdate}
              onChange={() => toggleAutoUpdate(flavor.flavor)}
            />
          </div>
        );
      })}

      <ConfirmationModal
        visible={removal !== null}
        title={t("proton_remove_title", { name: removal?.build.tag ?? "" })}
        descriptionText={
          removal && (removal.usage.games.length > 0 || removal.usage.isDefault)
            ? t("proton_remove_in_use", {
                games: removal.usage.games.join(", ") || "-",
                count: removal.usage.games.length,
                default: removal.usage.isDefault
                  ? t("proton_remove_is_default")
                  : "",
              })
            : t("proton_remove_description")
        }
        confirmButtonLabel={t("proton_remove")}
        cancelButtonLabel={t("cancel")}
        onConfirm={remove}
        onClose={() => setRemoval(null)}
      />
    </div>
  );
}
