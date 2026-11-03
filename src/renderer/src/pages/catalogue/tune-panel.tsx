import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { XIcon } from "@primer/octicons-react";
import {
  DEFAULT_TUNE_OPTIONS,
  type TasteProfile,
  type TuneOptions,
} from "@shared";

import {
  Button,
  CheckboxField,
  RangeSlider,
  SegmentedControl,
  SelectField,
  SidebarSection,
  TagPicker,
  TextField,
} from "@renderer/components";
import { useLibrary } from "@renderer/hooks";

import { useNotInterested } from "./use-not-interested";
import { useSteamTagLabels } from "./use-steam-tag-labels";
import { useTuneSettings } from "./use-tune-settings";
import "./tune-panel.scss";

const SEEDS_SHOWN = 10;
const PICK_MATCHES = 6;
const REVIEW_PERCENTS = [0, 50, 60, 70, 80, 90];
const REVIEW_COUNTS = [0, 10, 50, 100, 500, 1000];
const MIN_YEAR = 1990;
const LENGTHS = ["short", "medium", "long", "epic"] as const;

const percent = (share: number) => `${Math.round(share * 100)} %`;

interface TunePanelProps {
  profile: TasteProfile | null;
}

/** The knobs of the recommender: what it learns from, what to avoid, how to order and filter. */
export function TunePanel({ profile }: Readonly<TunePanelProps>) {
  const { t } = useTranslation("catalogue");
  const tagLabels = useSteamTagLabels();
  const isLinux = window.electron.platform === "linux";
  const {
    options,
    settings,
    setOptions,
    reset,
    savePreset,
    applyPreset,
    deletePreset,
  } = useTuneSettings();
  const notInterested = useNotInterested();
  const [presetName, setPresetName] = useState("");

  const tagName = (id: number) => tagLabels.get(id) ?? String(id);
  const family = profile?.dominantFamily;
  const familyIsAvoided = family
    ? options.avoidTags.includes(family.tagId)
    : false;

  const seedChips =
    options.basedOn === "picked"
      ? []
      : (profile?.seeds ?? []).slice(0, SEEDS_SHOWN);
  const idleSeeds = (profile?.seeds ?? []).filter((seed) =>
    seed.notes.includes("idle")
  );

  const setNumber = (key: "gte" | "lte", value: string) => {
    const year = Number.parseInt(value, 10);
    const years = { ...options.years };
    if (Number.isFinite(year)) years[key] = year;
    else delete years[key];
    setOptions({ years: Object.keys(years).length > 0 ? years : null });
  };

  const percentOptions = REVIEW_PERCENTS.map((value) => ({
    key: String(value),
    value: String(value),
    label: value === 0 ? t("filter_any") : `${value} %`,
  }));
  const countOptions = REVIEW_COUNTS.map((value) => ({
    key: String(value),
    value: String(value),
    label: value === 0 ? t("filter_any") : String(value),
  }));

  return (
    <div className="tune-panel">
      <SidebarSection title={t("tune_based_on")}>
        <div className="tune-panel__section">
          <SelectField
            theme="dark"
            value={options.basedOn}
            options={(["all-time", "recent", "picked"] as const).map(
              (value) => ({
                key: value,
                value,
                label: t(`tune_basis_${value.replace("-", "_")}`),
              })
            )}
            onChange={(event) =>
              setOptions({
                basedOn: event.target.value as TuneOptions["basedOn"],
              })
            }
          />

          {options.basedOn === "picked" ? (
            <PickedGames
              picked={options.pickedGames}
              onChange={(pickedGames) => setOptions({ pickedGames })}
            />
          ) : (
            <>
              {seedChips.length > 0 ? (
                <ul className="tune-panel__chips">
                  {seedChips.map((seed) => (
                    <li key={seed.key} className="tune-panel__chip">
                      <span
                        title={
                          seed.notes.includes("idle")
                            ? t("tune_idle_note", { title: seed.title })
                            : undefined
                        }
                      >
                        {seed.title} {percent(seed.share)}
                      </span>
                      <button
                        type="button"
                        className="tune-panel__chip-remove"
                        aria-label={t("tune_seed_remove", {
                          title: seed.title,
                        })}
                        onClick={() =>
                          setOptions({
                            excludedSeeds: [...options.excludedSeeds, seed.key],
                          })
                        }
                      >
                        <XIcon size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="tune-panel__hint">{t("tune_no_profile")}</p>
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

          <CheckboxField
            label={t("tune_idle_discount")}
            checked={options.idleDiscount}
            onChange={(event) =>
              setOptions({ idleDiscount: event.target.checked })
            }
          />
          <p className="tune-panel__hint">
            {options.idleDiscount && idleSeeds.length > 0
              ? t("tune_idle_note", { title: idleSeeds[0].title })
              : t("tune_idle_hint")}
          </p>
        </div>
      </SidebarSection>

      <SidebarSection title={t("avoid_tags")}>
        <div className="tune-panel__section">
          {family && !familyIsAvoided && (
            <div className="tune-panel__nudge">
              <p>
                {t("tune_family_nudge", {
                  tag: tagName(family.tagId),
                  lead: family.seedTitle
                    ? t("tune_family_lead", {
                        title: family.seedTitle,
                        hours: Math.round(family.seedHours).toLocaleString(),
                      })
                    : "",
                })}
              </p>
              <Button
                theme="outline"
                onClick={() =>
                  setOptions({
                    avoidTags: [...options.avoidTags, family.tagId],
                  })
                }
              >
                {t("tune_avoid")}
              </Button>
            </div>
          )}
          <TagPicker
            value={options.avoidTags}
            onChange={(avoidTags) => setOptions({ avoidTags })}
            labels={tagLabels}
            placeholder={t("avoid_tags_placeholder")}
            label={t("avoid_tags")}
          />
          <CheckboxField
            label={t("avoid_related_tags")}
            checked={options.avoidRelated}
            onChange={(event) =>
              setOptions({ avoidRelated: event.target.checked })
            }
          />
          <span className="tune-panel__label">{t("tune_strictness")}</span>
          <SegmentedControl
            label={t("tune_strictness")}
            value={String(options.avoidStrictness) as "5" | "10" | "20"}
            options={(["5", "10", "20"] as const).map((value) => ({
              value,
              label: t("tune_first_tags", { count: Number(value) }),
            }))}
            onChange={(value) =>
              setOptions({
                avoidStrictness: Number(
                  value
                ) as TuneOptions["avoidStrictness"],
              })
            }
          />
        </div>
      </SidebarSection>

      <SidebarSection title={t("tune_lean")}>
        <div className="tune-panel__section">
          <TagPicker
            value={options.leanTags}
            onChange={(leanTags) => setOptions({ leanTags })}
            labels={tagLabels}
            placeholder={t("tune_lean_placeholder")}
            label={t("tune_lean")}
          />
          <span className="tune-panel__label">{t("tune_depth")}</span>
          <SegmentedControl
            label={t("tune_depth")}
            value={String(options.leanDepth) as "3" | "5" | "10"}
            options={(["3", "5", "10"] as const).map((value) => ({
              value,
              label: t("tune_first_tags", { count: Number(value) }),
            }))}
            onChange={(value) =>
              setOptions({
                leanDepth: Number(value) as TuneOptions["leanDepth"],
              })
            }
          />
        </div>
      </SidebarSection>

      <SidebarSection title={t("tune_order")}>
        <div className="tune-panel__section">
          <RangeSlider
            label={t("tune_popularity")}
            value={options.popularity}
            min={-1}
            max={1}
            step={0.25}
            startLabel={t("tune_niche")}
            endLabel={t("tune_popular")}
            onChange={(popularity) => setOptions({ popularity })}
          />
          <RangeSlider
            label={t("tune_recency")}
            value={options.recency}
            min={-1}
            max={1}
            step={0.25}
            startLabel={t("tune_older")}
            endLabel={t("tune_newer")}
            onChange={(recency) => setOptions({ recency })}
          />
        </div>
      </SidebarSection>

      <SidebarSection title={t("tune_filters")}>
        <div className="tune-panel__section">
          <SelectField
            theme="dark"
            label={t("tune_min_review_percent")}
            value={String(options.minReviewPercent)}
            options={percentOptions}
            onChange={(event) =>
              setOptions({ minReviewPercent: Number(event.target.value) })
            }
          />
          <SelectField
            theme="dark"
            label={t("tune_min_reviews")}
            value={String(options.minReviews)}
            options={countOptions}
            onChange={(event) =>
              setOptions({ minReviews: Number(event.target.value) })
            }
          />
          <div className="tune-panel__years">
            <TextField
              theme="dark"
              type="number"
              label={t("tune_year_from")}
              min={MIN_YEAR}
              max={new Date().getFullYear()}
              value={options.years?.gte ?? ""}
              onChange={(event) => setNumber("gte", event.target.value)}
            />
            <TextField
              theme="dark"
              type="number"
              label={t("tune_year_to")}
              min={MIN_YEAR}
              max={new Date().getFullYear()}
              value={options.years?.lte ?? ""}
              onChange={(event) => setNumber("lte", event.target.value)}
            />
          </div>
          <SelectField
            theme="dark"
            label={t("tune_length")}
            value={options.length ?? "any"}
            options={[
              { key: "any", value: "any", label: t("filter_any") },
              ...LENGTHS.map((value) => ({
                key: value,
                value,
                label: t(`tune_length_${value}`),
              })),
            ]}
            onChange={(event) =>
              setOptions({
                length:
                  event.target.value === "any"
                    ? null
                    : (event.target.value as TuneOptions["length"]),
              })
            }
          />
          {isLinux && (
            <SelectField
              theme="dark"
              label={t("protondb_minimum")}
              value={options.protonMinimum}
              options={[
                { key: "any", value: "any", label: t("filter_any") },
                {
                  key: "silver",
                  value: "silver",
                  label: t("protondb_silver_plus"),
                },
                { key: "gold", value: "gold", label: t("protondb_gold_plus") },
                {
                  key: "platinum",
                  value: "platinum",
                  label: t("protondb_platinum_only"),
                },
              ]}
              onChange={(event) =>
                setOptions({
                  protonMinimum: event.target
                    .value as TuneOptions["protonMinimum"],
                })
              }
            />
          )}
          <CheckboxField
            label={t("tune_finished_only")}
            checked={options.finishedOnly}
            onChange={(event) =>
              setOptions({ finishedOnly: event.target.checked })
            }
          />
          <CheckboxField
            label={t("singleplayer_only")}
            checked={options.singleplayerOnly}
            onChange={(event) =>
              setOptions({ singleplayerOnly: event.target.checked })
            }
          />
          <CheckboxField
            label={t("hide_early_access")}
            checked={options.hideEarlyAccess}
            onChange={(event) =>
              setOptions({ hideEarlyAccess: event.target.checked })
            }
          />
          <CheckboxField
            label={t("tune_downloadable_only")}
            checked={options.downloadableOnly}
            onChange={(event) =>
              setOptions({ downloadableOnly: event.target.checked })
            }
          />
        </div>
      </SidebarSection>

      <SidebarSection title={t("tune_presets")}>
        <div className="tune-panel__section">
          {settings.presets.length > 0 && (
            <ul className="tune-panel__list">
              {settings.presets.map((preset) => (
                <li key={preset.id} className="tune-panel__row">
                  <button
                    type="button"
                    className="tune-panel__row-main"
                    onClick={() => applyPreset(preset.id)}
                  >
                    {preset.name}
                  </button>
                  <button
                    type="button"
                    className="tune-panel__chip-remove"
                    aria-label={t("tune_preset_delete", { name: preset.name })}
                    onClick={() => deletePreset(preset.id)}
                  >
                    <XIcon size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <TextField
            theme="dark"
            value={presetName}
            placeholder={t("tune_preset_name")}
            aria-label={t("tune_preset_name")}
            onChange={(event) => setPresetName(event.target.value)}
          />
          <div className="tune-panel__buttons">
            <Button
              theme="outline"
              disabled={!presetName.trim()}
              onClick={() => {
                savePreset(presetName.trim());
                setPresetName("");
              }}
            >
              {t("tune_preset_save")}
            </Button>
            <Button
              theme="outline"
              disabled={
                JSON.stringify({
                  ...options,
                  avoidTags: [],
                  avoidRelated: true,
                  avoidStrictness: 5,
                }) === JSON.stringify(DEFAULT_TUNE_OPTIONS)
              }
              onClick={reset}
            >
              {t("tune_reset")}
            </Button>
          </div>
        </div>
      </SidebarSection>

      <SidebarSection
        title={t("tune_not_interested", { count: notInterested.games.length })}
      >
        <div className="tune-panel__section">
          {notInterested.games.length === 0 ? (
            <p className="tune-panel__hint">{t("tune_not_interested_empty")}</p>
          ) : (
            <ul className="tune-panel__list">
              {notInterested.games.map((game) => (
                <li
                  key={`${game.shop}:${game.objectId}`}
                  className="tune-panel__row"
                >
                  <span className="tune-panel__row-main">{game.title}</span>
                  <Button
                    theme="outline"
                    onClick={() => notInterested.restore(game)}
                  >
                    {t("tune_restore")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SidebarSection>
    </div>
  );
}

function PickedGames({
  picked,
  onChange,
}: Readonly<{ picked: string[]; onChange: (value: string[]) => void }>) {
  const { t } = useTranslation("catalogue");
  const { library } = useLibrary();
  const [query, setQuery] = useState("");

  const steamGames = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const game of library) {
      const identity = game.catalogueGame ?? game;
      if (identity.shop === "steam") {
        byKey.set(`steam:${identity.objectId}`, game.title);
      }
    }
    return byKey;
  }, [library]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return [...steamGames]
      .filter(
        ([key, title]) =>
          !picked.includes(key) && title.toLowerCase().includes(needle)
      )
      .slice(0, PICK_MATCHES);
  }, [picked, query, steamGames]);

  return (
    <div className="tune-panel__pick">
      <TextField
        theme="dark"
        value={query}
        placeholder={t("tune_pick_placeholder")}
        aria-label={t("tune_pick_placeholder")}
        onChange={(event) => setQuery(event.target.value)}
      />
      {matches.length > 0 && (
        <ul className="tune-panel__list">
          {matches.map(([key, title]) => (
            <li key={key}>
              <button
                type="button"
                className="tune-panel__row-main"
                onClick={() => {
                  onChange([...picked, key]);
                  setQuery("");
                }}
              >
                {title}
              </button>
            </li>
          ))}
        </ul>
      )}
      {picked.length > 0 ? (
        <ul className="tune-panel__chips">
          {picked.map((key) => (
            <li key={key} className="tune-panel__chip">
              <span>{steamGames.get(key) ?? key}</span>
              <button
                type="button"
                className="tune-panel__chip-remove"
                aria-label={t("tune_seed_remove", {
                  title: steamGames.get(key) ?? key,
                })}
                onClick={() => onChange(picked.filter((item) => item !== key))}
              >
                <XIcon size={12} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="tune-panel__hint">{t("tune_pick_empty")}</p>
      )}
    </div>
  );
}
