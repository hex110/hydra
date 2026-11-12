import { lazy, Suspense, useContext, useEffect, useState } from "react";
import type { HowLongToBeatCategory, ProtonDBData } from "@types";
import { useTranslation } from "react-i18next";
import { Link } from "@renderer/components/link/link";

import { gameDetailsContext } from "@renderer/context";
import { useAppSelector, useSteamTags } from "@renderer/hooks";
import { HowLongToBeatSection } from "./how-long-to-beat-section";
import { LaunchboxDetailsSection } from "./launchbox-details-section";
import { GenresSection } from "./genres-section";
import { LinksSection } from "./links-section";
import { ReceptionSection } from "./reception-section";
import { ModsSection } from "./mods-section";
import { YourGameSection } from "../your-game/your-game-section";
import { getGenreNames, getOfficialStoreMembers } from "@shared";
import { SidebarSection } from "@renderer/components/sidebar-section/sidebar-section";
import { buildGameAchievementPath } from "@renderer/helpers";
import { RetroAchievementsConnectBanner } from "@renderer/components/retro-achievements-connect-banner/retro-achievements-connect-banner";
import "./sidebar.scss";
import { ControllerSupportSection } from "./controller-support-section";

const ProtonDBSection = lazy(async () => {
  const mod = await import("./protondb-section");
  return { default: mod.ProtonDBSection };
});

const protonDBResponseCache = new Map<string, ProtonDBData | null>();
const protonDBInFlightRequests = new Map<
  string,
  Promise<ProtonDBData | null>
>();

const getProtonDBData = (shop: string, objectId: string) => {
  const cacheKey = `${shop}:${objectId}`;

  if (protonDBResponseCache.has(cacheKey)) {
    return Promise.resolve(protonDBResponseCache.get(cacheKey) ?? null);
  }

  const inFlightRequest = protonDBInFlightRequests.get(cacheKey);
  if (inFlightRequest) {
    return inFlightRequest;
  }

  const request = window.electron.hydraApi
    .get<ProtonDBData | null>(`/games/${shop}/${objectId}/protondb`, {
      needsAuth: false,
    })
    .then((protonData) => {
      protonDBResponseCache.set(cacheKey, protonData);
      return protonData;
    })
    .catch(() => null)
    .finally(() => {
      protonDBInFlightRequests.delete(cacheKey);
    });

  protonDBInFlightRequests.set(cacheKey, request);
  return request;
};

export function Sidebar() {
  const shouldShowProtonFeatures = window.electron.platform === "linux";
  const [howLongToBeat, setHowLongToBeat] = useState<{
    isLoading: boolean;
    data: HowLongToBeatCategory[] | null;
  }>({ isLoading: true, data: null });
  const [protonDB, setProtonDB] = useState<{
    isLoading: boolean;
    data: ProtonDBData | null;
  }>({ isLoading: shouldShowProtonFeatures, data: null });

  const {
    gameTitle,
    shopDetails,
    objectId,
    shop,
    catalogueGame,
    achievements,
    game,
    presentation,
  } = useContext(gameDetailsContext);
  const steamAppId =
    getOfficialStoreMembers(presentation?.members ?? (game ? [game] : [])).steam
      ?.objectId ??
    (catalogueGame.shop === "steam" ? catalogueGame.objectId : null);
  const steamTags = useSteamTags(catalogueGame.shop, catalogueGame.objectId);
  const storeGenres = getGenreNames(shopDetails?.genres);
  // The user's own genres win; without Steam tags the store's genres show.
  const customGenres = game?.customGenres?.length ? game.customGenres : null;
  const genres = customGenres ?? (steamTags.length > 0 ? [] : storeGenres);
  const tags = customGenres ? [] : steamTags;
  const userPreferences = useAppSelector(
    (state) => state.userPreferences.value
  );

  const { t } = useTranslation("game_details");
  const achievementsCount = achievements?.length ?? 0;
  const shouldRenderAchievementsSection =
    achievementsCount > 0 ||
    (shop === "launchbox" &&
      !!shopDetails?.retroAchievementsGameId &&
      !userPreferences?.retroAchievementsWebApiKey);

  useEffect(() => {
    if (objectId) {
      setHowLongToBeat({ isLoading: true, data: null });

      window.electron
        .getHowLongToBeat(catalogueGame.shop, catalogueGame.objectId, gameTitle)
        .then((howLongToBeatData) => {
          setHowLongToBeat({
            isLoading: false,
            data: Array.isArray(howLongToBeatData) ? howLongToBeatData : null,
          });
        })
        .catch(() => {
          setHowLongToBeat({ isLoading: false, data: null });
        });
    }
  }, [objectId, catalogueGame.shop, catalogueGame.objectId, gameTitle]);

  useEffect(() => {
    if (!shouldShowProtonFeatures || !objectId) {
      setProtonDB({ isLoading: false, data: null });
      return;
    }

    setProtonDB({ isLoading: true, data: null });

    getProtonDBData(catalogueGame.shop, catalogueGame.objectId)
      .then((protonData) => {
        setProtonDB({ isLoading: false, data: protonData });
      })
      .catch(() => {
        setProtonDB({ isLoading: false, data: null });
      });
  }, [
    shouldShowProtonFeatures,
    objectId,
    catalogueGame.shop,
    catalogueGame.objectId,
  ]);

  return (
    <aside className="content-sidebar">
      <YourGameSection />

      {shouldShowProtonFeatures && (
        <Suspense fallback={null}>
          <ProtonDBSection
            protonDBData={protonDB.data}
            isLoading={protonDB.isLoading}
            objectId={catalogueGame.objectId}
          />
        </Suspense>
      )}

      {shouldRenderAchievementsSection && (
        <SidebarSection
          variant="flat"
          title={
            achievementsCount > 0
              ? t("achievements_count", {
                  unlockedCount:
                    achievements?.filter((a) => a.unlocked).length ?? 0,
                  achievementsCount,
                })
              : t("achievements")
          }
        >
          <ul className="list">
            <RetroAchievementsConnectBanner />

            {(achievements ?? []).slice(0, 4).map((achievement) => (
              <li key={achievement.displayName}>
                <Link
                  to={buildGameAchievementPath({
                    shop: shop,
                    objectId: objectId!,
                    title: gameTitle,
                  })}
                  className="list__item"
                  title={achievement.description}
                >
                  <img
                    className={`list__item-image ${
                      achievement.unlocked ? "" : "list__item-image--locked"
                    }`}
                    src={achievement.icon}
                    alt={achievement.displayName}
                  />
                  <div className="list__item-text">
                    <p>{achievement.displayName}</p>
                    {achievement.description && (
                      <small className="list__item-description">
                        {achievement.description}
                      </small>
                    )}
                  </div>
                </Link>
              </li>
            ))}

            {achievementsCount > 0 && (
              <Link
                className="list__more"
                to={buildGameAchievementPath({
                  shop: shop,
                  objectId: objectId!,
                  title: gameTitle,
                })}
              >
                {t("see_all_achievements")}
              </Link>
            )}
          </ul>
        </SidebarSection>
      )}

      <ModsSection />

      <ReceptionSection steamAppId={steamAppId} />

      {shop === "launchbox" && (
        <LaunchboxDetailsSection
          platform={shopDetails?.platform}
          genres={genres}
          skus={shopDetails?.skus}
        />
      )}

      {shop !== "launchbox" && <GenresSection genres={genres} tags={tags} />}

      <HowLongToBeatSection
        howLongToBeatData={howLongToBeat.data}
        isLoading={howLongToBeat.isLoading}
        gameTitle={gameTitle}
      />

      <ControllerSupportSection />

      <LinksSection title={gameTitle} steamAppId={steamAppId} />
    </aside>
  );
}
