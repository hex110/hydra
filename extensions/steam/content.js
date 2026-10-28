// Adds Hydra Plus buttons to game pages: Steam's store, and the databases and
// review sites that list the same games. The buttons are plain links to Hydra
// Plus's own URL scheme, so the browser asks once before opening it. The icon
// shows whether the game is in the library or installed, as reported by the
// running app.
const api = globalThis.browser ?? globalThis.chrome;
const BOX_ID = "hydra-plus-box";
const SVG_NS = "http://www.w3.org/2000/svg";
// How long to wait for a page's own heading before the box floats in a corner.
const FLOAT_AFTER_MS = 3000;

// Paths on a 16x16 grid.
const ICONS = {
  none: "M8 3v10M3 8h10",
  library: "M3 2.5h3v11H3zM7 2.5h3v11H7zM11.2 3.2l2.6.7-2.4 9.4-2.6-.7z",
  installed: "M3 8.5l3.2 3.2L13 4.8",
  unknown: "M8 3v10M3 8h10",
};

const cleanText = (element) =>
  element?.textContent?.replaceAll(/\s+/g, " ").trim() || null;

// Pages repeat their heading for other screen sizes and hold hidden dialogs
// with headings of their own, so only a heading you can see counts.
const findHeading = (selector = "h1") =>
  [...document.querySelectorAll(selector)].find(
    (heading) => heading.getClientRects().length > 0 && cleanText(heading)
  ) ?? null;

const placeAfterHeading = (selector) => (box) => {
  const heading = findHeading(selector);
  heading?.after(box);
  return Boolean(heading);
};

const idFromPath = (pattern) => () => {
  const appId = pattern.exec(globalThis.location.pathname)?.[1];
  return appId ? { appId } : null;
};

// Sites that don't give a Steam app id are looked up by the game's title.
const titleFromPage =
  (pathPattern, readTitle = () => cleanText(findHeading())) =>
  () => {
    if (!pathPattern.test(globalThis.location.pathname)) return null;
    const title = readTitle();
    return title ? { title } : null;
  };

const titleFromOpenGraph = (pattern) => () =>
  pattern
    .exec(
      document.querySelector('meta[property="og:title"]')?.content ?? ""
    )?.[1]
    ?.trim() || null;

// PCGamingWiki's infobox links the game on SteamDB, which gives the exact app.
const readPcGamingWiki = () => {
  if (!document.querySelector(".template-infobox-header")) return null;
  const link = document.querySelector(
    '.infobox-steamdb a[href*="steamdb.info/app/"]'
  );
  const appId = /steamdb\.info\/app\/(\d+)/.exec(link?.href ?? "")?.[1];
  const title = cleanText(findHeading());
  if (appId) return { appId, title };
  return title ? { title } : null;
};

// Keyed by host name without "www.". `read` returns the game on the page
// (`appId` or `title`), or null when this is not a game page or it has not
// rendered yet. `place` puts the box on the page and says whether it could.
const SITES = {
  "store.steampowered.com": {
    variant: "steam",
    read: idFromPath(/^\/app\/(\d+)/),
    place: (box) => {
      const area = document.querySelector(".apphub_OtherSiteInfo");
      area?.prepend(box);
      return Boolean(area);
    },
  },
  "steamdb.info": {
    read: idFromPath(/^\/app\/(\d+)/),
    place: placeAfterHeading(),
  },
  // ProtonDB's title is a styled span, not a heading.
  "protondb.com": {
    read: idFromPath(/^\/app\/(\d+)/),
    place: placeAfterHeading('[class*="GameInfo__Title"]'),
  },
  "pcgamingwiki.com": {
    read: readPcGamingWiki,
    place: placeAfterHeading(),
  },
  "backloggd.com": {
    read: titleFromPage(/^\/games\/[^/]+\/?$/, () =>
      cleanText(findHeading(".game-title-section h1"))
    ),
    place: placeAfterHeading(".game-title-section h1"),
  },
  "opencritic.com": {
    read: titleFromPage(/^\/game\/\d+\//),
    place: placeAfterHeading(),
  },
  "metacritic.com": {
    read: titleFromPage(/^\/game\/[^/]+(\/|$)/),
    place: placeAfterHeading(),
  },
  "isthereanydeal.com": {
    read: titleFromPage(/^\/game\/[^/]+\//),
    place: placeAfterHeading(),
  },
  // No usable heading: the title comes from the page's metadata and the box
  // floats.
  "howlongtobeat.com": {
    read: titleFromPage(
      /^\/game\/\d+/,
      titleFromOpenGraph(/^How long is (.+)\? \| HowLongToBeat$/)
    ),
    place: () => false,
  },
};

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

const createButton = (variant, label, title) => {
  const link = document.createElement("a");
  link.className =
    variant === "steam" ? "btnv6_blue_hoverfade btn_medium" : "hydra-plus-btn";
  link.title = title;
  const text = document.createElement("span");
  text.textContent = label;
  link.append(text);
  return link;
};

// The exact Steam app once it is known, else the title for the app to look up.
const linkQuery = ({ appId, title }) =>
  appId
    ? `shop=steam&objectId=${encodeURIComponent(appId)}`
    : `title=${encodeURIComponent(title)}`;

const createBox = (variant, game) => {
  const box = document.createElement("div");
  box.id = BOX_ID;
  box.className = "hydra-plus-box";
  box.dataset.variant = variant;

  const status = document.createElement("span");
  status.className = "hydra-plus-box__status";
  box.append(status);

  const download = createButton(
    variant,
    api.i18n.getMessage("downloadButton"),
    api.i18n.getMessage("downloadTooltip")
  );
  const open = createButton(
    variant,
    api.i18n.getMessage("openButton"),
    api.i18n.getMessage("openTooltip")
  );
  box.append(download, open);

  const setTarget = (target) => {
    const query = linkQuery(target);
    download.href = `hydraplus://download?${query}`;
    open.href = `hydraplus://game?${query}`;
  };
  setTarget(game);

  // Hydra Plus is not running when the state is unknown: both buttons still
  // work, since the links start it.
  const render = ({ state, appId, name }) => {
    // The app is running and has no such game on Steam: nothing to offer.
    box.hidden = state === "nomatch";
    box.dataset.state = state;
    if (appId) setTarget({ appId });

    const label = api.i18n.getMessage(`state_${state}`);
    status.title = name
      ? api.i18n.getMessage("statusWithName", [name, label])
      : label;
    status.replaceChildren(createIcon(state in ICONS ? state : "unknown"));
    download.hidden = state === "installed";
  };
  render({ state: "unknown" });

  return { box, render };
};

const site = SITES[globalThis.location.hostname.replace(/^www\./, "")] ?? null;
const gameKey = (game) => game.appId ?? `title:${game.title}`;

// When the page's heading was first looked for, for the game being shown.
let waiting = null;
let retry = null;
let refreshCurrent = null;

const lookup = async (game) => {
  const result = await api.runtime
    .sendMessage({ type: "lookup", appId: game.appId, title: game.title })
    .catch(() => null);
  return result ?? { state: "unknown" };
};

const mountBox = (box) => {
  if (site.place(box)) {
    box.classList.remove("hydra-plus-box--floating");
    return true;
  }
  const { key } = box.dataset;
  if (waiting?.key !== key) waiting = { key, since: Date.now() };
  if (Date.now() - waiting.since < FLOAT_AFTER_MS) return false;

  box.classList.add("hydra-plus-box--floating");
  // Moving a box that already floats would trigger the observer again.
  if (box.parentElement !== document.body) document.body.append(box);
  return true;
};

const sync = () => {
  const existing = document.getElementById(BOX_ID);
  const game = site.read();

  if (!game) {
    existing?.remove();
    waiting = null;
    return;
  }

  if (existing?.dataset.key === gameKey(game)) {
    // A box that floated moves into the page once the page has a heading.
    if (existing.classList.contains("hydra-plus-box--floating")) {
      mountBox(existing);
    }
    return;
  }

  existing?.remove();
  const { box, render } = createBox(site.variant ?? "page", game);
  box.dataset.key = gameKey(game);

  if (!mountBox(box)) {
    clearTimeout(retry);
    retry = setTimeout(sync, FLOAT_AFTER_MS);
    return;
  }

  refreshCurrent = async () => render(await lookup(game));
  void refreshCurrent();
};

if (site) {
  sync();
  // The state changes while the app is used in another window.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && document.getElementById(BOX_ID)) {
      void refreshCurrent?.();
    }
  });
  // These sites are single-page apps that draw the game after the page loads
  // and swap it without reloading, so keep watching.
  let queued = null;
  new MutationObserver(() => {
    clearTimeout(queued);
    queued = setTimeout(sync, 200);
  }).observe(document.documentElement, { childList: true, subtree: true });
}
