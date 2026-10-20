export interface GameNewsItem {
  id: string;
  appId: string;
  title: string;
  url: string;
  author: string;
  /** ISO date. */
  date: string;
  /** Plain text from the start of the post. */
  snippet: string;
  imageUrl: string | null;
}

interface SteamNewsResponse {
  appnews?: {
    newsitems?: {
      gid?: string;
      title?: string;
      url?: string;
      author?: string;
      contents?: string;
      date?: number;
    }[];
  };
}

const STEAM_CLAN_IMAGE_URL = "https://clan.akamai.steamstatic.com/images";
const SNIPPET_LENGTH = 220;

const decodeEntities = (value: string) =>
  value
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/** The first picture in a post, from BBCode, HTML or a Steam clan image. */
export const getSteamNewsImage = (contents: string): string | null => {
  const match =
    /\[img(?:\s+src=)?["']?([^"'\]\s]+)["']?\]/i.exec(contents) ??
    /<img[^>]+src=["']([^"']+)["']/i.exec(contents);
  if (!match) return null;

  const url = match[1].replace("{STEAM_CLAN_IMAGE}", STEAM_CLAN_IMAGE_URL);
  return url.startsWith("https://") ? url : null;
};

/** Plain text of a post: BBCode, HTML, links and images removed. */
export const getSteamNewsSnippet = (
  contents: string,
  length = SNIPPET_LENGTH
): string => {
  const text = decodeEntities(
    contents
      .replace(/\[img[^\]]*\][^[]*\[\/img\]/gi, " ")
      .replace(/\[previewyoutube[^\]]*\][^[]*\[\/previewyoutube\]/gi, " ")
      .replace(/\[\/?(p|h\d|list|olist|\*|tr|td|th|table)[^\]]*\]/gi, " ")
      .replace(/\[[^\]]*\]/g, "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\{STEAM_CLAN_IMAGE\}\S*/g, " ")
      .replace(/https?:\/\/\S+/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();

  if (text.length <= length) return text;
  const cut = text.slice(0, length);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > length * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
};

export const parseSteamNews = (
  response: unknown,
  appId: string
): GameNewsItem[] => {
  const items = (response as SteamNewsResponse | null)?.appnews?.newsitems;
  if (!Array.isArray(items)) return [];

  return items.flatMap((item) => {
    if (!item.gid || !item.title || !item.url || !item.date) return [];
    if (!item.url.startsWith("https://")) return [];
    const contents = item.contents ?? "";
    return [
      {
        id: item.gid,
        appId,
        title: decodeEntities(item.title),
        url: item.url,
        author: item.author ?? "",
        date: new Date(item.date * 1000).toISOString(),
        snippet: getSteamNewsSnippet(contents),
        imageUrl: getSteamNewsImage(contents),
      },
    ];
  });
};
