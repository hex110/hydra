import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeftIcon,
  ListUnorderedIcon,
  TableIcon,
} from "@primer/octicons-react";
import cn from "classnames";

import {
  Button,
  SegmentedControl,
  StoreGameCard,
  StoreGameCardSkeleton,
  StoreGameRow,
} from "@renderer/components";
import { Link } from "@renderer/components/link/link";
import { useFormat } from "@renderer/hooks";

import {
  catalogueKey,
  isOwnedLibraryState,
  type CatalogueLibraryState,
} from "./catalogue-library-state";
import {
  getGroupName,
  getRecommendationReason,
  toCardGame,
} from "./recommendation-card";
import { useRecordImpressions } from "./use-impressions";
import { useSuggestionFeedback } from "./use-suggestion-feedback";
import { TunePanel } from "./tune-panel";
import { useCatalogueRowDetails } from "./use-catalogue-row-details";
import { useCatalogueView } from "./use-catalogue-view";
import { useNotInterested } from "./use-not-interested";
import { useRecommendations } from "./use-recommendations";
import { useSteamTagLabels } from "./use-steam-tag-labels";
import { useTuneSettings } from "./use-tune-settings";
import "./catalogue-for-you.scss";

const PAGE_SIZE = 60;
const SKELETONS = 12;

interface CatalogueForYouProps {
  libraryStates: Map<string, CatalogueLibraryState>;
  onBack: () => void;
}

/** Suggestions made from the whole library, with the Tune panel beside them. */
export function CatalogueForYou({
  libraryStates,
  onBack,
}: Readonly<CatalogueForYouProps>) {
  const { t } = useTranslation("catalogue");
  const { formatNumber } = useFormat();
  const tagLabels = useSteamTagLabels();
  const { options, settings, isLoaded, reset } = useTuneSettings();
  const { response, isRefreshing, staleAt, retry } = useRecommendations(
    isLoaded ? options : null
  );
  const notInterested = useNotInterested();
  const [view, setView] = useCatalogueView();
  const [shown, setShown] = useState(PAGE_SIZE);

  // A new list starts at the top again.
  const optionsKey = JSON.stringify(options);
  useEffect(() => setShown(PAGE_SIZE), [optionsKey]);

  const results = useMemo(
    () =>
      (response?.results ?? []).filter((game) => {
        const key = catalogueKey({ shop: "steam", objectId: game.appId });
        return (
          !notInterested.keys.has(key) &&
          !isOwnedLibraryState(libraryStates.get(key)) &&
          !settings.playedElsewhere?.[game.appId]
        );
      }),
    [response, notInterested.keys, libraryStates, settings.playedElsewhere]
  );
  const visible = results.slice(0, shown);
  const facts = useCatalogueRowDetails(visible.map(toCardGame));
  useRecordImpressions(visible.slice(0, 24).map((game) => game.appId));
  const suggestion = useSuggestionFeedback(facts);

  const profile = response?.profile ?? null;
  const groups = profile?.groups ?? [];
  const shownGroup = groups.find((group) => group.id === response?.group);
  const describeGroup = (groupId: string) => {
    const group = groups.find((entry) => entry.id === groupId);
    return group
      ? t("fits_group", { name: getGroupName(group, tagLabels) })
      : undefined;
  };

  let scope: string | null = null;
  if (options.basedOn === "games") {
    scope = t("for_you_scope_games", { count: options.pickedGames.length });
  } else if (options.basedOn === "tags") {
    scope = options.seedTags
      .map((id) => tagLabels.get(id))
      .filter(Boolean)
      .join(", ");
  } else if (shownGroup) {
    scope = getGroupName(shownGroup, tagLabels);
  } else if (groups.length > 1) {
    scope = t("for_you_scope_mixed", { count: groups.length });
  }
  const leftOut = response?.leftOut;
  const isFirstLoad = !response && isRefreshing;

  let body;
  if (isFirstLoad) {
    body = Array.from({ length: SKELETONS }).map((_, index) => (
      <StoreGameCardSkeleton key={index} size="grid" />
    ));
  } else if (response?.failed && results.length === 0) {
    body = (
      <div className="catalogue-for-you__empty">
        <p>{t("for_you_failed")}</p>
        <Button theme="outline" onClick={retry}>
          {t("chart_retry")}
        </Button>
      </div>
    );
  } else if (response?.noDownloadSources) {
    body = (
      <div className="catalogue-for-you__empty">
        <p>{t("for_you_no_sources")}</p>
        <Link to="/settings">{t("for_you_open_settings")}</Link>
      </div>
    );
  } else if (profile && groups.length === 0) {
    body =
      options.basedOn === "games" || options.basedOn === "tags" ? (
        <div className="catalogue-for-you__empty">
          <p>{t(`for_you_empty_${options.basedOn}`)}</p>
        </div>
      ) : (
        <div className="catalogue-for-you__empty">
          <p>{t("for_you_no_library")}</p>
          <Link to="/library">{t("for_you_open_library")}</Link>
        </div>
      );
  } else if (results.length === 0) {
    body = (
      <div className="catalogue-for-you__empty">
        <p>{t("for_you_no_match")}</p>
        <Button theme="outline" onClick={reset}>
          {t("tune_reset")}
        </Button>
      </div>
    );
  } else {
    body = visible.map((recommendation) => {
      const game = toCardGame(recommendation);
      const key = catalogueKey(game);
      const props = {
        game: {
          ...game,
          releaseYear: recommendation.releaseYear,
        },
        facts: facts.get(key),
        libraryState: libraryStates.get(key),
        ...getRecommendationReason(recommendation, tagLabels, describeGroup),
        onNotInterested: () => notInterested.markNotInterested(game),
        feedback: suggestion.feedbackFor(game),
      };

      return view === "grid" ? (
        <StoreGameCard key={key} size="grid" {...props} />
      ) : (
        <StoreGameRow key={key} {...props} />
      );
    });
  }

  const notes = [
    leftOut?.buildDateUnknown
      ? t("for_you_left_out_build", { count: leftOut.buildDateUnknown })
      : null,
    leftOut?.tierUnknown
      ? t("for_you_left_out_tier", { count: leftOut.tierUnknown })
      : null,
    leftOut?.lengthUnknown
      ? t("for_you_left_out_length", { count: leftOut.lengthUnknown })
      : null,
  ].filter(Boolean);

  return (
    <div className="catalogue__content">
      {suggestion.dialog}
      <div className="catalogue__main">
        <div className="catalogue-for-you__header">
          <button
            type="button"
            className="catalogue-for-you__back"
            onClick={onBack}
          >
            <ArrowLeftIcon size={14} />
            {t("for_you_back")}
          </button>
          <h2 className="catalogue-for-you__title">
            {t("for_you")}
            {scope && (
              <span className="catalogue-for-you__scope"> · {scope}</span>
            )}
          </h2>
          <span className="catalogue-for-you__status" aria-live="polite">
            {isRefreshing && response ? t("for_you_updating") : null}
            {!isRefreshing && staleAt
              ? t("for_you_stale", {
                  time: new Date(staleAt).toLocaleString(),
                })
              : null}
          </span>
          <SegmentedControl
            label={t("view_list") + " / " + t("view_grid")}
            value={view}
            options={[
              {
                value: "list",
                label: t("view_list"),
                icon: <ListUnorderedIcon size={14} />,
              },
              {
                value: "grid",
                label: t("view_grid"),
                icon: <TableIcon size={14} />,
              },
            ]}
            onChange={setView}
          />
        </div>

        {groups.length > 0 && (
          <p className="catalogue-for-you__description">
            {options.basedOn === "groups"
              ? t("for_you_description_groups", {
                  count: profile?.seedCount ?? 0,
                  groups: groups.length,
                })
              : t("for_you_description_chosen")}
          </p>
        )}
        {notes.map((note) => (
          <p key={note} className="catalogue-for-you__note">
            {note}
          </p>
        ))}

        <div
          className={cn("catalogue__games-container", {
            "catalogue__games-container--grid": view === "grid",
            "catalogue-for-you__list--refreshing": isRefreshing && !!response,
          })}
        >
          {body}

          {!isFirstLoad && results.length > 0 && (
            <div className="catalogue__load-more">
              <span className="catalogue__result-count">
                {t("showing_count", {
                  shown: formatNumber(visible.length),
                  total: formatNumber(results.length),
                })}
              </span>
              {visible.length < results.length && (
                <Button
                  type="button"
                  theme="outline"
                  onClick={() => setShown((count) => count + PAGE_SIZE)}
                >
                  {t("load_more")}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="catalogue__filters-container">
        <div className="catalogue__filters-sections">
          <TunePanel profile={profile} />
        </div>
      </div>
    </div>
  );
}
