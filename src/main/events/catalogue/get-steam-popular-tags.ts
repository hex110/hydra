import { getSteamPopularTags } from "@main/services/steam-popular-tags";
import { registerEvent } from "../register-event";

registerEvent("getSteamPopularTags", () => getSteamPopularTags());
