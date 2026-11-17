import { average } from "color.js";
import { addMilliseconds } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import {
  ClockIcon,
  ColumnsIcon,
  DownloadIcon,
  GraphIcon,
  PlayIcon,
  XCircleIcon,
} from "@primer/octicons-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { Badge, Button, GuideLink, ProgressBar } from "@renderer/components";
import {
  DOWNLOADER_NAME,
  MAX_DOWNLOAD_SPEED_HISTORY,
} from "@renderer/constants";
import {
  buildGameDetailsPath,
  formatDownloadProgress,
} from "@renderer/helpers";
import { logger } from "@renderer/logger";
import { useAppSelector, useDate, useDownload } from "@renderer/hooks";
import { Downloader, formatBytes, formatBytesToMbps } from "@shared";
import type { GameShop, LibraryGame } from "@types";

import "./download-hero.scss";

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  const r = Number.parseInt(h.substring(0, 2), 16) || 0;
  const g = Number.parseInt(h.substring(2, 4), 16) || 0;
  const b = Number.parseInt(h.substring(4, 6), 16) || 0;
  return [r, g, b];
}

function isTooCloseRGB(a: string, b: string, threshold: number): boolean {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const distance = Math.sqrt(
    Math.pow(r1 - r2, 2) + Math.pow(g1 - g2, 2) + Math.pow(b1 - b2, 2)
  );
  return distance < threshold;
}

const CHART_BACKGROUND_COLOR = "#1a1a1a";
const COLOR_DISTANCE_THRESHOLD = 28;
const FALLBACK_CHART_COLOR = "#fff";

function pickChartColor(dominant?: string): string {
  if (!dominant || typeof dominant !== "string" || !dominant.startsWith("#")) {
    return FALLBACK_CHART_COLOR;
  }

  if (
    isTooCloseRGB(dominant, CHART_BACKGROUND_COLOR, COLOR_DISTANCE_THRESHOLD)
  ) {
    return FALLBACK_CHART_COLOR;
  }

  return dominant;
}

interface AnimatedPercentageProps {
  value: number;
}

function AnimatedPercentage({ value }: Readonly<AnimatedPercentageProps>) {
  const percentageText = formatDownloadProgress(value);
  const prevTextRef = useRef<string>(percentageText);
  const chars = percentageText.split("");
  const prevChars = prevTextRef.current.split("");

  useEffect(() => {
    prevTextRef.current = percentageText;
  }, [percentageText]);

  return (
    <>
      {chars.map((char, index) => {
        const prevChar = prevChars[index];
        const charChanged = prevChar !== char;

        return (
          <AnimatePresence key={`${index}`} mode="wait" initial={false}>
            <motion.span
              key={`${char}-${value}-${index}`}
              initial={
                charChanged ? { y: 10, opacity: 0 } : { y: 0, opacity: 1 }
              }
              animate={{ y: 0, opacity: 1 }}
              exit={charChanged ? { y: -10, opacity: 0 } : undefined}
              transition={{ duration: 0.3, ease: "easeOut" }}
              style={{ display: "inline-block" }}
            >
              {char}
            </motion.span>
          </AnimatePresence>
        );
      })}
    </>
  );
}

interface SpeedChartProps {
  speeds: number[];
  peakSpeed: number;
  color?: string;
}

function SpeedChart({
  speeds,
  peakSpeed,
  color = "rgba(255, 255, 255, 1)",
}: Readonly<SpeedChartProps>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let resizeObserver: ResizeObserver | null = null;

    const draw = () => {
      const clientWidth = canvas.clientWidth;
      const clientHeight = canvas.clientHeight;
      if (clientWidth <= 0 || clientHeight <= 0) {
        animationFrameId = requestAnimationFrame(draw);
        return;
      }

      const dpr = window.devicePixelRatio || 1;

      canvas.width = clientWidth * dpr;
      canvas.height = clientHeight * dpr;
      ctx.scale(dpr, dpr);

      const width = clientWidth;
      const height = clientHeight;
      const barWidth = 4;
      const minBarGap = 10;
      const totalBars = Math.max(
        1,
        Math.min(
          MAX_DOWNLOAD_SPEED_HISTORY,
          Math.floor((width + minBarGap) / (barWidth + minBarGap))
        )
      );
      const barSpacing =
        totalBars > 1 ? (width - barWidth) / (totalBars - 1) : 0;
      const maxHeight = peakSpeed || Math.max(...speeds, 1);

      ctx.clearRect(0, 0, width, height);

      let r = 255,
        g = 255,
        b = 255;
      if (color.startsWith("#")) {
        let hex = color.replace("#", "");
        if (hex.length === 3) {
          hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        }
        r = Number.parseInt(hex.substring(0, 2), 16) || 255;
        g = Number.parseInt(hex.substring(2, 4), 16) || 255;
        b = Number.parseInt(hex.substring(4, 6), 16) || 255;
      } else if (color.startsWith("rgb")) {
        const matches = color.match(/\d+/g);
        if (matches && matches.length >= 3) {
          r = Number.parseInt(matches[0]) || 255;
          g = Number.parseInt(matches[1]) || 255;
          b = Number.parseInt(matches[2]) || 255;
        }
      }
      const displaySpeeds = speeds.slice(-totalBars);

      for (let i = 0; i < totalBars; i++) {
        const x = i * barSpacing;
        ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
        ctx.beginPath();
        ctx.roundRect(x, 0, barWidth, height, 3);
        ctx.fill();

        if (i < displaySpeeds.length) {
          const speed = displaySpeeds[i] || 0;
          const filledHeight = (speed / maxHeight) * height;

          if (filledHeight > 0) {
            const gradient = ctx.createLinearGradient(
              0,
              height - filledHeight,
              0,
              height
            );

            gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 1)`);
            gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.7)`);

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.roundRect(x, height - filledHeight, barWidth, filledHeight, 3);
            ctx.fill();
          }
        }
      }
      animationFrameId = requestAnimationFrame(draw);
    };

    animationFrameId = requestAnimationFrame(draw);
    resizeObserver = new ResizeObserver(() => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      draw();
    });
    resizeObserver.observe(canvas);

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [speeds, peakSpeed, color]);

  return (
    <canvas ref={canvasRef} className="download-hero__speed-chart-canvas" />
  );
}

interface HeroDownloadViewProps {
  game: LibraryGame;
  isGameDownloading: boolean;
  isGameExtracting?: boolean;
  downloadSpeed: number;
  finalDownloadSize: string;
  peakSpeed: number;
  currentProgress: number;
  dominantColor: string;
  lastPacket: ReturnType<typeof useDownload>["lastPacket"];
  speedHistory: number[];
  formatSpeed: (speed: number) => string;
  calculateETA: () => string | null;
  pauseDownload: (shop: GameShop, objectId: string) => void;
  resumeDownload: (shop: GameShop, objectId: string) => void;
  onCancelClick: (shop: GameShop, objectId: string) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}

interface HeroDownloadTimeProps {
  game: LibraryGame;
  isGameDownloading: boolean;
  lastPacket: ReturnType<typeof useDownload>["lastPacket"];
  etaText: string | null;
  t: (key: string, options?: Record<string, unknown>) => string;
}

function HeroDownloadTime({
  game,
  isGameDownloading,
  lastPacket,
  etaText,
  t,
}: Readonly<HeroDownloadTimeProps>) {
  const { t: tGameDetails } = useTranslation("game_details");

  if (
    !isGameDownloading ||
    lastPacket?.isRecovering ||
    lastPacket?.isMovingFile
  ) {
    return <span className="download-hero__progress-time" />;
  }

  const hasEta = !!etaText && etaText.trim() !== "" && etaText !== "0";
  const isDownloadingMetadata =
    !hasEta &&
    !!lastPacket?.isDownloadingMetadata &&
    game.download?.downloader === Downloader.Torrent;

  let label: ReactNode = tGameDetails("calculating_eta");
  const epicPhase =
    lastPacket?.gameId === game.id
      ? (lastPacket.download.epic?.phase ?? game.download?.epic?.phase)
      : game.download?.epic?.phase;

  if (
    game.download?.downloader === Downloader.Epic &&
    (epicPhase === "finalizing" || epicPhase === "prerequisites")
  ) {
    label = tGameDetails("epic_finalizing_install");
  } else if (isDownloadingMetadata) {
    label = (
      <GuideLink article="downloading-metadata">
        {t("downloading_metadata")}
      </GuideLink>
    );
  } else if (hasEta) {
    label = etaText;
  }

  return (
    <span className="download-hero__progress-time">
      <ClockIcon size={14} />
      {label}
    </span>
  );
}

export function HeroDownloadView({
  game,
  isGameDownloading,
  isGameExtracting = false,
  downloadSpeed,
  finalDownloadSize,
  peakSpeed,
  currentProgress,
  dominantColor,
  lastPacket,
  speedHistory,
  formatSpeed,
  calculateETA,
  pauseDownload,
  resumeDownload,
  onCancelClick,
  t,
}: Readonly<HeroDownloadViewProps>) {
  const navigate = useNavigate();

  const handleLogoClick = useCallback(() => {
    navigate(buildGameDetailsPath(game));
  }, [navigate, game]);

  const isMovingFile = !isGameExtracting && !!lastPacket?.isMovingFile;
  const movePercent = Math.round((lastPacket?.moveProgress ?? 0) * 100);
  const isRecovering =
    !isGameExtracting && !isMovingFile && !!lastPacket?.isRecovering;
  const recoveryPercent = Math.round((lastPacket?.recoveryProgress ?? 0) * 100);
  const isReconnecting =
    !isGameExtracting && !isRecovering && !!lastPacket?.isReconnecting;

  return (
    <div className="download-hero download-hero--hero">
      <div className="download-hero__hero-background">
        <img
          src={
            game.customHeroImageUrl ||
            game.libraryHeroImageUrl ||
            game.libraryImageUrl ||
            ""
          }
          alt={game.title}
        />
        <div className="download-hero__hero-overlay" />
      </div>

      <div className="download-hero__hero-content">
        <div className="download-hero__hero-action-row">
          <div className="download-hero__hero-logo">
            {game.customLogoImageUrl || game.logoImageUrl ? (
              <button
                type="button"
                onClick={handleLogoClick}
                className="download-hero__hero-logo-button"
              >
                <img
                  src={game.customLogoImageUrl || game.logoImageUrl || ""}
                  alt={game.title}
                />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleLogoClick}
                className="download-hero__hero-logo-button"
              >
                <h1>{game.title}</h1>
              </button>
            )}
          </div>
        </div>

        <div className="download-hero__hero-progress">
          <div className="download-hero__progress-row download-hero__progress-row--bar">
            <div className="download-hero__progress-wrapper">
              <div className="download-hero__progress-info-row">
                {isGameExtracting && (
                  <span className="download-hero__progress-status">
                    {t("extracting")}
                  </span>
                )}
                {!isGameExtracting && lastPacket?.isCheckingFiles && (
                  <span className="download-hero__progress-status">
                    {t("checking_files")}
                  </span>
                )}
                {isMovingFile && (
                  <span className="download-hero__progress-status">
                    {t("moving_file", { percentage: `${movePercent}%` })}
                  </span>
                )}
                {isRecovering && !lastPacket?.isCheckingFiles && (
                  <span className="download-hero__progress-status">
                    {t("recovering", { percentage: `${recoveryPercent}%` })}
                  </span>
                )}
                {isReconnecting && !lastPacket?.isCheckingFiles && (
                  <span className="download-hero__progress-status">
                    {t("reconnecting")}
                  </span>
                )}
                {!isGameExtracting &&
                  !lastPacket?.isCheckingFiles &&
                  !isReconnecting &&
                  !isRecovering &&
                  !isMovingFile && (
                    <span className="download-hero__progress-size">
                      <DownloadIcon size={14} />
                      {isGameDownloading && lastPacket
                        ? `${formatBytes(lastPacket.download.bytesDownloaded)} / ${finalDownloadSize}`
                        : `${formatBytes(game.download?.bytesDownloaded ?? 0)} / ${finalDownloadSize}`}
                    </span>
                  )}
                <span></span>
              </div>
              <div className="download-hero__progress-info-row">
                {!lastPacket?.isCheckingFiles && !isGameExtracting && (
                  <HeroDownloadTime
                    game={game}
                    isGameDownloading={isGameDownloading}
                    lastPacket={lastPacket}
                    etaText={calculateETA()}
                    t={t}
                  />
                )}
                <span className="download-hero__progress-percentage">
                  <AnimatedPercentage value={currentProgress} />
                </span>
              </div>
              <ProgressBar
                label={game.title}
                now={currentProgress}
                max={1}
                size="large"
                tone={isGameExtracting ? "extraction" : "default"}
              />
            </div>
            {!isGameExtracting && (
              <div className="download-hero__hero-buttons">
                {isGameDownloading ? (
                  <Button
                    theme="outline"
                    onClick={() => pauseDownload(game.shop, game.objectId)}
                    className="download-hero__glass-btn"
                  >
                    <ColumnsIcon size={14} />
                    {t("pause")}
                  </Button>
                ) : (
                  <Button
                    theme="outline"
                    onClick={() => resumeDownload(game.shop, game.objectId)}
                    className="download-hero__glass-btn"
                  >
                    <PlayIcon size={14} />
                    {t("resume")}
                  </Button>
                )}
                <Button
                  theme="outline"
                  onClick={() => onCancelClick(game.shop, game.objectId)}
                  className="download-hero__glass-btn"
                >
                  <XCircleIcon size={14} />
                  {t("cancel")}
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="download-hero__hero-stats">
          <div className="download-hero__stats-column">
            <div className="download-hero__stat-item">
              <span style={{ color: dominantColor, display: "flex" }}>
                <DownloadIcon size={16} />
              </span>
              <div className="download-hero__stat-content">
                <span className="download-hero__stat-label">
                  {t("network")}:
                </span>
                <span className="download-hero__stat-value">
                  {isGameDownloading ? formatSpeed(downloadSpeed) : "0 B/s"}
                </span>
              </div>
            </div>

            <div className="download-hero__stat-item">
              <span style={{ color: dominantColor, display: "flex" }}>
                <GraphIcon size={16} />
              </span>
              <div className="download-hero__stat-content">
                <span className="download-hero__stat-label">{t("peak")}:</span>
                <span className="download-hero__stat-value">
                  {peakSpeed > 0 ? formatSpeed(peakSpeed) : "0 B/s"}
                </span>
              </div>
            </div>

            {game.download?.downloader === Downloader.Torrent &&
              isGameDownloading &&
              lastPacket &&
              (lastPacket.numSeeds > 0 || lastPacket.numPeers > 0) && (
                <div className="download-hero__stat-item">
                  <div className="download-hero__stat-content">
                    <span className="download-hero__stat-label">
                      Seeds:{" "}
                      <span className="download-hero__stat-value">
                        {lastPacket.numSeeds}
                      </span>
                      , Peers:{" "}
                      <span className="download-hero__stat-value">
                        {lastPacket.numPeers}
                      </span>
                    </span>
                  </div>
                </div>
              )}

            {game.download?.downloader !== undefined && (
              <div className="download-hero__stat-item">
                <div className="download-hero__stat-content">
                  <Badge>
                    {DOWNLOADER_NAME[Number(game.download.downloader)]}
                  </Badge>
                </div>
              </div>
            )}
          </div>

          <div className="download-hero__speed-chart">
            <SpeedChart
              speeds={speedHistory}
              peakSpeed={peakSpeed}
              color={dominantColor}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

interface DownloadHeroProps {
  game: LibraryGame;
  isGameDownloading: boolean;
  isExtractingNow: boolean;
  onPause: (shop: GameShop, objectId: string) => void;
  onResume: (shop: GameShop, objectId: string) => void;
  onCancel: (shop: GameShop, objectId: string) => void;
}

/** The active game download as the large card with the speed chart. */
export function DownloadHero({
  game,
  isGameDownloading: isDownloadingNow,
  isExtractingNow,
  onPause,
  onResume,
  onCancel,
}: Readonly<DownloadHeroProps>) {
  const { t } = useTranslation("downloads");
  const { formatDistance } = useDate();
  const { lastPacket } = useDownload();
  const extraction = useAppSelector((state) => state.download.extraction);
  const showInMegabytes = useAppSelector(
    (state) => state.userPreferences.value?.showDownloadSpeedInMegabytes
  );
  const speedHistory = useAppSelector((state) => state.download.speedHistory);
  const peakSpeeds = useAppSelector((state) => state.download.peakSpeeds);
  const [dominantColors, setDominantColors] = useState<Record<string, string>>(
    {}
  );

  const heroImageUrl =
    game.customHeroImageUrl ||
    game.libraryHeroImageUrl ||
    game.libraryImageUrl ||
    "";

  useEffect(() => {
    if (!heroImageUrl || !game.id) return;

    let cancelled = false;
    average(heroImageUrl, { amount: 1, format: "hex" })
      .then((color) => {
        if (cancelled) return;
        const value = typeof color === "string" ? color : color.toString();
        setDominantColors((previous) => ({ ...previous, [game.id]: value }));
      })
      .catch((error) =>
        logger.error("Failed to extract dominant color:", error)
      );

    return () => {
      cancelled = true;
    };
  }, [game.id, heroImageUrl]);

  const isGameDownloading = isDownloadingNow && !isExtractingNow;
  const downloadSpeed = isGameDownloading
    ? (lastPacket?.downloadSpeed ?? 0)
    : 0;

  const packetSize = lastPacket?.download.fileSize;
  let finalDownloadSize = "N/A";
  if (isGameDownloading && packetSize && packetSize > 0) {
    finalDownloadSize = formatBytes(packetSize);
  } else if (game.download?.fileSize && game.download.fileSize > 0) {
    finalDownloadSize = formatBytes(game.download.fileSize);
  }

  // The history is stored under the packet's game id, if there is one.
  const dataKey = lastPacket?.gameId ?? game.id;
  const storedPeak = peakSpeeds[dataKey];
  const peakSpeed =
    storedPeak !== undefined && storedPeak > 0 ? storedPeak : downloadSpeed;

  let currentProgress = game.download?.progress || 0;
  if (isExtractingNow && extraction) {
    currentProgress = extraction.progress;
  } else if (isGameDownloading && lastPacket) {
    currentProgress = lastPacket.progress;
  }

  const formatSpeed = (speed: number) =>
    showInMegabytes ? `${formatBytes(speed)}/s` : formatBytesToMbps(speed);

  const calculateETA = () => {
    if (
      !lastPacket ||
      lastPacket.timeRemaining <= 0 ||
      !Number.isFinite(lastPacket.timeRemaining)
    ) {
      return null;
    }

    return formatDistance(
      addMilliseconds(new Date(), lastPacket.timeRemaining),
      new Date(),
      { addSuffix: true }
    );
  };

  return (
    <HeroDownloadView
      game={game}
      isGameDownloading={isGameDownloading}
      isGameExtracting={isExtractingNow}
      downloadSpeed={downloadSpeed}
      finalDownloadSize={finalDownloadSize}
      peakSpeed={peakSpeed}
      currentProgress={currentProgress}
      dominantColor={pickChartColor(dominantColors[game.id])}
      lastPacket={lastPacket}
      speedHistory={speedHistory[dataKey] ?? []}
      formatSpeed={formatSpeed}
      calculateETA={calculateETA}
      pauseDownload={onPause}
      resumeDownload={onResume}
      onCancelClick={onCancel}
      t={t}
    />
  );
}
