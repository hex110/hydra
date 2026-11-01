import { useEffect, useState } from "react";

import { findFirstPlayDay } from "@shared";
import type { LibraryGame } from "@types";

/** Every day Hydra recorded play on. */
const ALL_TIME = "1970-01-01";

/**
 * When the game was started and finished: the dates the play status
 * recorded, else, for the start, the first day Hydra saw it played.
 */
export function usePlayDates(members: LibraryGame[]) {
  const [firstPlayDay, setFirstPlayDay] = useState<string | null>(null);
  const keys = members.map((member) => `${member.shop}:${member.objectId}`);
  const keyList = keys.join("|");

  useEffect(() => {
    let cancelled = false;
    window.electron
      .getPlayActivity(ALL_TIME)
      .then((entries) => {
        if (!cancelled)
          setFirstPlayDay(findFirstPlayDay(entries, keyList.split("|")));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [keyList]);

  const stamped = (field: "startedAt" | "finishedAt") =>
    members
      .map((member) => member[field])
      .filter((value): value is string => Boolean(value))
      .toSorted()[0] ?? null;

  // A play day is a local date; noon keeps it on that day in every zone.
  const firstPlayDate = firstPlayDay ? `${firstPlayDay}T12:00:00` : null;

  return {
    startedAt: stamped("startedAt") ?? firstPlayDate,
    finishedAt: members.some((member) => member.playStatus === "finished")
      ? stamped("finishedAt")
      : null,
  };
}
