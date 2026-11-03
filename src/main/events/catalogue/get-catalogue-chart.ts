import type { CatalogueChartRequest } from "@shared";
import { getCatalogueChart } from "@main/services/catalogue-charts";
import { getProtonDbTiers } from "@main/services/protondb";
import { registerEvent } from "../register-event";

registerEvent("getCatalogueChart", (_event, request: CatalogueChartRequest) =>
  getCatalogueChart(request)
);

registerEvent("getProtonDbTiers", (_event, appIds: string[]) =>
  getProtonDbTiers(Array.isArray(appIds) ? appIds.slice(0, 500) : [])
);
