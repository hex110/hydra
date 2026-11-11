import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { GameShop } from "@types";
import { getGameExecutableFilters } from "@shared";
import { useAppSelector } from "./redux";
import { useLibrary } from "./use-library";
import { useToast } from "./use-toast";
import { logger } from "@renderer/logger";

function useBindGameExecutable() {
  const { t } = useTranslation("game_details");
  const { updateLibrary } = useLibrary();
  const { showErrorToast } = useToast();

  return useCallback(
    async (shop: GameShop, objectId: string, executablePath: string) => {
      const gameUsingPath =
        await window.electron.verifyExecutablePathInUse(executablePath);

      const usedByAnotherGame =
        gameUsingPath &&
        (gameUsingPath.shop !== shop || gameUsingPath.objectId !== objectId);

      if (usedByAnotherGame) {
        showErrorToast(
          t("executable_path_in_use", { game: gameUsingPath.title })
        );
        return false;
      }

      await window.electron.updateExecutablePath(
        shop,
        objectId,
        executablePath
      );
      updateLibrary();
      return true;
    },
    [showErrorToast, t, updateLibrary]
  );
}

function useDefaultPickerPath() {
  const downloadsPath = useAppSelector(
    (state) => state.userPreferences.value?.downloadsPath
  );

  return useCallback(
    async (shop: GameShop, objectId: string) =>
      (await window.electron
        .getExecutablePickerPath(shop, objectId)
        .catch(() => null)) ??
      downloadsPath ??
      (await window.electron.getDefaultDownloadsPath()),
    [downloadsPath]
  );
}

export function useGameExecutablePicker() {
  const { t } = useTranslation("game_details");
  const bindExecutable = useBindGameExecutable();
  const getDefaultPath = useDefaultPickerPath();

  return useCallback(
    async (shop: GameShop, objectId: string, defaultPath?: string) => {
      try {
        const filters = getGameExecutableFilters(window.electron.platform, {
          executable: t("game_executable"),
          allFiles: t("all_files"),
        });

        const { filePaths } = await window.electron.showOpenDialog({
          properties: ["openFile"],
          defaultPath: defaultPath ?? (await getDefaultPath(shop, objectId)),
          filters,
        });

        const executablePath = filePaths?.[0];
        if (!executablePath) return false;

        return await bindExecutable(shop, objectId, executablePath);
      } catch (error) {
        logger.error("Failed to select the game executable", error);
        return false;
      }
    },
    [bindExecutable, getDefaultPath, t]
  );
}

/**
 * For a game installed outside Hydra: pick its folder and the executable in
 * it is found for you. When none is found, the file picker opens there.
 */
export function useGameFolderPicker() {
  const bindExecutable = useBindGameExecutable();
  const pickExecutable = useGameExecutablePicker();
  const getDefaultPath = useDefaultPickerPath();

  return useCallback(
    async (shop: GameShop, objectId: string) => {
      try {
        const { filePaths } = await window.electron.showOpenDialog({
          properties: ["openDirectory"],
          defaultPath: await getDefaultPath(shop, objectId),
        });

        const folderPath = filePaths?.[0];
        if (!folderPath) return false;

        const executablePath = await window.electron.findExecutableInFolder(
          shop,
          objectId,
          folderPath
        );

        if (executablePath)
          return await bindExecutable(shop, objectId, executablePath);

        return await pickExecutable(shop, objectId, folderPath);
      } catch (error) {
        logger.error("Failed to locate the game folder", error);
        return false;
      }
    },
    [bindExecutable, getDefaultPath, pickExecutable]
  );
}
