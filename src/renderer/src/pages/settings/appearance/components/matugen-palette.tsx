import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckIcon } from "@primer/octicons-react";
import { MATUGEN_TEMPLATE, MATUGEN_PALETTE_TOKENS } from "@shared";
import type { MatugenPaletteState } from "@types";
import { Button, CheckboxField, TextField } from "@renderer/components";
import { useToast } from "@renderer/hooks";
import { logger } from "@renderer/logger";
import "./matugen-palette.scss";

export const MatugenPalette = () => {
  const { t } = useTranslation("settings");
  const { showSuccessToast, showErrorToast } = useToast();

  const [state, setState] = useState<MatugenPaletteState | null>(null);
  const [pathDraft, setPathDraft] = useState("");
  const [isSettingUp, setIsSettingUp] = useState(false);

  useEffect(() => {
    window.electron.getMatugenPalette().then((loaded) => {
      setState(loaded);
      setPathDraft(loaded.path === loaded.defaultPath ? "" : loaded.path);
    });

    return window.electron.onMatugenPaletteUpdated(setState);
  }, []);

  const update = useCallback(
    async (change: { enabled?: boolean; path?: string | null }) => {
      setState(await window.electron.setMatugenPalette(change));
    },
    []
  );

  const handleSetup = useCallback(async () => {
    setIsSettingUp(true);

    try {
      const result = await window.electron.setupMatugenPalette();
      setPathDraft("");
      showSuccessToast(
        t(
          result.configChanged
            ? "matugen_setup_done"
            : "matugen_setup_unchanged"
        )
      );
    } catch (error) {
      logger.error("Failed to set up matugen", error);
      showErrorToast(
        t("matugen_setup_failed", {
          error: error instanceof Error ? error.message : String(error),
        })
      );
    } finally {
      setIsSettingUp(false);
    }
  }, [showErrorToast, showSuccessToast, t]);

  const handleCopyTemplate = useCallback(async () => {
    await navigator.clipboard.writeText(MATUGEN_TEMPLATE);
    showSuccessToast(t("matugen_template_copied"));
  }, [showSuccessToast, t]);

  if (!state) return null;

  const statusText = state.enabled ? t(`matugen_status_${state.status}`) : null;

  return (
    <section className="matugen-palette">
      <h3 className="matugen-palette__title">{t("matugen_title")}</h3>
      <p className="matugen-palette__description">{t("matugen_description")}</p>

      <CheckboxField
        label={t("matugen_enable")}
        checked={state.enabled}
        onChange={() => update({ enabled: !state.enabled })}
      />

      {statusText && (
        <p
          className={`matugen-palette__status matugen-palette__status--${state.status}`}
        >
          {statusText}
        </p>
      )}

      {state.enabled && state.status === "applied" && (
        <ul className="matugen-palette__swatches">
          {MATUGEN_PALETTE_TOKENS.filter((token) => state.palette[token]).map(
            (token) => (
              <li
                key={token}
                className="matugen-palette__swatch"
                title={`${token}: ${state.palette[token]}`}
              >
                <span
                  className="matugen-palette__swatch-color"
                  style={{ background: state.palette[token] }}
                />
                {token}
              </li>
            )
          )}
        </ul>
      )}

      <div className="matugen-palette__setup">
        {state.templateConfigured ? (
          <p className="matugen-palette__configured">
            <CheckIcon size={16} />
            {t("matugen_configured", { configPath: state.configPath })}
          </p>
        ) : (
          <p className="matugen-palette__hint">
            {t("matugen_setup_hint", { configPath: state.configPath })}
          </p>
        )}

        <div className="matugen-palette__actions">
          {!state.templateConfigured && (
            <Button onClick={handleSetup} disabled={isSettingUp}>
              {t("matugen_setup")}
            </Button>
          )}
          <Button theme="outline" onClick={handleCopyTemplate}>
            {t("matugen_copy_template")}
          </Button>
        </div>
      </div>

      <TextField
        label={t("matugen_path_label")}
        hint={t("matugen_path_hint")}
        value={pathDraft}
        placeholder={state.defaultPath}
        onChange={(event) => setPathDraft(event.target.value)}
        onBlur={() => {
          const next = pathDraft.trim();
          if (next !== (state.path === state.defaultPath ? "" : state.path)) {
            void update({ path: next || null });
          }
        }}
      />
    </section>
  );
};
