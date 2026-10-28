import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAppSelector } from "@renderer/hooks";

const labelsByTags = new WeakMap<object, ReadonlyMap<number, string>>();

/** Steam tag id → name in the app language, from the tags the catalogue loaded. */
export function useSteamTagLabels(): ReadonlyMap<number, string> {
  const { i18n } = useTranslation();
  const { steamUserTags } = useAppSelector((state) => state.catalogueSearch);
  const tags = steamUserTags[i18n.language.split("-")[0]];

  return useMemo(() => {
    if (!tags) return new Map();

    let labels = labelsByTags.get(tags);
    if (!labels) {
      labels = new Map(Object.entries(tags).map(([name, id]) => [id, name]));
      labelsByTags.set(tags, labels);
    }
    return labels;
  }, [tags]);
}
