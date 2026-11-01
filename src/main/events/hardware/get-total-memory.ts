import os from "node:os";

import { registerEvent } from "../register-event";

registerEvent("getTotalMemory", async () => os.totalmem());
