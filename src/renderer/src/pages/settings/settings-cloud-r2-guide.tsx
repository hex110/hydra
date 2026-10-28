import { useTranslation } from "react-i18next";
import { CopyIcon } from "@primer/octicons-react";
import { Button, Modal } from "@renderer/components";
import { useToast } from "@renderer/hooks";

import "./settings-cloud.scss";

const R2_DASHBOARD_URL =
  "https://dash.cloudflare.com/?to=/:account/r2/overview";

const BUCKET_NAME = "hydra-saves";
const INSTALL_COMMAND = "sudo pacman -S rclone";
const CHECK_COMMAND = `rclone lsf r2:${BUCKET_NAME}`;
const REMOTE_CONFIG = `[r2]
type = s3
provider = Cloudflare
access_key_id = <ACCESS_KEY_ID>
secret_access_key = <SECRET_ACCESS_KEY>
endpoint = https://<ACCOUNT_ID>.r2.cloudflarestorage.com
acl = private
no_check_bucket = true`;

function CodeBlock({ code }: Readonly<{ code: string }>) {
  const { t } = useTranslation("settings");
  const { showSuccessToast } = useToast();

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    showSuccessToast(t("cloud_copied"));
  };

  return (
    <div className="settings-cloud__code">
      <pre>
        <code>{code}</code>
      </pre>
      <Button
        theme="outline"
        onClick={() => void copy()}
        aria-label={t("cloud_copy")}
      >
        <CopyIcon size={14} />
      </Button>
    </div>
  );
}

interface CloudR2GuideModalProps {
  visible: boolean;
  onClose: () => void;
}

export function CloudR2GuideModal({
  visible,
  onClose,
}: Readonly<CloudR2GuideModalProps>) {
  const { t } = useTranslation("settings");

  return (
    <Modal
      visible={visible}
      title={t("cloud_r2_guide_title")}
      description={t("cloud_r2_guide_intro")}
      onClose={onClose}
      large
    >
      <ol className="settings-cloud__steps">
        <li>
          <h4>{t("cloud_r2_step_enable_title")}</h4>
          <p>{t("cloud_r2_step_enable_body")}</p>
          <div>
            <Button
              theme="outline"
              onClick={() => window.electron.openExternal(R2_DASHBOARD_URL)}
            >
              {t("cloud_r2_open_dashboard")}
            </Button>
          </div>
        </li>
        <li>
          <h4>{t("cloud_r2_step_bucket_title")}</h4>
          <p>{t("cloud_r2_step_bucket_body")}</p>
          <CodeBlock code={BUCKET_NAME} />
        </li>
        <li>
          <h4>{t("cloud_r2_step_token_title")}</h4>
          <p>{t("cloud_r2_step_token_body")}</p>
        </li>
        <li>
          <h4>{t("cloud_r2_step_rclone_title")}</h4>
          <p>{t("cloud_r2_step_rclone_body")}</p>
          <CodeBlock code={INSTALL_COMMAND} />
          <p>{t("cloud_r2_step_rclone_other")}</p>
        </li>
        <li>
          <h4>{t("cloud_r2_step_remote_title")}</h4>
          <p>{t("cloud_r2_step_remote_body")}</p>
          <CodeBlock code={REMOTE_CONFIG} />
        </li>
        <li>
          <h4>{t("cloud_r2_step_check_title")}</h4>
          <CodeBlock code={CHECK_COMMAND} />
          <p>{t("cloud_r2_step_check_body")}</p>
        </li>
        <li>
          <h4>{t("cloud_r2_step_hydra_title")}</h4>
          <p>{t("cloud_r2_step_hydra_body")}</p>
        </li>
      </ol>
      <p className="settings-cloud__warning">{t("cloud_r2_secret_warning")}</p>
    </Modal>
  );
}
