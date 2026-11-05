import { getDetectedSpecs } from "@main/services/system-requirements/detect-specs";

import { registerEvent } from "../register-event";

registerEvent("getSystemSpecs", async () => getDetectedSpecs());
