import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CopyIcon, TerminalIcon } from "@primer/octicons-react";

import { Button } from "@renderer/components";
import { useToast } from "@renderer/hooks";
import type { GameLaunchPreview, LibraryGame } from "@types";

export function LaunchPreview({ game }: Readonly<{ game: LibraryGame }>) {
  const { t } = useTranslation("game_details");
  const { showSuccessToast } = useToast();
  const [preview, setPreview] = useState<GameLaunchPreview | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setPreview(
        await window.electron.getGameLaunchPreview(game.shop, game.objectId)
      );
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!preview) return;
    await navigator.clipboard.writeText(preview.commandLine);
    showSuccessToast(t("launch_preview_copied"));
  };

  if (!game.executablePath) return null;

  return (
    <div className="game-options-modal__launch-preview">
      <div className="game-options-modal__row">
        <Button type="button" theme="outline" onClick={load} disabled={loading}>
          <TerminalIcon size={14} />
          {preview ? t("launch_preview_refresh") : t("launch_preview_show")}
        </Button>
        {preview && (
          <Button type="button" theme="outline" onClick={copy}>
            <CopyIcon size={14} />
            {t("launch_preview_copy")}
          </Button>
        )}
      </div>

      {preview && (
        <>
          <p className="game-options-modal__header-description">
            {t(`launch_preview_runner_${preview.runner}`)}
          </p>
          <pre className="game-options-modal__launch-preview-command">
            {preview.commandLine}
          </pre>
          <dl className="game-options-modal__launch-preview-facts">
            {preview.runner === "proton" && (
              <>
                <dt>{t("launch_preview_proton")}</dt>
                <dd>
                  {preview.protonPath ?? t("launch_preview_proton_umu")}
                  {preview.protonSource && preview.protonSource !== "umu" && (
                    <>
                      {" "}
                      (
                      {t(
                        `launch_preview_proton_source_${preview.protonSource}`
                      )}
                      )
                    </>
                  )}
                </dd>
                <dt>{t("launch_preview_prefix")}</dt>
                <dd>{preview.winePrefixPath ?? "-"}</dd>
              </>
            )}
            <dt>{t("launch_preview_options")}</dt>
            <dd>
              <code>{preview.launchOptions ?? "-"}</code>
            </dd>
            <dt>{t("launch_preview_rules")}</dt>
            <dd>
              {preview.rules
                .filter((rule) => rule.applied)
                .map((rule) => rule.name)
                .join(", ") || "-"}
            </dd>
            <dt>{t("launch_preview_working_directory")}</dt>
            <dd>{preview.workingDirectory}</dd>
          </dl>
          {Object.keys(preview.env).length > 0 && (
            <details className="game-options-modal__save-import-files">
              <summary>
                {t("launch_preview_environment", {
                  count: Object.keys(preview.env).length,
                })}
              </summary>
              <ul>
                {Object.entries(preview.env).map(([key, value]) => (
                  <li key={key}>
                    <code>
                      {key}={value}
                    </code>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
