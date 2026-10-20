import { useTranslation } from "react-i18next";
import { BookmarkIcon, CheckIcon, XIcon } from "@primer/octicons-react";
import { Button, DropdownMenu } from "@renderer/components";
import type { DropdownMenuItem } from "@renderer/components";
import { PLAY_STATUSES } from "@shared";
import type { PlayStatus } from "@types";

interface PlayStatusMenuProps {
  playStatus: PlayStatus | null;
  onChange: (playStatus: PlayStatus | null) => void;
  disabled?: boolean;
}

export function PlayStatusMenu({
  playStatus,
  onChange,
  disabled,
}: Readonly<PlayStatusMenuProps>) {
  const { t } = useTranslation("library");

  const items: DropdownMenuItem[] = [
    ...PLAY_STATUSES.map((status) => ({
      icon: status === playStatus ? <CheckIcon /> : undefined,
      label: t(`play_status_${status}`),
      onClick: () => onChange(status),
    })),
    {
      icon: <XIcon />,
      label: t("play_status_clear"),
      show: playStatus !== null,
      onClick: () => onChange(null),
    },
  ];

  return (
    <DropdownMenu items={items} align="end">
      <Button
        theme="outline"
        disabled={disabled}
        className="hero-panel-actions__action"
        title={t("play_status")}
      >
        <BookmarkIcon />
        {playStatus ? t(`play_status_${playStatus}`) : t("play_status")}
      </Button>
    </DropdownMenu>
  );
}
