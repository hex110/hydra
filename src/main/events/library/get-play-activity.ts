import { getPlayActivity } from "@main/services/play-activity";

import { registerEvent } from "../register-event";

registerEvent("getPlayActivity", (_event, sinceDate: string) =>
  getPlayActivity(sinceDate)
);
