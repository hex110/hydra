import { StackIcon, DeviceDesktopIcon } from "@primer/octicons-react";
import { useTranslation } from "react-i18next";
import { SourceIcon } from "./source-icon";
import type { LibraryTab } from "./library-filters";
import "./category-filter.scss";

export type { LibraryCategory } from "./library-category";

export function ClassicsIcon({
  size = 14,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="url(#classics-switch-gradient)"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <linearGradient
          id="classics-switch-gradient"
          x1="2"
          y1="2"
          x2="22"
          y2="22"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#f8c802" />
          <stop offset="25%" stopColor="#fc5812" />
          <stop offset="50%" stopColor="#fb0026" />
          <stop offset="75%" stopColor="#c80078" />
          <stop offset="100%" stopColor="#7300a4" />
        </linearGradient>
      </defs>
      <line x1="6" x2="10" y1="11" y2="11" />
      <line x1="8" x2="8" y1="9" y2="13" />
      <line x1="15" x2="15.01" y1="12" y2="12" />
      <line x1="18" x2="18.01" y1="10" y2="10" />
      <path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z" />
    </svg>
  );
}

interface CategoryFilterProps {
  tab: LibraryTab;
  tabs: LibraryTab[];
  onTabChange: (tab: LibraryTab) => void;
}

const TAB_ICONS: Record<LibraryTab, JSX.Element> = {
  all: <StackIcon size={14} />,
  local: <DeviceDesktopIcon size={14} />,
  steam: <SourceIcon source="steam" />,
  epic: <SourceIcon source="epic" />,
  classics: <ClassicsIcon size={16} />,
};

export function CategoryFilter({
  tab,
  tabs,
  onTabChange,
}: Readonly<CategoryFilterProps>) {
  const { t } = useTranslation("library");

  const labels: Record<LibraryTab, string> = {
    all: t("category_all"),
    local: t("category_local"),
    steam: t("library_steam"),
    epic: t("library_epic"),
    classics: t("category_classics"),
  };

  return (
    <div className="library-category-filter__container" role="tablist">
      {tabs.map((option) => (
        <button
          key={option}
          type="button"
          role="tab"
          aria-selected={tab === option}
          className={`library-category-filter__option ${tab === option ? "library-category-filter__option--active" : ""}`}
          onClick={() => onTabChange(option)}
        >
          {TAB_ICONS[option]}
          <span>{labels[option]}</span>
        </button>
      ))}
    </div>
  );
}
