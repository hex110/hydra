import { useTranslation } from "react-i18next";
import {
  HeartFillIcon,
  HeartIcon,
  KebabHorizontalIcon,
  LinkExternalIcon,
  PinIcon,
  PinSlashIcon,
} from "@primer/octicons-react";

import { Button, DropdownMenu } from "@renderer/components";
import type { DropdownMenuItem } from "@renderer/components";

export interface GameMoreMenuProps {
  title: string;
  steamAppId: string | null;
  favorite?: boolean;
  pinned?: boolean;
  /** Omitted when the game is not in the library or cannot be pinned. */
  onToggleFavorite?: () => void;
  onTogglePinned?: () => void;
  disabled?: boolean;
}

/** Links to the game on other sites, plus favourite and pin. */
export const getGameLinks = (title: string, steamAppId: string | null) => {
  const query = encodeURIComponent(title);
  return [
    ...(steamAppId
      ? [
          {
            key: "steam",
            url: `https://store.steampowered.com/app/${steamAppId}`,
          },
          { key: "steamdb", url: `https://steamdb.info/app/${steamAppId}/` },
          {
            key: "protondb",
            url: `https://www.protondb.com/app/${steamAppId}`,
          },
          {
            key: "pcgamingwiki",
            url: `https://www.pcgamingwiki.com/api/appid.php?appid=${steamAppId}`,
          },
        ]
      : [
          {
            key: "pcgamingwiki",
            url: `https://www.pcgamingwiki.com/w/index.php?search=${query}`,
          },
        ]),
    { key: "howlongtobeat", url: `https://howlongtobeat.com/?q=${query}` },
  ];
};

export function GameMoreMenu({
  title,
  steamAppId,
  favorite,
  pinned,
  onToggleFavorite,
  onTogglePinned,
  disabled,
}: Readonly<GameMoreMenuProps>) {
  const { t } = useTranslation("game_details");

  const items: DropdownMenuItem[] = [
    ...(onToggleFavorite
      ? [
          {
            icon: favorite ? <HeartFillIcon /> : <HeartIcon />,
            label: favorite
              ? t("remove_from_favorites")
              : t("add_to_favorites"),
            onClick: onToggleFavorite,
          },
        ]
      : []),
    ...(onTogglePinned
      ? [
          {
            icon: pinned ? <PinSlashIcon /> : <PinIcon />,
            label: pinned ? t("unpin_game") : t("pin_game"),
            onClick: onTogglePinned,
          },
        ]
      : []),
    ...getGameLinks(title, steamAppId).map((link) => ({
      icon: <LinkExternalIcon />,
      label: t(`open_on_${link.key}`),
      onClick: () => void window.electron.openExternal(link.url),
    })),
  ];

  return (
    <DropdownMenu items={items} align="end">
      <Button
        theme="outline"
        disabled={disabled}
        className="hero-panel-actions__action"
        aria-label={t("more_actions")}
        title={t("more_actions")}
      >
        <KebabHorizontalIcon />
      </Button>
    </DropdownMenu>
  );
}
