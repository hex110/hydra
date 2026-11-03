import {
  DEFAULT_TUNE_OPTIONS,
  migrateTuneSettings,
  TUNE_SETTINGS_VERSION,
  type NotInterestedGame,
  type TuneOptions,
  type TuneSettings,
} from "@shared";
import {
  catalogueNotInterestedSublevel,
  catalogueTasteSublevel,
} from "@main/level";
import {
  forgetImpressions,
  getRecommendations,
  recordImpressions,
} from "@main/services/recommender";
import { getStoreItems } from "@main/services/steam-store-items";
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
  const settings = migrateTuneSettings(stored);
  // Store the migrated shape once, so the idle tags are added only once.
  if (stored && stored.version !== settings.version) {
    await catalogueTasteSublevel.put(SETTINGS_KEY, settings).catch(() => {});
  }
  return settings;
});

registerEvent("setTuneSettings", async (_event, settings: TuneSettings) => {
  await catalogueTasteSublevel.put(SETTINGS_KEY, {
    options: { ...DEFAULT_TUNE_OPTIONS, ...settings.options },
    presets: (settings.presets ?? []).slice(0, MAX_PRESETS),
    browsePresets: (settings.browsePresets ?? []).slice(0, MAX_PRESETS),
    playedElsewhere: settings.playedElsewhere ?? {},
    version: TUNE_SETTINGS_VERSION,
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

/** The tags Steam gives games, most voted first, for the shelves that need to honour Avoid tags. */
registerEvent(
  "getStoreTagIds",
  async (_event, appIds: string[]): Promise<Record<string, number[]>> => {
    const items = await getStoreItems(
      Array.isArray(appIds) ? appIds.slice(0, 200) : []
    );

    const tags: Record<string, number[]> = {};
    for (const [appId, item] of items) {
      if (item) tags[appId] = item.tags.map((tag) => tag.tagid);
    }
    return tags;
  }
);

registerEvent("recordCatalogueImpressions", (_event, appIds: string[]) =>
  recordImpressions(Array.isArray(appIds) ? appIds.map(String) : [])
);

registerEvent("forgetCatalogueImpression", (_event, appId: string) =>
  forgetImpressions(String(appId))
);
