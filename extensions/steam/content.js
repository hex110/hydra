// Adds Hydra Plus buttons next to the Community Hub button on Steam store
// pages. The buttons are plain links to Hydra Plus's own URL scheme, so the
// browser asks once before opening it. The icon shows whether the game is in
// the library or installed, as reported by the running app.
const api = globalThis.browser ?? globalThis.chrome;
const BOX_ID = "hydra-plus-box";
const SVG_NS = "http://www.w3.org/2000/svg";

// Paths on a 16x16 grid.
const ICONS = {
  none: "M8 3v10M3 8h10",
  library: "M3 2.5h3v11H3zM7 2.5h3v11H7zM11.2 3.2l2.6.7-2.4 9.4-2.6-.7z",
  installed: "M3 8.5l3.2 3.2L13 4.8",
  unknown: "M8 3v10M3 8h10",
};

const getAppId = () =>
  /^\/app\/(\d+)/.exec(globalThis.location.pathname)?.[1] ?? null;

const createIcon = (state) => {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("class", "hydra-plus-box__icon");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", ICONS[state]);
  svg.append(path);
  return svg;
};

const createButton = (label, title, href) => {
  const link = document.createElement("a");
  link.className = "btnv6_blue_hoverfade btn_medium";
  link.href = href;
  link.title = title;
  const text = document.createElement("span");
  text.textContent = label;
  link.append(text);
  return link;
};

const createBox = (appId) => {
  const box = document.createElement("div");
  box.id = BOX_ID;
  box.className = "hydra-plus-box";

  const status = document.createElement("span");
  status.className = "hydra-plus-box__status";
  box.append(status);

  const query = `shop=steam&objectId=${appId}`;
  const download = createButton(
    api.i18n.getMessage("downloadButton"),
    api.i18n.getMessage("downloadTooltip"),
    `hydraplus://download?${query}`
  );
  const open = createButton(
    api.i18n.getMessage("openButton"),
    api.i18n.getMessage("openTooltip"),
    `hydraplus://game?${query}`
  );
  box.append(download, open);

  // Hydra Plus is not running when the state is unknown: both buttons still
  // work, since the links start it.
  const render = (state) => {
    box.dataset.state = state;
    status.title = api.i18n.getMessage(`state_${state}`);
    status.replaceChildren(createIcon(state));
    download.hidden = state === "installed";
  };
  render("unknown");

  return { box, render };
};

const insertBox = () => {
  const appId = getAppId();
  const area = document.querySelector(".apphub_OtherSiteInfo");
  if (!appId || !area || document.getElementById(BOX_ID)) return;

  const { box, render } = createBox(appId);
  area.prepend(box);

  const refresh = async () => {
    const state = await api.runtime
      .sendMessage({ type: "gameState", appId })
      .catch(() => "unknown");
    render(state ?? "unknown");
  };
  void refresh();
  // The state changes while the app is used in another window.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void refresh();
  });
};

insertBox();
