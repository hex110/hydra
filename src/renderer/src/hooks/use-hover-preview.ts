import { useEffect, useRef, useState } from "react";

const PREVIEW_DELAY_MS = 400;
const PREVIEW_INTERVAL_MS = 1400;

/** Cycles through screenshots while the pointer rests on a store game. */
export function useHoverPreview(screenshots: string[]) {
  const [hovered, setHovered] = useState(false);
  const [index, setIndex] = useState(-1);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!hovered || screenshots.length === 0) {
      setIndex(-1);
      return;
    }

    timer.current = window.setTimeout(() => {
      setIndex(0);
      timer.current = window.setInterval(
        () => setIndex((current) => (current + 1) % screenshots.length),
        PREVIEW_INTERVAL_MS
      );
    }, PREVIEW_DELAY_MS);

    return () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        window.clearInterval(timer.current);
      }
    };
  }, [hovered, screenshots.length]);

  return {
    previewUrl: index >= 0 ? screenshots[index] : null,
    hoverProps: {
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
    },
  };
}
