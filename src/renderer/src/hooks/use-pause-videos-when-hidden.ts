import { useEffect } from "react";

/**
 * Pauses playing videos while the window is hidden and resumes them after.
 * Chromium stops decoding muted videos in a hidden window but keeps their
 * clock running, so on return they visibly fast-forward to catch up.
 */
export function usePauseVideosWhenHidden() {
  useEffect(() => {
    const pausedVideos = new Set<HTMLVideoElement>();

    const onVisibilityChange = () => {
      if (document.hidden) {
        for (const video of document.querySelectorAll("video")) {
          if (!video.paused && !video.ended) {
            video.pause();
            pausedVideos.add(video);
          }
        }
        return;
      }

      for (const video of pausedVideos) {
        if (video.isConnected) video.play().catch(() => {});
      }
      pausedVideos.clear();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);
}
