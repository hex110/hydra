import { useEffect, useState } from "react";

const PREVIEW_DELAY_MS = 400;
const PREVIEW_INTERVAL_MS = 1400;

/**
 * While the pointer rests on a store game: preloads its screenshots and
 * cycles through the ones that have loaded, and says when the hover card
 * may open. Only loaded screenshots are shown, so the cover never reappears
 * between two of them.
 */
export function useHoverPreview(screenshots: string[]) {
  const [hovered, setHovered] = useState(false);
  const [settled, setSettled] = useState(false);
  const [loaded, setLoaded] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const shots = screenshots.join("|");

  useEffect(() => {
    if (!hovered) return;
    const timer = window.setTimeout(() => setSettled(true), PREVIEW_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
      setSettled(false);
      setLoaded([]);
      setIndex(0);
    };
  }, [hovered]);

  useEffect(() => {
    if (!settled) return;

    // A scrolled shelf moves the card from under the hover card.
    const close = () => setHovered(false);
    window.addEventListener("scroll", close, { capture: true, passive: true });
    return () => window.removeEventListener("scroll", close, true);
  }, [settled]);

  useEffect(() => {
    if (!settled) return;
    let current = true;

    for (const url of shots ? shots.split("|") : []) {
      const image = new Image();
      image.onload = () => {
        if (!current) return;
        const order = shots.split("|");
        setLoaded((previous) =>
          order.filter((item) => item === url || previous.includes(item))
        );
      };
      image.src = url;
    }

    return () => {
      current = false;
    };
  }, [settled, shots]);

  useEffect(() => {
    if (loaded.length < 2) return;
    const timer = window.setInterval(
      () => setIndex((value) => value + 1),
      PREVIEW_INTERVAL_MS
    );
    return () => window.clearInterval(timer);
  }, [loaded.length]);

  return {
    previewUrls: loaded,
    previewUrl: loaded.length > 0 ? loaded[index % loaded.length] : null,
    /** The pointer has rested long enough for the hover card. */
    cardOpen: settled,
    hoverProps: {
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
    },
  };
}
