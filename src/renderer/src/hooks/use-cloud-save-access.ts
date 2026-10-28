import { getCloudSaveAccessAction } from "@shared";
import { useAppSelector } from "./redux";
import { useUserDetails } from "./use-user-details";

/** Whether saves can sync: a self-hosted store, or a Hydra Cloud subscription. */
export function useCloudSaveAccess() {
  const { userDetails, hasActiveSubscription } = useUserDetails();
  const hasSelfHostedStore = useAppSelector((state) =>
    Boolean(state.userPreferences.value?.saveStore)
  );

  return getCloudSaveAccessAction(
    Boolean(userDetails),
    hasActiveSubscription,
    hasSelfHostedStore
  );
}
