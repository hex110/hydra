import type { Game } from "@types";

import { isLocalCollectionId } from "../../../shared/local-collections.js";

/** Per-game fields that follow the user between devices; each field's latest edit wins. */
export const PROFILE_FIELDS = [
  "notes",
  "rating",
  "favorite",
  "customDescription",
  "customGenres",
  "isPinned",
  "isConcealed",
  "isHiddenFromOthers",
] as const;

export type ProfileField = (typeof PROFILE_FIELDS)[number];
export type ProfileValues = Pick<Game, ProfileField>;

/** Which collections a game is in is dated like a profile field, under this key. */
export const COLLECTIONS_EDIT_KEY = "collections";
export type ProfileEditKey = ProfileField | typeof COLLECTIONS_EDIT_KEY;

/** Collections kept on this machine; account collections sync through Hydra. */
export const localCollectionIds = (ids: readonly string[] | undefined) =>
  (ids ?? []).filter(isLocalCollectionId);

export const sameIdSet = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((id) => right.includes(id));

/**
 * Dates a value that was set before edits were dated, so a device that has
 * nothing for the field adopts it while two devices that both have one leave
 * each other alone.
 */
export const LEGACY_EDIT_STAMP = new Date(1).toISOString();

const isEmpty = (value: unknown) =>
  value == null ||
  value === "" ||
  value === false ||
  (Array.isArray(value) && value.length === 0);

/** Unset, null, empty and false all mean "nothing here". */
export const sameProfileValue = (left: unknown, right: unknown) =>
  isEmpty(left)
    ? isEmpty(right)
    : JSON.stringify(left) === JSON.stringify(right);

export const hasProfileValue = (value: unknown) => !isEmpty(value);
