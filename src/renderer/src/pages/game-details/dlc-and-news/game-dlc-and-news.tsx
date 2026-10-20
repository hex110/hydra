import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Skeleton from "react-loading-skeleton";
import { LinkExternalIcon } from "@primer/octicons-react";
import { logger } from "@renderer/logger";
import { GameNewsCard } from "@renderer/pages/home/game-news-card";
import { useGameNews } from "@renderer/pages/home/use-game-news";
import "./game-dlc-and-news.scss";

const MAX_DLC = 24;
const NEWS_COUNT = 3;
const STEAM_STORE_URL = "https://store.steampowered.com/app";

interface Dlc {
  appId: string;
  name: string;
  imageUrl: string | null;
  price: string | null;
  isFree: boolean;
}

const dlcCache = new Map<string, Dlc[]>();

const DLC_CONCURRENCY = 4;

// Hydra's shop-details endpoint has nothing for DLC ids, so each one goes
// through the app's own Steam lookup, which is cached on disk.
const fetchDlc = async (appIds: string[], language: string) => {
  const queue = [...appIds];
  const found = new Map<string, Dlc>();

  const worker = async () => {
    for (let appId = queue.shift(); appId; appId = queue.shift()) {
      const details = await window.electron
        .getGameShopDetails(appId, "steam", language)
        .catch(() => null);
      if (!details?.name) continue;
      found.set(appId, {
        appId,
        name: details.name,
        imageUrl: details.header_image ?? null,
        price: details.price_overview?.final_formatted || null,
        isFree: Boolean(details.is_free),
      });
    }
  };

  await Promise.all(Array.from({ length: DLC_CONCURRENCY }, worker));
  return appIds.flatMap((appId) => {
    const dlc = found.get(appId);
    return dlc ? [dlc] : [];
  });
};

function useSteamDlc(dlcIds: string[], language: string) {
  const key = `${language}:${dlcIds.join(",")}`;
  const [dlc, setDlc] = useState<Dlc[]>(() => dlcCache.get(key) ?? []);
  const [isLoading, setIsLoading] = useState(
    dlcIds.length > 0 && !dlcCache.has(key)
  );

  useEffect(() => {
    if (dlcIds.length === 0 || dlcCache.has(key)) {
      setDlc(dlcCache.get(key) ?? []);
      setIsLoading(false);
      return;
    }

    let current = true;
    setIsLoading(true);
    fetchDlc(dlcIds, language)
      .then((items) => {
        dlcCache.set(key, items);
        if (current) setDlc(items);
      })
      .catch((error) => logger.error("Failed to load DLC", error))
      .finally(() => {
        if (current) setIsLoading(false);
      });

    return () => {
      current = false;
    };
    // The ids and language are identified by key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { dlc, isLoading };
}

interface GameDlcAndNewsProps {
  steamAppId: string;
  dlcIds: number[];
  /** Shown on news posts without a picture. */
  fallbackImageUrl?: string | null;
}

/** The game's DLC and its latest Steam announcements. */
export function GameDlcAndNews({
  steamAppId,
  dlcIds,
  fallbackImageUrl,
}: Readonly<GameDlcAndNewsProps>) {
  const { t, i18n } = useTranslation("game_details");
  const { dlc, isLoading: isLoadingDlc } = useSteamDlc(
    dlcIds.slice(0, MAX_DLC).map(String),
    i18n.language
  );
  const { news, isLoading: isLoadingNews } = useGameNews(
    [steamAppId],
    NEWS_COUNT
  );

  return (
    <>
      {(isLoadingDlc || dlc.length > 0) && (
        <section className="game-dlc-and-news">
          <h2 className="game-dlc-and-news__title">
            {t("dlc_title", { count: dlcIds.length })}
          </h2>
          <div className="game-dlc-and-news__dlc">
            {isLoadingDlc
              ? Array.from({ length: Math.min(dlcIds.length, 4) }).map(
                  (_, index) => (
                    <Skeleton
                      key={index}
                      className="game-dlc-and-news__dlc-skeleton"
                    />
                  )
                )
              : dlc.map((item) => (
                  <button
                    key={item.appId}
                    type="button"
                    className="game-dlc-and-news__dlc-item"
                    title={t("dlc_open_store")}
                    onClick={() =>
                      void window.electron.openExternal(
                        `${STEAM_STORE_URL}/${item.appId}`
                      )
                    }
                  >
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt="" loading="lazy" />
                    ) : (
                      <span className="game-dlc-and-news__dlc-placeholder" />
                    )}
                    <span className="game-dlc-and-news__dlc-name">
                      {item.name}
                    </span>
                    <span className="game-dlc-and-news__dlc-price">
                      {item.isFree ? t("dlc_free") : (item.price ?? "")}
                      <LinkExternalIcon size={12} />
                    </span>
                  </button>
                ))}
          </div>
          {dlcIds.length > MAX_DLC && (
            <button
              type="button"
              className="game-dlc-and-news__more"
              onClick={() =>
                void window.electron.openExternal(
                  `https://store.steampowered.com/dlc/${steamAppId}`
                )
              }
            >
              {t("dlc_see_all", { count: dlcIds.length })}
            </button>
          )}
        </section>
      )}

      {(isLoadingNews || news.length > 0) && (
        <section className="game-dlc-and-news">
          <h2 className="game-dlc-and-news__title">{t("news_title")}</h2>
          <div className="game-dlc-and-news__news">
            {isLoadingNews
              ? Array.from({ length: NEWS_COUNT }).map((_, index) => (
                  <Skeleton
                    key={index}
                    className="game-dlc-and-news__news-skeleton"
                  />
                ))
              : news.map((item) => (
                  <GameNewsCard
                    key={item.id}
                    item={item}
                    fallbackImageUrl={fallbackImageUrl}
                  />
                ))}
          </div>
        </section>
      )}
    </>
  );
}
