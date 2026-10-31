import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  CloudIcon,
  FileDirectoryIcon,
  HistoryIcon,
  SearchIcon,
  XIcon,
} from "@primer/octicons-react";

import { Button } from "@renderer/components";
import { useAppDispatch, useAppSelector } from "@renderer/hooks";
import { setUserPreferences } from "@renderer/features";
import { levelDBService } from "@renderer/services/leveldb.service";
import type { UserPreferences } from "@types";

import { HomeShelf } from "./home-shelf";

/**
 * First steps for someone whose library has nothing installed yet: where
 * games go, where to find them, and the optional extras. Dismissed for good.
 */
export function HomeGetStarted() {
  const { t } = useTranslation("home");
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const downloadsPath = useAppSelector(
    (state) => state.userPreferences.value?.downloadsPath
  );

  const dismiss = useCallback(async () => {
    await window.electron.updateUserPreferences({
      homeGetStartedDismissed: true,
    });
    const preferences = await levelDBService.get(
      "userPreferences",
      null,
      "json"
    );
    dispatch(setUserPreferences(preferences as UserPreferences | null));
  }, [dispatch]);

  const steps = [
    {
      icon: <FileDirectoryIcon size={20} />,
      text: downloadsPath
        ? t("get_started_folder", { path: downloadsPath })
        : t("get_started_folder_unset"),
      action: t("get_started_folder_action"),
      to: "/settings?tab=downloads",
    },
    {
      icon: <SearchIcon size={20} />,
      text: t("get_started_catalogue"),
      action: t("get_started_catalogue_action"),
      to: "/catalogue",
    },
    {
      icon: <FileDirectoryIcon size={20} />,
      text: t("get_started_library_folders"),
      action: t("get_started_library_folders_action"),
      to: "/settings?tab=library_folders",
    },
    {
      icon: <HistoryIcon size={20} />,
      text: t("get_started_tracking"),
      action: t("get_started_tracking_action"),
      to: "/settings?tab=integrations",
    },
    {
      icon: <CloudIcon size={20} />,
      text: t("get_started_cloud"),
      action: t("get_started_cloud_action"),
      to: "/settings?tab=cloud",
    },
  ];

  return (
    <HomeShelf
      title={t("get_started")}
      wrap
      description={t("get_started_description")}
      action={
        <button
          type="button"
          className="home__shelf-link"
          onClick={dismiss}
          aria-label={t("get_started_dismiss")}
        >
          <XIcon size={14} />
          {t("get_started_dismiss")}
        </button>
      }
    >
      {steps.map((step) => (
        <div key={step.to} className="home__get-started-step">
          <div className="home__get-started-icon">{step.icon}</div>
          <p className="home__get-started-text">{step.text}</p>
          <Button theme="outline" onClick={() => navigate(step.to)}>
            {step.action}
          </Button>
        </div>
      ))}
    </HomeShelf>
  );
}
