import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { PersonIcon } from "@primer/octicons-react";
import { AuthPage } from "@shared";
import { Button, ConfirmationModal } from "@renderer/components";
import { useToast, useUserDetails } from "@renderer/hooks";
import HydraLogo from "@renderer/assets/icons/hydra.svg?react";

import { SettingsIntegrationCard } from "./settings-integration-card";

/** Signing in to Hydra is optional in Hydra Plus; this is where it lives. */
export function SettingsHydraAccount() {
  const { t } = useTranslation("settings");
  const { t: tProfile } = useTranslation("user_profile");
  const navigate = useNavigate();
  const { userDetails, signOut } = useUserDetails();
  const { showSuccessToast } = useToast();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  return (
    <>
      <SettingsIntegrationCard
        title={t("hydra_account_title")}
        logo={<HydraLogo />}
        status={
          userDetails
            ? t("hydra_account_signed_in")
            : t("hydra_account_signed_out")
        }
        statusTone={userDetails ? "success" : "neutral"}
        actions={
          userDetails ? (
            <>
              <Button
                theme="outline"
                onClick={() => navigate(`/profile/${userDetails.id}`)}
              >
                {tProfile("see_profile")}
              </Button>
              <Button theme="danger" onClick={() => setConfirmSignOut(true)}>
                {tProfile("sign_out")}
              </Button>
            </>
          ) : (
            <Button
              onClick={() => window.electron.openAuthWindow(AuthPage.SignIn)}
            >
              {t("hydra_account_sign_in")}
            </Button>
          )
        }
      >
        {userDetails ? (
          <div className="settings-integration-card__profile">
            <div className="settings-integration-card__avatar">
              {userDetails.profileImageUrl && !avatarError ? (
                <img
                  src={userDetails.profileImageUrl}
                  alt={userDetails.displayName}
                  onError={() => setAvatarError(true)}
                />
              ) : (
                <PersonIcon size={28} />
              )}
            </div>
            <div className="settings-integration-card__account">
              <span className="settings-integration-card__username">
                {userDetails.displayName}
              </span>
              <span className="settings-integration-card__meta">
                {t("hydra_account_signed_in_description")}
              </span>
            </div>
          </div>
        ) : (
          <p className="settings-integration-card__description">
            {t("hydra_account_description")}
          </p>
        )}
      </SettingsIntegrationCard>

      <ConfirmationModal
        visible={confirmSignOut}
        title={tProfile("sign_out_modal_title")}
        descriptionText={tProfile("sign_out_modal_text")}
        confirmButtonLabel={tProfile("sign_out")}
        cancelButtonLabel={t("cancel")}
        confirmButtonTheme="danger"
        buttonsIsDisabled={isSigningOut}
        onConfirm={async () => {
          setIsSigningOut(true);
          try {
            await signOut();
            showSuccessToast(tProfile("successfully_signed_out"));
          } finally {
            setIsSigningOut(false);
            setConfirmSignOut(false);
          }
        }}
        onClose={() => setConfirmSignOut(false)}
      />
    </>
  );
}
