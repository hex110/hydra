import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { debounce } from "lodash-es";
import { Trans, useTranslation } from "react-i18next";

import {
  Button,
  CheckboxField,
  ProtonPathPicker,
  TextField,
} from "@renderer/components";
import { settingsContext } from "@renderer/context";
import { useAppSelector } from "@renderer/hooks";
import type { ProtonVersion } from "@types";
import { DesktopDownloadIcon } from "@primer/octicons-react";
import { logger } from "@renderer/logger";

import { SettingsMangoHud } from "./settings-mangohud";
import { SettingsProtonManager } from "./settings-proton-manager";
import "./settings-behavior.scss";
import "./settings-general.scss";

let lastKnownCanInstallCommonRedist = false;

export function SettingsContextCompatibility() {
  const { t } = useTranslation("settings");
  const { updateUserPreferences } = useContext(settingsContext);
  const updateUserPreferencesRef = useRef(updateUserPreferences);
  updateUserPreferencesRef.current = updateUserPreferences;
  const shouldShowCommonRedist = window.electron.platform === "win32";

  const userPreferences = useAppSelector(
    (state) => state.userPreferences.value
  );

  const [canInstallCommonRedist, setCanInstallCommonRedist] = useState(
    () => lastKnownCanInstallCommonRedist
  );
  const [installingCommonRedist, setInstallingCommonRedist] = useState(false);
  const [protonVersions, setProtonVersions] = useState<ProtonVersion[]>([]);
  const [protonVersionsLoaded, setProtonVersionsLoaded] = useState(false);
  const [selectedDefaultProtonPath, setSelectedDefaultProtonPath] = useState(
    () => userPreferences?.defaultProtonPath ?? ""
  );
  const [defaultWinePrefixBasePath, setDefaultWinePrefixBasePath] =
    useState("");
  const [defaultWinePrefixPath, setDefaultWinePrefixPath] = useState(
    () => userPreferences?.defaultWinePrefixPath ?? ""
  );

  const [defaultLaunchOptions, setDefaultLaunchOptions] = useState(
    () => userPreferences?.defaultLaunchOptions ?? ""
  );
  const [prepareWinePrefixOnInstall, setPrepareWinePrefixOnInstall] = useState(
    () => userPreferences?.prepareWinePrefixOnInstall !== false
  );
  const [silentInstallers, setSilentInstallers] = useState(
    () => userPreferences?.silentInstallers !== false
  );
  const [postInstallCommand, setPostInstallCommand] = useState(
    () => userPreferences?.postInstallCommand ?? ""
  );
  const [gamesMissingPrefix, setGamesMissingPrefix] = useState<number | null>(
    null
  );
  const [prefixPreparation, setPrefixPreparation] = useState<{
    total: number;
    done: number;
  } | null>(null);

  useEffect(() => {
    if (!shouldShowCommonRedist) return;

    const applyCanInstall = (canInstall: boolean) => {
      lastKnownCanInstallCommonRedist = canInstall;
      setCanInstallCommonRedist(canInstall);
    };

    window.electron.canInstallCommonRedist().then(applyCanInstall);

    const interval = setInterval(() => {
      window.electron.canInstallCommonRedist().then(applyCanInstall);
    }, 1000 * 5);

    return () => {
      clearInterval(interval);
    };
  }, [shouldShowCommonRedist]);

  useEffect(() => {
    if (!shouldShowCommonRedist) return;

    const unlisten = window.electron.onCommonRedistProgress(
      ({ log, complete }) => {
        if (log === "Installation timed out" || complete) {
          setInstallingCommonRedist(false);
        }
      }
    );

    return () => unlisten();
  }, [shouldShowCommonRedist]);

  useEffect(() => {
    setDefaultLaunchOptions(userPreferences?.defaultLaunchOptions ?? "");
  }, [userPreferences?.defaultLaunchOptions]);

  useEffect(() => {
    setPrepareWinePrefixOnInstall(
      userPreferences?.prepareWinePrefixOnInstall !== false
    );
    setSilentInstallers(userPreferences?.silentInstallers !== false);
    setPostInstallCommand(userPreferences?.postInstallCommand ?? "");
  }, [
    userPreferences?.prepareWinePrefixOnInstall,
    userPreferences?.silentInstallers,
    userPreferences?.postInstallCommand,
  ]);

  useEffect(() => {
    if (window.electron.platform !== "linux") return;

    window.electron
      .countGamesMissingPrefix()
      .then(setGamesMissingPrefix)
      .catch(() => setGamesMissingPrefix(null));
  }, []);

  const isPreparingPrefixes = prefixPreparation !== null;

  useEffect(() => {
    if (!isPreparingPrefixes) return;

    return window.electron.onGameSetupStatus(({ status }) => {
      if (status !== "completed" && status !== "failed" && status !== "skipped")
        return;

      setPrefixPreparation((current) => {
        if (!current) return current;
        const done = current.done + 1;
        if (done < current.total) return { ...current, done };

        window.electron
          .countGamesMissingPrefix()
          .then(setGamesMissingPrefix)
          .catch(() => {});
        return null;
      });
    });
  }, [isPreparingPrefixes]);

  const handlePrepareMissingPrefixes = async () => {
    const total = await window.electron.prepareMissingGamePrefixes();
    if (total > 0) setPrefixPreparation({ total, done: 0 });
  };

  const savePostInstallCommand = useMemo(
    () =>
      debounce((value: string) => {
        updateUserPreferencesRef.current({
          postInstallCommand: value.trim() || null,
        });
      }, 1000),
    []
  );

  useEffect(
    () => () => savePostInstallCommand.flush(),
    [savePostInstallCommand]
  );

  const saveDefaultLaunchOptions = useMemo(
    () =>
      debounce((value: string) => {
        updateUserPreferencesRef.current({
          defaultLaunchOptions: value.trim() || null,
        });
      }, 1000),
    []
  );

  useEffect(
    () => () => saveDefaultLaunchOptions.flush(),
    [saveDefaultLaunchOptions]
  );

  useEffect(() => {
    if (!userPreferences) return;

    setSelectedDefaultProtonPath(userPreferences.defaultProtonPath ?? "");
    setDefaultWinePrefixPath(
      userPreferences.defaultWinePrefixPath ?? defaultWinePrefixBasePath
    );
  }, [defaultWinePrefixBasePath, userPreferences]);

  useEffect(() => {
    if (window.electron.platform !== "linux") {
      setDefaultWinePrefixBasePath("");
      setDefaultWinePrefixPath("");
      return;
    }

    window.electron
      .getDefaultWinePrefixSelectionPath()
      .then((path) => {
        const resolvedPath = path ?? "";
        setDefaultWinePrefixBasePath(resolvedPath);
        setDefaultWinePrefixPath(
          userPreferences?.defaultWinePrefixPath ?? resolvedPath
        );
      })
      .catch(() => {
        setDefaultWinePrefixBasePath("");
        setDefaultWinePrefixPath(userPreferences?.defaultWinePrefixPath ?? "");
      });
  }, []);

  const loadProtonVersions = useCallback(() => {
    if (window.electron.platform !== "linux") return;

    window.electron
      .getInstalledProtonVersions()
      .then(setProtonVersions)
      .catch(() => setProtonVersions([]))
      .finally(() => setProtonVersionsLoaded(true));
  }, []);

  useEffect(loadProtonVersions, [loadProtonVersions]);

  useEffect(() => {
    if (!protonVersionsLoaded || !selectedDefaultProtonPath) return;

    const hasSelectedVersion = protonVersions.some(
      (version) => version.path === selectedDefaultProtonPath
    );

    if (!hasSelectedVersion) {
      setSelectedDefaultProtonPath("");
    }
  }, [protonVersions, protonVersionsLoaded, selectedDefaultProtonPath]);

  const protonVersionAutoLabel = t("proton_version_umu_choice", {
    ns: ["settings", "game_details"],
  });

  const protonSourceUmuDefault = t("proton_source_umu_choice", {
    ns: ["settings", "game_details"],
  });

  const protonSourceSteam = t("proton_source_steam", {
    ns: ["settings", "game_details"],
  });

  const protonSourceCompatibilityTools = t(
    "proton_source_compatibility_tools",
    {
      ns: ["settings", "game_details"],
    }
  );

  const handleInstallCommonRedist = async () => {
    setInstallingCommonRedist(true);
    try {
      await window.electron.installCommonRedist();
    } catch (err) {
      logger.error(err);
      setInstallingCommonRedist(false);
    }
  };

  const handleChooseDefaultWinePrefixPath = async () => {
    const { filePaths } = await window.electron.showOpenDialog({
      defaultPath: defaultWinePrefixPath,
      properties: ["openDirectory"],
    });

    if (!filePaths.length) return;

    const nextPath = filePaths[0];
    setDefaultWinePrefixPath(nextPath);
    await updateUserPreferences({ defaultWinePrefixPath: nextPath });
  };

  const handleClearDefaultWinePrefixPath = async () => {
    await updateUserPreferences({ defaultWinePrefixPath: null });

    window.electron
      .getDefaultWinePrefixSelectionPath()
      .then((path) => {
        const resolvedPath = path ?? "";
        setDefaultWinePrefixBasePath(resolvedPath);
        setDefaultWinePrefixPath(resolvedPath);
      })
      .catch(() => {
        setDefaultWinePrefixPath(defaultWinePrefixBasePath);
      });
  };

  const hasCustomDefaultWinePrefixPath =
    userPreferences?.defaultWinePrefixPath != null;

  return (
    <div className="settings-context-panel settings-context-compatibility">
      {window.electron.platform === "linux" && (
        <div className="settings-context-panel__group">
          <div className="settings-context-compatibility__stack">
            <div className="settings-context-compatibility__section">
              <TextField
                label={t("default_wine_prefix", {
                  defaultValue: "Default Wine prefix location",
                })}
                value={defaultWinePrefixPath}
                readOnly
                disabled
                placeholder={t("no_directory_selected")}
                rightContent={
                  <>
                    <Button
                      type="button"
                      theme="outline"
                      onClick={handleChooseDefaultWinePrefixPath}
                    >
                      {t("change")}
                    </Button>
                    {hasCustomDefaultWinePrefixPath && (
                      <Button
                        type="button"
                        theme="outline"
                        onClick={handleClearDefaultWinePrefixPath}
                      >
                        {t("clear")}
                      </Button>
                    )}
                  </>
                }
              />
            </div>

            <div className="settings-behavior__proton-section settings-context-compatibility__section">
              <p className="settings-behavior__proton-description">
                {t("default_proton_version_description")}
              </p>

              <ProtonPathPicker
                versions={protonVersions}
                selectedPath={selectedDefaultProtonPath}
                onChange={(value) => {
                  setSelectedDefaultProtonPath(value);
                  updateUserPreferences({ defaultProtonPath: value || null });
                }}
                radioName="default-proton-version"
                autoLabel={protonVersionAutoLabel}
                autoSourceDescription={protonSourceUmuDefault}
                steamSourceDescription={protonSourceSteam}
                compatibilityToolsSourceDescription={
                  protonSourceCompatibilityTools
                }
              />
            </div>

            <p className="settings-general__common-redist-description">
              {t("compatibility_tools_moved")}
            </p>
          </div>
        </div>
      )}

      {window.electron.platform === "linux" && (
        <>
          <SettingsProtonManager onChange={loadProtonVersions} />
          <SettingsMangoHud />
        </>
      )}

      <div className="settings-context-panel__group">
        <h3>{t("game_setup")}</h3>
        <p className="settings-general__common-redist-description">
          {t("game_setup_description")}
        </p>

        {window.electron.platform === "linux" && (
          <>
            <CheckboxField
              label={t("prepare_wine_prefix_on_install")}
              checked={prepareWinePrefixOnInstall}
              onChange={() => {
                const nextValue = !prepareWinePrefixOnInstall;
                setPrepareWinePrefixOnInstall(nextValue);
                updateUserPreferences({
                  prepareWinePrefixOnInstall: nextValue,
                });
              }}
            />

            <CheckboxField
              label={t("silent_installers")}
              checked={silentInstallers}
              onChange={() => {
                const nextValue = !silentInstallers;
                setSilentInstallers(nextValue);
                updateUserPreferences({ silentInstallers: nextValue });
              }}
            />
            <p className="settings-general__common-redist-description">
              {t("silent_installers_description")}
            </p>

            <div className="settings-context-compatibility__setup-row">
              <span>
                {prefixPreparation
                  ? t("preparing_wine_prefixes", {
                      done: prefixPreparation.done,
                      total: prefixPreparation.total,
                    })
                  : t("games_missing_wine_prefix", {
                      count: gamesMissingPrefix ?? 0,
                    })}
              </span>
              <Button
                type="button"
                theme="outline"
                disabled={isPreparingPrefixes || !gamesMissingPrefix}
                onClick={handlePrepareMissingPrefixes}
              >
                {t("prepare_missing_wine_prefixes")}
              </Button>
            </div>
          </>
        )}

        <TextField
          label={t("post_install_command")}
          value={postInstallCommand}
          theme="dark"
          placeholder={t("post_install_command_placeholder")}
          onChange={(event) => {
            setPostInstallCommand(event.target.value);
            savePostInstallCommand(event.target.value);
          }}
        />
        <p className="settings-general__common-redist-description">
          <Trans
            i18nKey="post_install_command_description"
            ns="settings"
            components={{ code: <code /> }}
          />
        </p>
      </div>

      <div className="settings-context-panel__group">
        <h3>{t("default_launch_options")}</h3>
        <p className="settings-general__common-redist-description">
          {window.electron.platform === "linux" ? (
            <Trans
              i18nKey="default_launch_options_description_linux"
              ns="settings"
              components={{ code: <code /> }}
            />
          ) : (
            t("default_launch_options_description")
          )}
        </p>
        <TextField
          value={defaultLaunchOptions}
          theme="dark"
          placeholder={t("default_launch_options_placeholder")}
          onChange={(event) => {
            setDefaultLaunchOptions(event.target.value);
            saveDefaultLaunchOptions(event.target.value);
          }}
          rightContent={
            defaultLaunchOptions && (
              <Button
                type="button"
                theme="outline"
                onClick={() => {
                  saveDefaultLaunchOptions.cancel();
                  setDefaultLaunchOptions("");
                  updateUserPreferences({ defaultLaunchOptions: null });
                }}
              >
                {t("clear")}
              </Button>
            )
          }
        />
      </div>

      {shouldShowCommonRedist && (
        <div className="settings-context-panel__group">
          <h3>{t("common_redist")}</h3>

          <p className="settings-general__common-redist-description">
            {t("common_redist_description")}
          </p>

          <Button
            onClick={handleInstallCommonRedist}
            className="settings-general__common-redist-button"
            disabled={!canInstallCommonRedist || installingCommonRedist}
          >
            <DesktopDownloadIcon />
            {installingCommonRedist
              ? t("installing_common_redist")
              : t("install_common_redist")}
          </Button>
        </div>
      )}
    </div>
  );
}
