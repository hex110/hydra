import { isRedistributablePath } from "./game-executable-ranking.js";
import { titleTokens } from "../../shared/title-matching.js";

export interface ExecutableFileCandidate {
  /** Path relative to the game folder, with either separator. */
  relativePath: string;
  sizeInBytes: number;
}

const NON_GAME_NAME =
  /(^unins\d*|uninstall|setup|install|launcher_?updater|updater|crash|report|helper|config|settings|server|editor|benchmark|touchup|cleanup|cefprocess|webhelper|dxsetup|vc_?redist|prereq|activation|register|redmod|modtools?)/i;

const segmentsOf = (relativePath: string) =>
  relativePath.split(/[\\/]/).filter(Boolean);

const scoreCandidate = (
  candidate: ExecutableFileCandidate,
  titleWords: Set<string>,
  largestSize: number
) => {
  const segments = segmentsOf(candidate.relativePath);
  const fileName = segments.at(-1) ?? "";
  const stem = fileName.replace(/\.exe$/i, "");
  let score = 0;

  // Prefer executables near the top of the game folder.
  score -= (segments.length - 1) * 1.5;

  // Unreal shipping binaries are the real game; their bootstrap at the root
  // is preferred when it exists because it sets up the working directory.
  if (/-win64-shipping$/i.test(stem)) score -= 0.5;
  if (/launcher/i.test(stem)) score -= 2;

  const stemWords = titleTokens(stem.replaceAll(/([a-z])([A-Z])/g, "$1 $2"));
  const sharedWords = stemWords.filter((word) => titleWords.has(word)).length;
  if (stemWords.length > 0) score += (4 * sharedWords) / stemWords.length;

  if (largestSize > 0) score += (2 * candidate.sizeInBytes) / largestSize;

  return score;
};

/**
 * Picks the most likely game executable in a folder whose game is not in the
 * executable catalogue. Installers, redistributables and tools are ignored.
 */
export const guessGameExecutable = (
  candidates: ExecutableFileCandidate[],
  title: string
): string | null => {
  const playable = candidates.filter((candidate) => {
    const fileName = segmentsOf(candidate.relativePath).at(-1) ?? "";
    return (
      /\.exe$/i.test(fileName) &&
      !isRedistributablePath(candidate.relativePath) &&
      !NON_GAME_NAME.test(fileName)
    );
  });

  if (playable.length === 0) return null;
  if (playable.length === 1) return playable[0].relativePath;

  const titleWords = new Set(titleTokens(title));
  const largestSize = Math.max(...playable.map((c) => c.sizeInBytes));

  return playable
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(candidate, titleWords, largestSize),
    }))
    .sort((a, b) => b.score - a.score)[0].candidate.relativePath;
};
