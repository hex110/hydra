import { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { CopyIcon } from "@primer/octicons-react";
import { Button, Modal, TextField } from "@renderer/components";
import { settingsContext } from "@renderer/context";
import { useToast } from "@renderer/hooks";
import type { SaveStoreConfig } from "@types";

import "./settings-cloud.scss";

const R2_DASHBOARD_URL =
  "https://dash.cloudflare.com/?to=/:account/r2/overview";

const BUCKET_NAME = "hydra-saves";

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

/**
 * Turns the R2 keys into an rclone remote (rclone.conf holds them, as with a
 * remote made by hand) and turns save sync on with it.
 */
function R2ConnectForm({ onConnected }: Readonly<{ onConnected: () => void }>) {
  const { t } = useTranslation("settings");
  const { updateUserPreferences } = useContext(settingsContext);
  const { showSuccessToast, showErrorToast } = useToast();
  const [accountId, setAccountId] = useState("");
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [bucket, setBucket] = useState(BUCKET_NAME);
  const [busy, setBusy] = useState(false);

  const connect = async () => {
    setBusy(true);
    try {
      if (!(await window.electron.isRcloneAvailable()))
        await window.electron.installRclone();
      const remote = await window.electron.createR2Remote({
        accountId,
        accessKeyId,
        secretAccessKey,
      });
      const config: SaveStoreConfig = {
        kind: "rclone",
        remote: `${remote}:${bucket.trim()}`,
      };
      await window.electron.testSaveStore(config);
      await updateUserPreferences({ saveStore: config });
      showSuccessToast(t("cloud_r2_connected"));
      onConnected();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      showErrorToast(
        t(
          message.includes("r2_account_id")
            ? "cloud_r2_bad_account_id"
            : "cloud_r2_connect_failed"
        )
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-cloud__form">
      <TextField
        label={t("cloud_r2_account_id")}
        hint={t("cloud_r2_account_id_hint")}
        value={accountId}
        onChange={(event) => setAccountId(event.target.value)}
        theme="dark"
      />
      <TextField
        label={t("cloud_r2_access_key_id")}
        value={accessKeyId}
        onChange={(event) => setAccessKeyId(event.target.value)}
        theme="dark"
      />
      <TextField
        label={t("cloud_r2_secret_access_key")}
        type="password"
        value={secretAccessKey}
        onChange={(event) => setSecretAccessKey(event.target.value)}
        theme="dark"
      />
      <TextField
        label={t("cloud_r2_bucket")}
        value={bucket}
        onChange={(event) => setBucket(event.target.value)}
        theme="dark"
      />
      <div>
        <Button
          disabled={
            busy ||
            !accountId.trim() ||
            !accessKeyId.trim() ||
            !secretAccessKey.trim() ||
            !bucket.trim()
          }
          onClick={() => void connect()}
        >
          {busy ? t("cloud_r2_connecting") : t("cloud_r2_connect")}
        </Button>
      </div>
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
          <h4>{t("cloud_r2_step_connect_title")}</h4>
          <p>{t("cloud_r2_step_connect_body")}</p>
          <R2ConnectForm onConnected={onClose} />
          <p>{t("cloud_r2_step_manual")}</p>
        </li>
      </ol>
      <p className="settings-cloud__warning">{t("cloud_r2_secret_warning")}</p>
    </Modal>
  );
}
