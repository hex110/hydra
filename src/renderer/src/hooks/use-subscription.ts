import { useCallback } from "react";
import { useAppDispatch, useAppSelector } from "./redux";
import {
  setHydraCloudModalVisible,
  setHydraCloudModalHidden,
} from "@renderer/features";
import { HydraCloudFeature } from "@types";

export function useSubscription() {
  const dispatch = useAppDispatch();
  // Hydra Cloud is an account feature: nothing to offer while signed out.
  const isSignedIn = useAppSelector(
    (state) => state.userDetails.userDetails !== null
  );

  const { isHydraCloudModalVisible, feature } = useAppSelector(
    (state) => state.subscription
  );

  const showHydraCloudModal = useCallback(
    (feature: HydraCloudFeature) => {
      if (!isSignedIn) return;
      dispatch(setHydraCloudModalVisible(feature));
    },
    [dispatch, isSignedIn]
  );

  const hideHydraCloudModal = useCallback(() => {
    dispatch(setHydraCloudModalHidden());
  }, [dispatch]);

  return {
    isHydraCloudModalVisible,
    hydraCloudFeature: feature,
    showHydraCloudModal,
    hideHydraCloudModal,
  };
}
