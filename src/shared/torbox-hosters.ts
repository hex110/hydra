/**
 * Hosters Hydra downloads directly that TorBox also fetches as web downloads.
 * Links on any other host stay with their own downloader.
 */
const TORBOX_HOSTER_PREFIXES = [
  "https://gofile.io",
  "https://pixeldrain.com",
  "https://datanodes.to",
  "https://www.mediafire.com",
  "https://mediafire.com",
  "https://fuckingfast.co",
  "https://vikingfile.com",
  "https://vik1ngfile.site",
];

/** Links one TorBox download checks for a cached copy before it settles on one. */
export const TORBOX_MAX_WEB_CANDIDATES = 6;

export const isTorBoxHosterUri = (uri: string): boolean =>
  TORBOX_HOSTER_PREFIXES.some((prefix) => uri.startsWith(prefix));
