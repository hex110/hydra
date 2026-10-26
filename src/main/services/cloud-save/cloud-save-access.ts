import {
  getCloudSaveAccessAction,
  SubscriptionRequiredError,
  UserNotLoggedInError,
} from "@shared";

import { HydraApi } from "../hydra-api";
import { isSelfHostedSaveStoreActive } from "./save-store";

export const canAccessCloudSaves = (
  isLoggedIn: boolean,
  hasActiveSubscription: boolean
) =>
  getCloudSaveAccessAction(
    isLoggedIn,
    hasActiveSubscription,
    isSelfHostedSaveStoreActive()
  ) === "open";

export const assertCloudSaveSubscription = (
  isLoggedIn = HydraApi.isLoggedIn(),
  hasActiveSubscription = HydraApi.hasActiveSubscription()
) => {
  if (isSelfHostedSaveStoreActive()) return;
  if (!isLoggedIn) {
    throw new UserNotLoggedInError();
  }
  if (!hasActiveSubscription) {
    throw new SubscriptionRequiredError();
  }
};
