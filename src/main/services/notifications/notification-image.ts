import fs from "node:fs";
import path from "node:path";
import axios from "axios";

import { logger } from "../logger";
import { SystemPath } from "../system-path";
import {
  buildDownloadFileName,
  transcodeNotificationIcon,
} from "./notification-icon";

/**
 * Icons live in a directory of our own so it can be emptied wholesale. It is
 * cleared once per run rather than per notification because Electron reads the
 * icon off disk lazily, and the app holds a single-instance lock, so no other
 * run can be relying on what is already there.
 */
let notificationIconDirectory: Promise<string> | null = null;

const getNotificationIconDirectory = () => {
  notificationIconDirectory ??= (async () => {
    const directory = path.join(
      SystemPath.getPath("temp"),
      "hydra-notifications"
    );

    await fs.promises.rm(directory, { recursive: true, force: true });
    await fs.promises.mkdir(directory, { recursive: true });

    return directory;
  })();

  return notificationIconDirectory;
};

const getStaticImage = async (imagePath: string, removeSource = true) => {
  try {
    return await transcodeNotificationIcon(
      imagePath,
      await getNotificationIconDirectory()
    );
  } catch (error) {
    logger.error("Failed to transcode notification icon", imagePath, error);
    return undefined;
  } finally {
    // Downloaded inputs can be removed; shared local icons must be preserved.
    if (removeSource) {
      await fs.promises.unlink(imagePath).catch(() => undefined);
    }
  }
};

async function downloadImage(url: string | null, signal?: AbortSignal) {
  if (signal?.aborted) return undefined;
  if (!url) return undefined;
  if (url.startsWith("local:")) {
    const image = await getStaticImage(url.slice("local:".length), false);
    return signal?.aborted ? undefined : image;
  }
  if (!url.startsWith("http")) return undefined;

  const fileName = buildDownloadFileName(url);
  const outputPath = path.join(await getNotificationIconDirectory(), fileName);
  const writer = fs.createWriteStream(outputPath);

  const response = await axios.get(url, {
    responseType: "stream",
    signal,
  });

  return new Promise<string | undefined>((resolve) => {
    let settled = false;
    const finish = (value: string | undefined) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      resolve(value);
    };
    const discardDownload = () =>
      fs.promises.unlink(outputPath).catch(() => undefined);
    const onAbort = () => {
      writer.destroy();
      void discardDownload();
      finish(undefined);
    };

    signal?.addEventListener("abort", onAbort, { once: true });
    writer.on("finish", async () => {
      const staticImagePath = await getStaticImage(outputPath);
      finish(signal?.aborted ? undefined : staticImagePath);
    });
    writer.on("error", () => {
      if (!signal?.aborted) logger.error("Failed to download image", { url });
      void discardDownload();
      finish(undefined);
    });
    response.data.pipe(writer);
  });
}

// Exported separately: game-artwork.test.cjs runs the declaration as a script.
export { downloadImage };
