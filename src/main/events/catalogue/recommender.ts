import {
  DEFAULT_TUNE_OPTIONS,
  DEFAULT_TUNE_SETTINGS,
  type NotInterestedGame,
  type TuneOptions,
  type TuneSettings,
} from "@shared";
import {
  catalogueNotInterestedSublevel,
  catalogueTasteSublevel,
} from "@main/level";
import { getRecommendations } from "@main/services/recommender";
import { registerEvent } from "../register-event";

const SETTINGS_KEY = "settings";
const MAX_PRESETS = 20;

registerEvent("getRecommendations", (_event, options: Partial<TuneOptions>) =>
  getRecommendations(options ?? {})
);

registerEvent("getTuneSettings", async (): Promise<TuneSettings> => {
  const stored = await catalogueTasteSublevel
    .get(SETTINGS_KEY)
    .catch(() => undefined);

  return {
    options: { ...DEFAULT_TUNE_OPTIONS, ...stored?.options },
    presets: stored?.presets ?? DEFAULT_TUNE_SETTINGS.presets,
  };
});

registerEvent("setTuneSettings", async (_event, settings: TuneSettings) => {
  await catalogueTasteSublevel.put(SETTINGS_KEY, {
    options: { ...DEFAULT_TUNE_OPTIONS, ...settings.options },
    presets: (settings.presets ?? []).slice(0, MAX_PRESETS),
  });
});

registerEvent("getNotInterested", async (): Promise<NotInterestedGame[]> => {
  const entries = await catalogueNotInterestedSublevel
    .iterator()
    .all()
    .catch(() => []);

  return entries
    .map(([key, value]) => {
      const [shop, ...rest] = key.split(":");
      return { shop, objectId: rest.join(":"), ...value };
    })
    .sort((a, b) => b.at - a.at);
});

registerEvent(
  "setNotInterested",
  async (
    _event,
    game: { shop: string; objectId: string; title: string },
    notInterested: boolean
  ) => {
    const key = `${game.shop}:${game.objectId}`;
    if (notInterested) {
      await catalogueNotInterestedSublevel.put(key, {
        at: Date.now(),
        title: game.title,
      });
    } else {
      await catalogueNotInterestedSublevel.del(key);
    }
  }
);
