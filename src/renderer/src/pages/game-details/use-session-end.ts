import { useEffect, useRef, useState } from "react";
import type { TFunction } from "i18next";
import { MAX_MINUTES_TO_SHOW_IN_PLAYTIME } from "@renderer/constants";

const SESSION_END_WINDOW_MS = 12_000;
const COUNT_UP_MS = 1_100;

interface SessionEnd {
  endedAt: number;
  playTimeBefore: number;
  deltaMs: number | null;
}

/** "42m" / "2.5h", or null when the session was under a minute. */
export const formatSessionLength = (ms: number, t: TFunction) => {
  const minutes = ms / 60000;
  if (minutes < 1) return null;

  return minutes < MAX_MINUTES_TO_SHOW_IN_PLAYTIME
    ? t("amount_minutes_short", {
        amount: Math.round(minutes),
        ns: "game_launcher",
      })
    : t("amount_hours_short", {
        amount: (minutes / 60).toFixed(1),
        ns: "game_launcher",
      });
};

/**
 * Notices a running game closing while its page is open, so the page can
 * celebrate it: `justEnded` stays true for a few seconds, `deltaMs` is the
 * playtime the session added once Hydra has recorded it, and
 * `displayPlayTimeMs` counts up from the old playtime to the new one.
 */
export function useSessionEnd(
  gameId: string | number | undefined,
  playTimeMs: number,
  isGameRunning: boolean
) {
  const [session, setSession] = useState<SessionEnd | null>(null);
  const [countedPlayTimeMs, setCountedPlayTimeMs] = useState<number | null>(
    null
  );

  const trackedGameId = useRef(gameId);
  const wasRunning = useRef(isGameRunning);
  const playTimeAtStart = useRef(playTimeMs);
  const latestPlayTime = useRef(playTimeMs);
  latestPlayTime.current = playTimeMs;

  useEffect(() => {
    if (trackedGameId.current !== gameId) {
      trackedGameId.current = gameId;
      wasRunning.current = isGameRunning;
      playTimeAtStart.current = latestPlayTime.current;
      setSession(null);
      setCountedPlayTimeMs(null);
      return;
    }

    if (isGameRunning && !wasRunning.current) {
      playTimeAtStart.current = latestPlayTime.current;
    }

    if (!isGameRunning && wasRunning.current) {
      setSession({
        endedAt: Date.now(),
        playTimeBefore: playTimeAtStart.current,
        deltaMs: null,
      });
    }

    wasRunning.current = isGameRunning;
  }, [gameId, isGameRunning]);

  useEffect(() => {
    if (!session || session.deltaMs !== null) return;
    if (playTimeMs <= session.playTimeBefore) return;

    setSession({ ...session, deltaMs: playTimeMs - session.playTimeBefore });
  }, [session, playTimeMs]);

  const endedAt = session?.endedAt;

  useEffect(() => {
    if (!endedAt) return;

    const timer = setTimeout(() => setSession(null), SESSION_END_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [endedAt]);

  const deltaMs = session?.deltaMs ?? null;
  const playTimeBefore = session?.playTimeBefore ?? 0;

  useEffect(() => {
    if (deltaMs === null) {
      setCountedPlayTimeMs(null);
      return;
    }

    const from = playTimeBefore;
    const to = latestPlayTime.current;
    const startedAt = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / COUNT_UP_MS);
      const eased = 1 - (1 - progress) ** 3;
      setCountedPlayTimeMs(progress < 1 ? from + (to - from) * eased : null);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [deltaMs, playTimeBefore, endedAt]);

  return {
    justEnded: session !== null,
    endedAt: endedAt ?? null,
    deltaMs,
    displayPlayTimeMs: countedPlayTimeMs ?? playTimeMs,
  };
}
