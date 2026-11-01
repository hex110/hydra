import { withInGameNotices } from "../../shared/in-game-notices.js";

export interface NoticeBoardDeps {
  write: (filePath: string, content: string) => Promise<void>;
  now: () => number;
  setTimer: (callback: () => void, ms: number) => unknown;
  clearTimer: (timer: unknown) => void;
  noticeMs: number;
}

interface ActiveConfig {
  path: string;
  base: string;
  notices: { text: string; until: number }[];
  timer: unknown;
}

/**
 * Notices per running game: each is written into the game's MangoHud config
 * and taken out again once its time is up.
 */
export const createNoticeBoard = (deps: NoticeBoardDeps) => {
  const active = new Map<string, ActiveConfig>();

  const render = async (key: string) => {
    const config = active.get(key);
    if (!config) return;
    const now = deps.now();
    config.notices = config.notices.filter((notice) => notice.until > now);
    if (config.timer !== null) deps.clearTimer(config.timer);
    config.timer = null;
    const next = Math.min(...config.notices.map((notice) => notice.until));
    if (Number.isFinite(next)) {
      config.timer = deps.setTimer(() => void render(key), next - now + 50);
    }
    await deps.write(
      config.path,
      withInGameNotices(
        config.base,
        config.notices.map((notice) => notice.text)
      )
    );
  };

  return {
    register(key: string, path: string, base: string) {
      const previous = active.get(key);
      if (previous && previous.timer !== null) deps.clearTimer(previous.timer);
      active.set(key, { path, base, notices: [], timer: null });
    },
    async unregister(key: string) {
      const config = active.get(key);
      if (!config) return;
      active.delete(key);
      if (config.timer !== null) deps.clearTimer(config.timer);
      await deps.write(config.path, config.base);
    },
    isActive: (key: string) => active.has(key),
    show(key: string, lines: string[]) {
      const config = active.get(key);
      if (!config || lines.length === 0) return null;
      const until = deps.now() + deps.noticeMs;
      config.notices.push(...lines.map((text) => ({ text, until })));
      return render(key);
    },
  };
};
