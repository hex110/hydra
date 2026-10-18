/**
 * Helpers for matching free-form release and folder names ("Cyberpunk.2077.
 * v2.3-FitGirl", "Hades II [DODI Repack]") against catalogue titles.
 */

const RELEASE_GROUPS = [
  "fitgirl",
  "dodi",
  "elamigos",
  "kaos",
  "xatab",
  "codex",
  "rune",
  "tenoke",
  "skidrow",
  "plaza",
  "empress",
  "goldberg",
  "p2p",
  "gog",
  "darksiders",
  "tinyiso",
  "flt",
  "razor1911",
  "cpy",
  "hoodlum",
  "simplex",
  "anomaly",
  "chronos",
  "dinobytes",
  "steamrip",
  "ankergames",
  "onlinefix",
  "online-fix",
  "repack",
  "repacks",
  "portable",
  "multi",
];

const NOISE_WORDS = new Set([
  ...RELEASE_GROUPS,
  "steam",
  "rip",
  "build",
  "update",
  "updated",
  "hotfix",
  "x64",
  "x86",
  "win64",
  "win32",
  "windows",
  "pc",
  "proper",
  "crack",
  "cracked",
  "fix",
  "incl",
  "dlc",
  "dlcs",
  "bonus",
  "ost",
  "soundtrack",
  "lossless",
  "selective",
  "download",
]);

/** Words that describe a release of a game rather than a different game. */
const EDITION_WORDS = new Set([
  "edition",
  "deluxe",
  "ultimate",
  "complete",
  "definitive",
  "goty",
  "gold",
  "premium",
  "digital",
  "standard",
  "collectors",
  "anniversary",
  "enhanced",
  "special",
  "director",
  "directors",
  "cut",
  "game",
  "of",
  "the",
  "year",
]);

const ROMAN_NUMERALS: Record<string, string> = {
  ii: "2",
  iii: "3",
  iv: "4",
  v: "5",
  vi: "6",
  vii: "7",
  viii: "8",
  ix: "9",
  x: "10",
};

const VERSION_TOKEN = /^(v|ver|version)?\d+([._]\d+)+[a-z]?$|^v\d+[a-z]?$/;
const BUILD_NUMBER_TOKEN = /^(b|build)?\d{5,}$/;

/**
 * Turns a release or folder name into a readable title: separators become
 * spaces and bracketed tags, versions, build numbers and release group names
 * are dropped.
 */
export const cleanReleaseName = (name: string): string => {
  // Before NFKC, which would turn "™" into "TM".
  let value = name.replaceAll(/[™®©]/g, "").normalize("NFKC");

  // Bracketed tags, then everything after a "+" (DLC lists, bonus content).
  // Brackets go first: "[RUS + ENG]" is a tag, not a DLC list.
  value = value.replaceAll(/[[({][^\])}]*[\])}]/g, " ");
  value = value.replace(/\s\+\s.*$/, "");

  const isSpaceless = !/\s/.test(value.trim());

  if (isSpaceless) {
    // Dots inside a version ("1.01") are not separators.
    value = value
      .replaceAll(/(\d)\.(?=\d)/g, "$1\u0000")
      .replaceAll(/[._]+/g, " ")
      .replaceAll("\u0000", ".");
  } else {
    value = value.replaceAll("_", " ");
  }

  // "CH4-1.01-pc": a hyphen before a version or a platform tag separates it.
  value = value.replaceAll(
    /-(?=v?\d+(?:[._]\d+)+(?![\p{L}\d])|(?:pc|win(?:32|64)?|x64|x86|linux)(?![\p{L}\d]))/giu,
    " "
  );

  value = value.replaceAll(/[™®©]/g, "");
  value = value.replace(
    new RegExp(`[-\\s]+(${RELEASE_GROUPS.join("|")})\\b.*$`, "i"),
    ""
  );

  const tokens = value.split(/\s+/).filter(Boolean);
  const kept: string[] = [];

  for (const [index, token] of tokens.entries()) {
    const lower = token.toLowerCase().replace(/^-+|[-:]+$/g, "");
    // Separators such as "–" or "/" between the title and the version.
    if (!/[\p{L}\p{N}]/u.test(lower)) continue;
    if (VERSION_TOKEN.test(lower) || BUILD_NUMBER_TOKEN.test(lower)) break;
    // "V 1.2.3", or "– V 272" after a separator, is a version, not a numeral.
    const next = tokens[index + 1] ?? "";
    const previous = tokens[index - 1] ?? "";
    if (
      /^(v|ver|version)\.?$/.test(lower) &&
      (/^\d+([._]\d+)+/.test(next) ||
        (/^\d/.test(next) && /^[-–—/:|]+$/.test(previous)))
    ) {
      break;
    }
    // Whatever follows "Build" is a build identifier.
    if (lower === "build") break;
    if (NOISE_WORDS.has(lower) || /^multi\d+$/.test(lower)) continue;
    const word = token.replace(/^-+|-+$/g, "");
    // "AceCombat8" → "Ace Combat 8". Uppercase runs ("CH4") and lowercase
    // names ("r2modman") stay intact.
    kept.push(
      isSpaceless && /^[A-Z].*[a-z]/.test(word)
        ? word
            .replaceAll(/([a-z])([A-Z])/g, "$1 $2")
            .replaceAll(/([a-z])(\d)/g, "$1 $2")
        : word
    );
  }

  return kept.join(" ").replaceAll(/\s+/g, " ").trim();
};

/** Lowercase tokens with punctuation removed and roman numerals as digits. */
export const titleTokens = (title: string): string[] =>
  title
    .replaceAll(/[™®©]/g, "")
    .normalize("NFKD")
    .replaceAll(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replaceAll("&", " and ")
    .replaceAll(/['’]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((token) => ROMAN_NUMERALS[token] ?? token);

const stripEditionWords = (tokens: string[]) => {
  let end = tokens.length;
  while (end > 1 && EDITION_WORDS.has(tokens[end - 1])) end -= 1;
  return tokens.slice(0, end);
};

/** A comparison key that ignores punctuation, spacing and edition suffixes. */
export const comparableTitle = (title: string) =>
  stripEditionWords(titleTokens(title)).join("");

/**
 * True when both names refer to the same game. Sequels and spin-offs do not
 * match ("Dishonored" vs "Dishonored 2"), editions do ("Hades" vs "Hades
 * Deluxe Edition").
 */
export const isSameTitle = (a: string, b: string) => {
  const left = comparableTitle(a);
  return left.length > 0 && left === comparableTitle(b);
};

/**
 * Similarity between 0 and 1 based on shared tokens (Dice coefficient), with
 * an exact comparable match scoring 1.
 */
export const titleSimilarity = (a: string, b: string): number => {
  if (isSameTitle(a, b)) return 1;

  const left = stripEditionWords(titleTokens(a));
  const right = stripEditionWords(titleTokens(b));
  if (left.length === 0 || right.length === 0) return 0;

  const remaining = [...right];
  let shared = 0;

  for (const token of left) {
    const index = remaining.indexOf(token);
    if (index !== -1) {
      shared += 1;
      remaining.splice(index, 1);
    }
  }

  return (2 * shared) / (left.length + right.length);
};

/** The app id in a Steam store, community or `steam://` link; null otherwise. */
export const parseSteamStoreLink = (text: string): string | null => {
  const value = text.trim();
  if (!value || /\s/.test(value)) return null;
  const match =
    /^(?:https?:\/\/)?(?:store\.steampowered\.com|steamcommunity\.com|steamdb\.info)\/app\/(\d+)/i.exec(
      value
    ) ?? /^steam:\/\/(?:store|run|rungameid|install)\/(\d+)/i.exec(value);
  return match?.[1] ?? null;
};
