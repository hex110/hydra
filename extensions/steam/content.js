// Adds a Hydra Plus box to Steam store pages. The buttons are plain links to
// Hydra Plus's own URL scheme, so the browser asks once before opening it.
const api = globalThis.browser ?? globalThis.chrome;
const BOX_ID = "hydra-plus-box";

const getAppId = () =>
  /^\/app\/(\d+)/.exec(globalThis.location.pathname)?.[1] ?? null;

const createButton = (label, title, href, className) => {
  const link = document.createElement("a");
  link.className = className;
  link.href = href;
  link.title = title;
  const text = document.createElement("span");
  text.textContent = label;
  link.append(text);
  return link;
};

const createBox = (appId, showOpenButton) => {
  const box = document.createElement("div");
  box.id = BOX_ID;
  box.className = "game_area_purchase_game hydra-plus-box";

  const title = document.createElement("h1");
  title.textContent = api.i18n.getMessage("boxTitle");
  box.append(title);

  const actions = document.createElement("div");
  actions.className = "hydra-plus-box__actions";

  const query = `shop=steam&objectId=${appId}`;
  actions.append(
    createButton(
      api.i18n.getMessage("downloadButton"),
      api.i18n.getMessage("downloadTooltip"),
      `hydraplus://download?${query}`,
      "btn_green_steamui btn_medium"
    )
  );
  if (showOpenButton) {
    actions.append(
      createButton(
        api.i18n.getMessage("openButton"),
        api.i18n.getMessage("openTooltip"),
        `hydraplus://game?${query}`,
        "btn_blue_steamui btn_medium"
      )
    );
  }

  box.append(actions);
  return box;
};

const insertBox = async () => {
  const appId = getAppId();
  if (!appId || document.getElementById(BOX_ID)) return;

  const { showOpenButton = true } = await api.storage.sync
    .get({ showOpenButton: true })
    .catch(() => ({}));
  const box = createBox(appId, showOpenButton);

  // Above the first purchase option; next to the title on pages without one.
  const purchaseArea = document.getElementById("game_area_purchase");
  if (purchaseArea) {
    purchaseArea.prepend(box);
    return;
  }
  document.querySelector(".apphub_AppName")?.parentElement?.after(box);
};

void insertBox();
