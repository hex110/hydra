import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  XIcon,
} from "@primer/octicons-react";
import cn from "classnames";
import type { ProfileGroup, SeedNote, TasteProfile, TuneBasis } from "@shared";

import {
  Button,
  SegmentedControl,
  SidebarSection,
  TagPicker,
  TextField,
} from "@renderer/components";
import { useFormat, useLibrary } from "@renderer/hooks";
import { logger } from "@renderer/logger";

import { getGroupName } from "./recommendation-card";
import { clearRecommendationsCache } from "./use-recommendations";
import { useSteamTagLabels } from "./use-steam-tag-labels";
import { useTuneSettings } from "./use-tune-settings";
import "./based-on-section.scss";

const PICK_MATCHES = 6;
const SEARCH_DEBOUNCE_MS = 300;
const BASES: TuneBasis[] = ["groups", "recent", "games", "tags"];

const percent = (share: number) =>
  share > 0 && share < 0.01 ? "<1 %" : `${Math.round(share * 100)} %`;

interface BasedOnSectionProps {
  profile: TasteProfile | null;
}

/** What the suggestions start from, and every game behind them. */
export function BasedOnSection({ profile }: Readonly<BasedOnSectionProps>) {
  const { t } = useTranslation("catalogue");
  const { formatNumber } = useFormat();
  const tagLabels = useSteamTagLabels();
  const { options, settings, setOptions, removePlayedElsewhere } =
    useTuneSettings();
  const playedElsewhere = Object.entries(settings.playedElsewhere ?? {}).sort(
    (a, b) => b[1].at - a[1].at
  );
  const groups = profile?.groups ?? [];
  const isLibraryBasis =
    options.basedOn === "groups" || options.basedOn === "recent";
  const gameCount = groups.reduce((sum, group) => sum + group.games.length, 0);

  return (
    <SidebarSection title={t("tune_based_on")}>
      <div className="based-on">
        <SegmentedControl
          label={t("tune_based_on")}
          value={options.basedOn}
          options={BASES.map((value) => ({
            value,
            label: t(`tune_basis_${value}`),
          }))}
          onChange={(basedOn) => setOptions({ basedOn })}
        />

        {isLibraryBasis && (
          <>
            {groups.length > 0 ? (
              <>
                <p className="based-on__hint">
                  {t("tune_groups_summary", {
                    count: gameCount,
                    formattedCount: formatNumber(gameCount),
                    groups: groups.length,
                  })}
                  {(profile?.untaggedCount ?? 0) > 0 &&
                    ` ${t("tune_groups_untagged", {
                      count: profile?.untaggedCount ?? 0,
                    })}`}
                </p>
                <ul className="based-on__groups">
                  <li>
                    <button
                      type="button"
                      aria-pressed={options.group === "all"}
                      className={cn("based-on__group-pick", {
                        "based-on__group-pick--active": options.group === "all",
                      })}
                      onClick={() => setOptions({ group: "all" })}
                    >
                      <span className="based-on__group-name">
                        {t("tune_mix_all")}
                      </span>
                      <span className="based-on__group-facts">
                        {t("tune_mix_all_hint")}
                      </span>
                    </button>
                  </li>
                  {groups.map((group) => (
                    <GroupRow
                      key={group.id}
                      group={group}
                      name={getGroupName(group, tagLabels)}
                      isActive={options.group === group.id}
                      onSelect={() => setOptions({ group: group.id })}
                      onExclude={(key) =>
                        setOptions({
                          excludedSeeds: [...options.excludedSeeds, key],
                        })
                      }
                    />
                  ))}
                </ul>
              </>
            ) : (
              <p className="based-on__hint">{t("tune_no_profile")}</p>
            )}
            {playedElsewhere.length > 0 && (
              <div className="based-on__elsewhere">
                <span className="based-on__hint">
                  {t("tune_played_elsewhere", {
                    count: playedElsewhere.length,
                  })}
                </span>
                <ul className="based-on__games">
                  {playedElsewhere.map(([appId, entry]) => (
                    <li key={appId} className="based-on__game">
                      <span className="based-on__game-title">
                        {entry.title}
                      </span>
                      {entry.rating !== null && (
                        <span className="based-on__game-facts">
                          {t("tune_rated", { rating: entry.rating })}
                        </span>
                      )}
                      <button
                        type="button"
                        className="based-on__remove"
                        aria-label={t("tune_played_elsewhere_remove", {
                          title: entry.title,
                        })}
                        onClick={() => {
                          removePlayedElsewhere(appId);
                          clearRecommendationsCache();
                        }}
                      >
                        <XIcon size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {options.excludedSeeds.length > 0 && (
              <Button
                theme="outline"
                onClick={() => setOptions({ excludedSeeds: [] })}
              >
                {t("tune_seeds_restore", {
                  count: options.excludedSeeds.length,
                })}
              </Button>
            )}
          </>
        )}

        {options.basedOn === "games" && (
          <PickedGames
            picked={options.pickedGames}
            known={groups[0]?.games ?? []}
            onChange={(pickedGames) => setOptions({ pickedGames })}
          />
        )}

        {options.basedOn === "tags" && (
          <>
            <TagPicker
              value={options.seedTags}
              onChange={(seedTags) => setOptions({ seedTags })}
              labels={tagLabels}
              placeholder={t("tune_seed_tags_placeholder")}
              label={t("tune_basis_tags")}
            />
            <p className="based-on__hint">{t("tune_seed_tags_hint")}</p>
          </>
        )}
      </div>
    </SidebarSection>
  );
}

const NOTE_KEYS: Partial<Record<SeedNote, string>> = {
  "rated-high": "tune_note_rated_high",
  "rated-low": "tune_note_rated_low",
  finished: "tune_note_finished",
  dropped: "tune_note_dropped",
  intent: "tune_note_intent",
  capped: "tune_note_capped",
  elsewhere: "tune_note_elsewhere",
};

function GroupRow({
  group,
  name,
  isActive,
  onSelect,
  onExclude,
}: Readonly<{
  group: ProfileGroup;
  name: string;
  isActive: boolean;
  onSelect: () => void;
  onExclude: (key: string) => void;
}>) {
  const { t } = useTranslation("catalogue");
  const { formatNumber } = useFormat();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <li className="based-on__group">
      <div className="based-on__group-head">
        <button
          type="button"
          aria-pressed={isActive}
          className={cn("based-on__group-pick", {
            "based-on__group-pick--active": isActive,
          })}
          onClick={onSelect}
        >
          <span className="based-on__group-name">{name}</span>
          <span className="based-on__group-facts">
            {t("tune_group_facts", {
              count: group.games.length,
              formattedCount: formatNumber(group.games.length),
              hours: formatNumber(Math.round(group.hours)),
              share: percent(group.share),
            })}
          </span>
        </button>
        <button
          type="button"
          className="based-on__details"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((open) => !open)}
        >
          {isOpen ? (
            <ChevronDownIcon size={14} />
          ) : (
            <ChevronRightIcon size={14} />
          )}
          {t(isOpen ? "tune_group_hide" : "tune_group_details")}
        </button>
      </div>

      {isOpen && (
        <ul className="based-on__games">
          {group.games.map((game) => {
            const notes = game.notes
              .map((note) => NOTE_KEYS[note])
              .filter((key): key is string => Boolean(key))
              .map((key) => t(key));
            return (
              <li key={game.key} className="based-on__game">
                <span className="based-on__game-title" title={game.title}>
                  {game.title}
                </span>
                <span
                  className="based-on__game-facts"
                  title={notes.join(", ") || undefined}
                >
                  {game.hours > 0 &&
                    t("hours_short", { hours: Math.round(game.hours) })}{" "}
                  {percent(game.groupShare)}
                  {game.weight < 0 && ` · ${t("tune_note_pulls_away")}`}
                </span>
                <button
                  type="button"
                  className="based-on__remove"
                  aria-label={t("tune_seed_remove", { title: game.title })}
                  onClick={() => onExclude(game.key)}
                >
                  <XIcon size={12} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

interface SearchHit {
  key: string;
  title: string;
}

/** Games to start from: the library first, then the whole catalogue. */
function PickedGames({
  picked,
  known,
  onChange,
}: Readonly<{
  picked: string[];
  known: { key: string; title: string }[];
  onChange: (value: string[]) => void;
}>) {
  const { t } = useTranslation("catalogue");
  const { library } = useLibrary();
  const [query, setQuery] = useState("");
  const [catalogueHits, setCatalogueHits] = useState<SearchHit[]>([]);
  const [titles, setTitles] = useState(() => new Map<string, string>());

  const libraryGames = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const game of library) {
      const identity = game.catalogueGame ?? game;
      if (identity.shop === "steam") {
        byKey.set(`steam:${identity.objectId}`, game.title);
      }
    }
    return byKey;
  }, [library]);

  const titleOf = (key: string) =>
    libraryGames.get(key) ??
    titles.get(key) ??
    known.find((game) => game.key === key)?.title ??
    key;

  const needle = query.trim().toLowerCase();
  const libraryHits = useMemo(
    () =>
      needle
        ? [...libraryGames]
            .filter(
              ([key, title]) =>
                !picked.includes(key) && title.toLowerCase().includes(needle)
            )
            .slice(0, PICK_MATCHES)
            .map(([key, title]) => ({ key, title }))
        : [],
    [needle, libraryGames, picked]
  );

  // The catalogue answers what the library doesn't have.
  useEffect(() => {
    if (needle.length < 2) {
      setCatalogueHits([]);
      return;
    }
    let current = true;
    const timer = window.setTimeout(() => {
      window.electron.hydraApi
        .post<{ edges: { shop: string; objectId: string; title: string }[] }>(
          "/catalogue/search",
          {
            data: {
              title: needle,
              sortBy: "popularity",
              sortOrder: "desc",
              downloadSourceFingerprints: [],
              downloadSourceIds: [],
              tags: [],
              publishers: [],
              genres: [],
              developers: [],
              protondbSupportBadges: [],
              deckCompatibility: [],
              take: PICK_MATCHES,
              skip: 0,
            },
            needsAuth: false,
          }
        )
        .then((response) => {
          if (!current) return;
          setCatalogueHits(
            (response?.edges ?? [])
              .filter((game) => game.shop === "steam")
              .map((game) => ({
                key: `steam:${game.objectId}`,
                title: game.title,
              }))
          );
        })
        .catch((error) => logger.warn("Game search for Tune failed", error));
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [needle]);

  const hits = [
    ...libraryHits,
    ...catalogueHits.filter(
      (hit) =>
        !picked.includes(hit.key) &&
        !libraryHits.some((entry) => entry.key === hit.key)
    ),
  ].slice(0, PICK_MATCHES * 2);

  return (
    <div className="based-on__pick">
      <TextField
        theme="dark"
        value={query}
        placeholder={t("tune_pick_placeholder")}
        aria-label={t("tune_pick_placeholder")}
        onChange={(event) => setQuery(event.target.value)}
      />
      {hits.length > 0 && (
        <ul className="based-on__hits">
          {hits.map((hit) => (
            <li key={hit.key}>
              <button
                type="button"
                className="based-on__hit"
                onClick={() => {
                  setTitles((current) =>
                    new Map(current).set(hit.key, hit.title)
                  );
                  onChange([...picked, hit.key]);
                  setQuery("");
                }}
              >
                {hit.title}
                {!libraryGames.has(hit.key) && (
                  <span className="based-on__hit-source">
                    {t("tune_pick_from_catalogue")}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {picked.length > 0 ? (
        <ul className="based-on__chips">
          {picked.map((key) => (
            <li key={key} className="based-on__chip">
              <span>{titleOf(key)}</span>
              <button
                type="button"
                className="based-on__remove"
                aria-label={t("tune_seed_remove", { title: titleOf(key) })}
                onClick={() => onChange(picked.filter((item) => item !== key))}
              >
                <XIcon size={12} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="based-on__hint">{t("tune_pick_empty")}</p>
      )}
    </div>
  );
}
