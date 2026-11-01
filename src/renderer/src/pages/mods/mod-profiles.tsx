import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button, SelectField, TextField } from "@renderer/components";
import type { GameMods, GameShop, ModActionResult } from "@types";

interface ModProfilesProps {
  shop: GameShop;
  objectId: string;
  gameMods: GameMods;
  busy: boolean;
  run: (action: () => Promise<ModActionResult | null>) => Promise<void>;
}

/** Saved mod lists, like Mod Organizer's profiles: switching redeploys. */
export function ModProfiles({
  shop,
  objectId,
  gameMods,
  busy,
  run,
}: Readonly<ModProfilesProps>) {
  const { t } = useTranslation("mods");
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const { profiles, activeProfileId } = gameMods;

  const create = async () => {
    await run(() =>
      window.electron.createModProfile(
        shop,
        objectId,
        name,
        t("profile_default")
      )
    );
    setNaming(false);
    setName("");
  };

  return (
    <div className="mods__profiles">
      {profiles.length > 0 && (
        <SelectField
          label={t("profile")}
          theme="dark"
          value={activeProfileId ?? ""}
          disabled={busy}
          options={profiles.map((profile) => ({
            key: profile.id,
            value: profile.id,
            label: profile.name,
          }))}
          onChange={(event) =>
            void run(() =>
              window.electron.switchModProfile(
                shop,
                objectId,
                event.target.value
              )
            )
          }
        />
      )}
      {naming ? (
        <form
          className="mods__profile-form"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <TextField
            label={t("profile_name")}
            theme="dark"
            value={name}
            placeholder={t("profile_name_placeholder")}
            onChange={(event) => setName(event.target.value)}
          />
          <Button type="submit" disabled={busy || !name.trim()}>
            {t("profile_save")}
          </Button>
          <Button
            type="button"
            theme="outline"
            onClick={() => setNaming(false)}
          >
            {t("profile_cancel")}
          </Button>
        </form>
      ) : (
        <div className="mods__profile-actions">
          <Button
            theme="outline"
            disabled={busy || gameMods.mods.length === 0}
            onClick={() => setNaming(true)}
            title={t("profile_new_hint")}
          >
            {t("profile_new")}
          </Button>
          {profiles.length > 1 && activeProfileId && (
            <Button
              theme="outline"
              disabled={busy}
              onClick={() =>
                void run(() =>
                  window.electron.deleteModProfile(
                    shop,
                    objectId,
                    activeProfileId
                  )
                )
              }
            >
              {t("profile_delete")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
