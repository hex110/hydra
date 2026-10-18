import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { debounce } from "lodash-es";
import { Trans, useTranslation } from "react-i18next";
import {
  DownloadIcon,
  PlusIcon,
  SyncIcon,
  TrashIcon,
  UploadIcon,
} from "@primer/octicons-react";
import {
  LAUNCH_RULE_PRESETS,
  mergeLaunchRules,
  parseLaunchRuleFiles,
  parseLaunchRulesExport,
  resolveLaunchRules,
} from "@shared";
import type { LaunchRule, ProtonVersion } from "@types";

import {
  Badge,
  Button,
  CheckboxField,
  SelectField,
  TextField,
} from "@renderer/components";
import { settingsContext } from "@renderer/context";
import { useAppSelector, useToast } from "@renderer/hooks";

import { LaunchRuleActionsEditor } from "./settings-launch-rule-actions";
import "./settings-launch-rules.scss";

/** Rules as edited: the file list stays raw text until saved. */
interface RuleDraft extends Omit<LaunchRule, "files"> {
  filesText: string;
}

const toDraft = (rule: LaunchRule): RuleDraft => ({
  id: rule.id,
  name: rule.name,
  enabled: rule.enabled,
  ...(rule.matchAllGames ? { matchAllGames: true } : {}),
  launchOptions: rule.launchOptions,
  filesText: rule.files.join(", "),
  ...(rule.presetId ? { presetId: rule.presetId } : {}),
  ...(rule.actions ? { actions: rule.actions } : {}),
});

const fromDraft = ({ filesText, ...rule }: RuleDraft): LaunchRule => ({
  ...rule,
  files: parseLaunchRuleFiles(filesText),
});

export function SettingsContextLaunchRules() {
  const { t } = useTranslation("settings");
  const { showSuccessToast, showErrorToast } = useToast();
  const { updateUserPreferences } = useContext(settingsContext);
  const updateUserPreferencesRef = useRef(updateUserPreferences);
  updateUserPreferencesRef.current = updateUserPreferences;

  const savedRules = useAppSelector(
    (state) => state.userPreferences.value?.launchRules
  );
  const [drafts, setDrafts] = useState<RuleDraft[]>(() =>
    resolveLaunchRules(savedRules).map(toDraft)
  );
  const [protonVersions, setProtonVersions] = useState<ProtonVersion[]>([]);

  useEffect(() => {
    if (window.electron.platform !== "linux") return;
    window.electron
      .getInstalledProtonVersions()
      .then(setProtonVersions)
      .catch(() => setProtonVersions([]));
  }, []);

  const save = useMemo(
    () =>
      debounce((next: RuleDraft[]) => {
        updateUserPreferencesRef.current({
          launchRules: next.map(fromDraft),
        });
      }, 500),
    []
  );

  useEffect(() => () => save.flush(), [save]);

  const commit = (next: RuleDraft[], immediately = false) => {
    setDrafts(next);
    save(next);
    if (immediately) save.flush();
  };

  const updateRule = (id: string, changes: Partial<RuleDraft>) =>
    commit(
      drafts.map((rule) => (rule.id === id ? { ...rule, ...changes } : rule))
    );

  const addRule = () =>
    commit(
      [
        ...drafts,
        {
          id: crypto.randomUUID(),
          name: t("launch_rules_new_rule"),
          enabled: true,
          filesText: "",
          launchOptions: "%command%",
        },
      ],
      true
    );

  const missingPresets = LAUNCH_RULE_PRESETS.filter(
    (preset) => !drafts.some((rule) => rule.presetId === preset.presetId)
  );

  const restorePresets = () =>
    commit([...drafts, ...missingPresets.map(toDraft)], true);

  const exportRules = async () => {
    await navigator.clipboard.writeText(
      JSON.stringify({ launchRules: drafts.map(fromDraft) }, null, 2)
    );
    showSuccessToast(t("launch_rules_exported"));
  };

  const importRules = async () => {
    const imported = parseLaunchRulesExport(
      await navigator.clipboard.readText().catch(() => "")
    );
    if (!imported || imported.length === 0) {
      showErrorToast(t("launch_rules_import_failed"));
      return;
    }
    commit(
      mergeLaunchRules(drafts.map(fromDraft), imported).map(toDraft),
      true
    );
    showSuccessToast(t("launch_rules_imported", { count: imported.length }));
  };

  return (
    <div className="settings-context-panel settings-launch-rules">
      <div className="settings-context-panel__group">
        <p className="settings-launch-rules__muted">
          <Trans
            i18nKey="launch_rules_description"
            ns="settings"
            components={{ code: <code /> }}
          />
        </p>
      </div>

      {drafts.length === 0 && (
        <p className="settings-launch-rules__muted">
          {t("launch_rules_empty")}
        </p>
      )}

      <ul className="settings-launch-rules__list">
        {drafts.map((rule) => (
          <li key={rule.id} className="settings-launch-rules__rule">
            <div className="settings-launch-rules__rule-header">
              <CheckboxField
                label={t("launch_rules_enabled")}
                checked={rule.enabled}
                onChange={() =>
                  commit(
                    drafts.map((item) =>
                      item.id === rule.id
                        ? { ...item, enabled: !item.enabled }
                        : item
                    ),
                    true
                  )
                }
              />
              {rule.presetId && <Badge>{t("launch_rules_built_in")}</Badge>}
              <Button
                type="button"
                theme="outline"
                onClick={() =>
                  commit(
                    drafts.filter((item) => item.id !== rule.id),
                    true
                  )
                }
              >
                <TrashIcon size={14} />
                {t("launch_rules_remove")}
              </Button>
            </div>

            <TextField
              label={t("launch_rules_name")}
              value={rule.name}
              theme="dark"
              onChange={(event) =>
                updateRule(rule.id, { name: event.target.value })
              }
            />
            <SelectField
              label={t("launch_rules_applies_to")}
              theme="dark"
              value={rule.matchAllGames ? "all" : "files"}
              options={[
                {
                  key: "files",
                  value: "files",
                  label: t("launch_rules_applies_to_files"),
                },
                {
                  key: "all",
                  value: "all",
                  label: t("launch_rules_applies_to_all"),
                },
              ]}
              onChange={(event) =>
                commit(
                  drafts.map((item) =>
                    item.id === rule.id
                      ? { ...item, matchAllGames: event.target.value === "all" }
                      : item
                  ),
                  true
                )
              }
            />
            {!rule.matchAllGames && (
              <TextField
                label={t("launch_rules_files")}
                value={rule.filesText}
                theme="dark"
                placeholder="ReShade.ini, *protected_game*.exe"
                onChange={(event) =>
                  updateRule(rule.id, { filesText: event.target.value })
                }
              />
            )}
            <TextField
              label={t("launch_rules_launch_options")}
              value={rule.launchOptions}
              theme="dark"
              placeholder="VARIABLE=1 %command% -argument"
              onChange={(event) =>
                updateRule(rule.id, { launchOptions: event.target.value })
              }
            />
            {window.electron.platform === "linux" && (
              <LaunchRuleActionsEditor
                actions={rule.actions}
                protonVersions={protonVersions}
                onChange={(actions) => updateRule(rule.id, { actions })}
              />
            )}
          </li>
        ))}
      </ul>

      <div className="settings-launch-rules__actions">
        <Button type="button" theme="outline" onClick={addRule}>
          <PlusIcon size={14} />
          {t("launch_rules_add")}
        </Button>
        {missingPresets.length > 0 && (
          <Button type="button" theme="outline" onClick={restorePresets}>
            <SyncIcon size={14} />
            {t("launch_rules_restore_presets", {
              count: missingPresets.length,
            })}
          </Button>
        )}
        <Button type="button" theme="outline" onClick={exportRules}>
          <UploadIcon size={14} />
          {t("launch_rules_export")}
        </Button>
        <Button type="button" theme="outline" onClick={importRules}>
          <DownloadIcon size={14} />
          {t("launch_rules_import")}
        </Button>
      </div>
    </div>
  );
}
