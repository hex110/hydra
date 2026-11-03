import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { StoreGameFacts } from "@shared";
import { Button, Modal, type StoreGameFeedback } from "@renderer/components";
import { RatingInput } from "@renderer/components/rating-input/rating-input";
import { useAppDispatch } from "@renderer/hooks";
import { setDiscoverView } from "@renderer/features";

import { useFacetCounts } from "./use-facet-counts";
import { useNotInterested } from "./use-not-interested";
import { clearRecommendationsCache } from "./use-recommendations";
import { useSteamTagLabels } from "./use-steam-tag-labels";
import { useTuneSettings } from "./use-tune-settings";
import "./use-suggestion-feedback.scss";

/** Leading tags Not this kind chooses from. */
const KIND_DEPTH = 3;

interface SuggestedGame {
  shop: string;
  objectId: string;
  title: string;
}

/**
 * What a suggestion's card can tell the recommender: not this game, not
 * this kind (avoid the rarest of its leading tags), already played (with a
 * rating, so it counts toward your taste), or more like this.
 */
export function useSuggestionFeedback(
  facts: ReadonlyMap<string, StoreGameFacts>
): {
  feedbackFor: (game: SuggestedGame) => StoreGameFeedback | undefined;
  playedKeys: ReadonlySet<string>;
  dialog: ReactNode;
} {
  const { t } = useTranslation("catalogue");
  const dispatch = useAppDispatch();
  const tagLabels = useSteamTagLabels();
  const { counts } = useFacetCounts();
  const tune = useTuneSettings();
  const notInterested = useNotInterested();
  const [played, setPlayed] = useState<SuggestedGame | null>(null);
  const [rating, setRating] = useState<number | null>(null);

  const playedKeys = useMemo(
    () =>
      new Set(
        Object.keys(tune.settings.playedElsewhere ?? {}).map(
          (appId) => `steam:${appId}`
        )
      ),
    [tune.settings.playedElsewhere]
  );

  const feedbackFor = useCallback(
    (game: SuggestedGame): StoreGameFeedback | undefined => {
      if (game.shop !== "steam") return undefined;
      const tagIds = facts.get(`${game.shop}:${game.objectId}`)?.tagIds ?? [];
      const rarest = tagIds
        .slice(0, KIND_DEPTH)
        .filter((id) => !tune.options.avoidTags.includes(id))
        .sort(
          (a, b) =>
            (counts?.tags[a] ?? Infinity) - (counts?.tags[b] ?? Infinity)
        )[0];
      const kindName = rarest === undefined ? undefined : tagLabels.get(rarest);

      return {
        kindTag:
          rarest !== undefined && kindName
            ? { id: rarest, name: kindName }
            : undefined,
        onNotThisKind:
          rarest === undefined
            ? undefined
            : () => {
                tune.setOptions({
                  avoidTags: [...tune.options.avoidTags, rarest],
                });
                notInterested.markNotInterested(game);
              },
        onAlreadyPlayed: () => {
          setRating(null);
          setPlayed(game);
        },
        onMoreLikeThis: () => {
          tune.setOptions({
            basedOn: "games",
            pickedGames: [`steam:${game.objectId}`],
          });
          dispatch(setDiscoverView("for-you"));
        },
      };
    },
    [facts, counts, tagLabels, tune, notInterested, dispatch]
  );

  const dialog = (
    <Modal
      visible={played !== null}
      title={t("already_played_title", { title: played?.title ?? "" })}
      description={t("already_played_description")}
      onClose={() => setPlayed(null)}
    >
      <div className="already-played">
        <RatingInput
          value={rating}
          onChange={setRating}
          label={t("already_played_rating")}
        />
        <Button
          theme="primary"
          onClick={() => {
            if (!played) return;
            tune.markPlayedElsewhere(played.objectId, played.title, rating);
            clearRecommendationsCache();
            setPlayed(null);
          }}
        >
          {t("already_played_save")}
        </Button>
      </div>
    </Modal>
  );

  return { feedbackFor, playedKeys, dialog };
}
