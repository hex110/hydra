import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CommentDiscussionIcon } from "@primer/octicons-react";

import { formatDownloadProgress } from "@renderer/helpers";
import {
  useAppSelector,
  useDownload,
  useToast,
  useUserDetails,
} from "@renderer/hooks";
import { selectBottomBarStatus } from "../../features/activity/activity";
import { useActivity } from "../../features/activity/use-activity";
import { ProgressBar } from "../progress-bar/progress-bar";

import "./bottom-panel.scss";

import { useNavigate } from "react-router-dom";

const HYDRA_CLOUD_GRADIENT_START_COLOR = "var(--hydra-accent, #16b195)";
const HYDRA_CLOUD_GRADIENT_END_COLOR = "var(--hydra-accent-secondary, #3e62c0)";

export function BottomPanel() {
  const { t } = useTranslation(["bottom_panel", "sidebar"]);

  const navigate = useNavigate();

  const { userDetails, hasActiveSubscription } = useUserDetails();

  const { showSuccessToast } = useToast();

  const { lastPacket, progress, downloadSpeed, eta } = useDownload();

  const extraction = useAppSelector((state) => state.download.extraction);

  const [version, setVersion] = useState("");
  const [sessionHash, setSessionHash] = useState<null | string>("");
  const [commonRedistStatus, setCommonRedistStatus] = useState<string | null>(
    null
  );

  useEffect(() => {
    window.electron.getVersion().then((result) => setVersion(result));
  }, []);

  useEffect(() => {
    const unlisten = window.electron.onCommonRedistProgress(
      ({ log, complete }) => {
        if (log === "Installation timed out" || complete) {
          setCommonRedistStatus(null);

          if (complete) {
            showSuccessToast(
              t("installation_complete"),
              t("installation_complete_message")
            );
          }

          return;
        }

        setCommonRedistStatus(log);
      }
    );

    return () => unlisten();
  }, [t, showSuccessToast]);

  useEffect(() => {
    window.electron.getSessionHash().then((result) => setSessionHash(result));
  }, [userDetails?.id]);

  const { groups } = useActivity();

  const bar = useMemo(
    () =>
      selectBottomBarStatus(groups, { external: commonRedistStatus !== null }),
    [groups, commonRedistStatus]
  );

  const status = useMemo(() => {
    if (bar.external) {
      return t("installing_common_redist", { log: commonRedistStatus });
    }

    const item = bar.primary;
    if (item) {
      const { source } = item;

      if (source.kind === "game-download") {
        const title = source.game.title;

        if (extraction?.visibleId === source.game.id) {
          return t("extracting", {
            title,
            percentage: `${Math.round(extraction.progress * 100)}%`,
          });
        }

        if (lastPacket?.gameId !== source.game.id) {
          return t("calculating_eta", {
            title,
            percentage: formatDownloadProgress(source.game.download?.progress),
          });
        }

        if (lastPacket.isRecovering) {
          return t("recovering", {
            title,
            percentage: `${Math.round((lastPacket.recoveryProgress ?? 0) * 100)}%`,
          });
        }

        if (lastPacket.isReconnecting) return t("reconnecting", { title });

        if (lastPacket.isCheckingFiles) {
          return t("checking_files", { title, percentage: progress });
        }

        if (lastPacket.isDownloadingMetadata) {
          return t("downloading_metadata", { title, percentage: progress });
        }

        if (!eta) return t("calculating_eta", { title, percentage: progress });

        return t("downloading", {
          title,
          percentage: progress,
          eta,
          speed: downloadSpeed,
        });
      }

      if (source.kind === "mod-download") {
        const mod = source.download.modName;
        if (source.download.state === "downloading") {
          return t("mod_downloading", {
            mod,
            percentage: `${Math.round((source.download.progress ?? 0) * 100)}%`,
          });
        }
        return t(
          source.download.state === "installing"
            ? "mod_installing"
            : "mod_waiting_torbox",
          { mod }
        );
      }

      return t("activity_line", { title: item.title, status: item.status });
    }

    const next = bar.upNext;
    if (next) {
      const paused =
        (next.source.kind === "game-download" &&
          !next.source.game.download?.queued) ||
        (next.source.kind === "steam-install" &&
          next.source.download.status === "paused");
      return t(paused ? "paused_item" : "queued_item", { title: next.title });
    }

    return t("no_downloads_in_progress");
  }, [
    bar,
    t,
    commonRedistStatus,
    extraction,
    lastPacket,
    progress,
    eta,
    downloadSpeed,
  ]);

  const showBar = bar.external || bar.primary !== null;

  return (
    <footer className="bottom-panel">
      <div className="bottom-panel__left">
        {hasActiveSubscription && (
          <button
            type="button"
            className="bottom-panel__help-button"
            data-open-support-chat
          >
            <svg
              width="0"
              height="0"
              aria-hidden="true"
              className="bottom-panel__gradient-defs"
            >
              <defs>
                <linearGradient
                  id="hydra-cloud-gradient"
                  x1="0%"
                  y1="100%"
                  x2="100%"
                  y2="0%"
                >
                  <stop
                    offset="0%"
                    stopColor={HYDRA_CLOUD_GRADIENT_START_COLOR}
                  />
                  <stop
                    offset="100%"
                    stopColor={HYDRA_CLOUD_GRADIENT_END_COLOR}
                  />
                </linearGradient>
              </defs>
            </svg>
            <CommentDiscussionIcon
              size={14}
              className="bottom-panel__help-icon"
            />
            <small>{t("need_help", { ns: "sidebar" })}</small>
          </button>
        )}
      </div>

      <div
        className={`bottom-panel__center${
          !userDetails || !hasActiveSubscription
            ? " bottom-panel__center--start"
            : ""
        }`}
      >
        <button
          type="button"
          className="bottom-panel__downloads-button"
          onClick={() => navigate("/downloads")}
        >
          <span className="bottom-panel__downloads-line">
            <small className="bottom-panel__downloads-text">{status}</small>
            {bar.moreCount > 0 && (
              <small className="bottom-panel__downloads-more">
                {t("more_count", { count: bar.moreCount })}
              </small>
            )}
            {bar.attentionCount > 0 && (
              <small className="bottom-panel__downloads-attention">
                {t("needs_you_count", { count: bar.attentionCount })}
              </small>
            )}
          </span>
          {showBar && (
            <ProgressBar
              label={status}
              size="thin"
              now={bar.primary?.progress ?? 0}
              max={1}
              indeterminate={bar.external || bar.primary?.progress == null}
              tone={
                extraction?.visibleId ===
                (bar.primary?.source.kind === "game-download"
                  ? bar.primary.source.game.id
                  : null)
                  ? "extraction"
                  : "default"
              }
            />
          )}
        </button>
      </div>

      <div className="bottom-panel__right">
        <button
          type="button"
          className="bottom-panel__version-button"
          title={t("release_notes")}
          onClick={() =>
            window.electron.openExternal(
              `https://github.com/hex110/hydra/releases/tag/v${version}`
            )
          }
        >
          <small>
            {sessionHash ? `${sessionHash} -` : ""} v{version}
          </small>
        </button>
      </div>
    </footer>
  );
}
