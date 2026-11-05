import { useEffect, useMemo, useState } from "react";
import { resolveSpecs } from "@shared";
import type { DetectedSpecs, ResolvedSpecs } from "@types";

import { logger } from "@renderer/logger";

import { useAppSelector } from "./redux";

let detectedRequest: Promise<DetectedSpecs | null> | null = null;

/** Detection reads the machine once per run; every caller shares the answer. */
const loadDetectedSpecs = () => {
  detectedRequest ??= window.electron.getSystemSpecs().catch((error) => {
    logger.error("Failed to read the system specs", error);
    return null;
  });
  return detectedRequest;
};

/** The PC's specs: what was detected with the user's corrections on top. */
export function useSystemSpecs(): {
  loading: boolean;
  detected: DetectedSpecs | null;
  specs: ResolvedSpecs;
} {
  const [detected, setDetected] = useState<DetectedSpecs | null>(null);
  const [loading, setLoading] = useState(true);
  const overrides = useAppSelector(
    (state) => state.userPreferences.value?.systemSpecs
  );

  useEffect(() => {
    let active = true;
    loadDetectedSpecs().then((value) => {
      if (!active) return;
      setDetected(value);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const specs = useMemo(
    () => resolveSpecs(detected, overrides),
    [detected, overrides]
  );
  return { loading, detected, specs };
}
