import { titleTokens } from "../../shared/title-matching.js";

export interface GuessedInstall {
  folderPath: string;
  executablePath: string;
}

const FILLER_WORDS = new Set(["the", "of", "a", "an", "and"]);

const meaningfulTokens = (text: string) =>
  titleTokens(text).filter((token) => !FILLER_WORDS.has(token));

const folderNameOf = (folderPath: string) =>
  folderPath.split(/[\\/]/).filter(Boolean).at(-1) ?? "";

/**
 * Picks the freshly installed game among folders that each yielded a guess,
 * for games the executable catalogue knows nothing about. A folder named like
 * the game wins; with none, a single guess is trusted only when the folders
 * were already narrowed to what the installer just touched.
 */
export const chooseGuessedInstall = (
  guesses: GuessedInstall[],
  title: string,
  folderWasJustChanged: boolean
): GuessedInstall | null => {
  const titleWords = new Set(meaningfulTokens(title));
  const named = guesses.filter(({ folderPath }) =>
    meaningfulTokens(folderNameOf(folderPath)).some((word) =>
      titleWords.has(word)
    )
  );

  if (named.length === 1) return named[0];
  if (named.length > 1) return null;

  return folderWasJustChanged && guesses.length === 1 ? guesses[0] : null;
};
