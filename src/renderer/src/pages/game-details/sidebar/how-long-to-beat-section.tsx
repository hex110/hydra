import Skeleton, { SkeletonTheme } from "react-loading-skeleton";
import { useTranslation } from "react-i18next";
import type { HowLongToBeatCategory } from "@types";
import {
  SidebarRow,
  SidebarRows,
  SidebarSection,
} from "@renderer/components/sidebar-section/sidebar-section";
import "./sidebar.scss";

const durationTranslation: Record<string, string> = {
  Hours: "hours",
  Mins: "minutes",
};

export interface HowLongToBeatSectionProps {
  howLongToBeatData: HowLongToBeatCategory[] | null;
  isLoading: boolean;
  gameTitle: string;
}

export function HowLongToBeatSection({
  howLongToBeatData,
  isLoading,
  gameTitle,
}: HowLongToBeatSectionProps) {
  const { t } = useTranslation("game_details");

  const getDuration = (duration: string) => {
    const [value, unit] = duration.split(" ");
    return `${value} ${t(durationTranslation[unit])}`;
  };

  if ((!howLongToBeatData || howLongToBeatData.length === 0) && !isLoading)
    return null;

  return (
    <SkeletonTheme baseColor="#1c1c1c" highlightColor="#444">
      <SidebarSection
        variant="flat"
        title="HowLongToBeat"
        subtitle={t("open_on_howlongtobeat")}
        subtitleHref={`https://howlongtobeat.com/?q=${encodeURIComponent(gameTitle)}`}
      >
        <SidebarRows>
          {howLongToBeatData
            ? howLongToBeatData.map((category) => (
                <SidebarRow
                  key={category.title}
                  label={category.title}
                  title={
                    category.accuracy !== "00"
                      ? t("accuracy", { accuracy: category.accuracy })
                      : undefined
                  }
                >
                  {getDuration(category.duration)}
                </SidebarRow>
              ))
            : Array.from({ length: 3 }).map((_, index) => (
                <Skeleton
                  key={index}
                  className="how-long-to-beat__category-skeleton"
                />
              ))}
        </SidebarRows>
      </SidebarSection>
    </SkeletonTheme>
  );
}
