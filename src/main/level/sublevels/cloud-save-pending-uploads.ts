import { db } from "../level";
import { levelKeys } from "./keys";

/** Games whose upload after exit has not finished, by game key. */
export const cloudSavePendingUploadsSublevel = db.sublevel<
  string,
  { shop: string; objectId: string; since: string }
>(levelKeys.cloudSavePendingUploads, { valueEncoding: "json" });
