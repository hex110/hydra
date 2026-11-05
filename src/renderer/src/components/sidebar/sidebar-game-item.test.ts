import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { it } from "node:test";
import { JSDOM } from "jsdom";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import type { LibraryGame } from "@types";
import {
  getGameCatalogueIdentity,
  getLibraryGameMembers,
  getLibraryOperationalGame,
  groupLibraryGames,
} from "../../../../shared/library-catalogue.js";
import {
  getLibraryPresentationBadgeSource,
  getLibraryPresentationImportSources,
} from "../../pages/library/library-category.js";

const requireModule = createRequire(import.meta.url);
const filename = "src/renderer/src/components/sidebar/sidebar-game-item.tsx";
const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  },
  fileName: filename,
});
const stubs: Record<string, unknown> = {
  "@shared": {
    getGameCatalogueIdentity,
    getLibraryGameMembers,
    getLibraryOperationalGame,
  },
  "@renderer/hooks": {
    useAppSelector: () => ({}),
    useToast: () => ({ showWarningToast: () => {} }),
  },
  "@renderer/helpers": {
    isGameInstalled: (game: LibraryGame) => Boolean(game.executablePath),
    launchesThroughSteam: (game: LibraryGame) =>
      game.shop === "steam" && /steamapps/.test(game.executablePath ?? ""),
  },
  "@renderer/context": {
    useCollectionContextMenu: () => ({ openCollectionContextMenu: () => {} }),
  },
  "@renderer/pages/library/library-category": {
    getLibraryPresentationBadgeSource,
    getLibraryPresentationImportSources,
  },
  "react-router-dom": {
    useLocation: () => ({ pathname: "/game/steam/123" }),
  },
  "react-i18next": { useTranslation: () => ({ t: (key: string) => key }) },
  "..": {
    ConfirmationModal: () => null,
    GameContextMenu: () => null,
    SteamIcon: () => React.createElement("svg", { "data-steam-icon": true }),
    SteamLibraryBadge: () => null,
    useGameActions: () => ({ canPlay: true, rpcs3ConfirmPending: null }),
  },
};
const exports: Record<string, React.ElementType> = {};
new Function("exports", "require", outputText)(exports, (name: string) => {
  if (name.endsWith(".svg?react")) {
    return function StoreLogo(props: Record<string, unknown>) {
      return React.createElement("svg", {
        ...props,
        "data-store-logo": name.includes("epic") ? "epic" : "steam",
      });
    };
  }
  return stubs[name] ?? requireModule(name);
});

const epic: LibraryGame = {
  id: "epic:namespace:game",
  shop: "epic",
  objectId: "namespace:game",
  title: "Game",
  iconUrl: null,
  logoImageUrl: null,
  libraryHeroImageUrl: null,
  remoteId: null,
  download: null,
  isDeleted: false,
  playTimeInMilliseconds: 0,
  lastTimePlayed: null,
  canonicalId: "canonical-game",
  catalogueGame: { shop: "steam", objectId: "123" },
  availableShops: ["steam", "epic"],
};

it("keeps the Epic sidebar fallback while navigating to its Steam catalogue", () => {
  const [game] = groupLibraryGames([epic]);
  const dom = new JSDOM(
    renderToStaticMarkup(
      React.createElement(exports.SidebarGameItem, {
        game,
        handleSidebarGameClick: () => {},
        getGameTitle: (item: LibraryGame) => item.title,
      })
    )
  );
  try {
    assert.ok(dom.window.document.querySelector('[data-store-logo="epic"]'));
    assert.equal(
      dom.window.document.querySelector('[data-store-logo="steam"]'),
      null
    );
    assert.ok(dom.window.document.querySelector(".sidebar__menu-item--active"));
  } finally {
    dom.window.close();
  }
});

it("grays out games that are in the library but not installed", () => {
  const render = (game: LibraryGame) => {
    const dom = new JSDOM(
      renderToStaticMarkup(
        React.createElement(exports.SidebarGameItem, {
          game,
          handleSidebarGameClick: () => {},
          getGameTitle: (item: LibraryGame) => item.title,
        })
      )
    );
    const notInstalled = Boolean(
      dom.window.document.querySelector(".sidebar__menu-item--not-installed")
    );
    dom.window.close();
    return notInstalled;
  };

  assert.equal(render(epic), true);
  assert.equal(render({ ...epic, executablePath: "/games/game.exe" }), false);
});

const steamGame: LibraryGame = {
  ...epic,
  id: "steam:123",
  shop: "steam",
  objectId: "123",
  catalogueGame: undefined,
  availableShops: ["steam"],
  hasActiveSteamImport: true,
};

const renderRow = (game: LibraryGame, props: Record<string, unknown> = {}) => {
  const [presentation] = groupLibraryGames([game]);
  const dom = new JSDOM(
    renderToStaticMarkup(
      React.createElement(exports.SidebarGameItem, {
        game: presentation,
        handleSidebarGameClick: () => {},
        getGameTitle: (item: LibraryGame) => item.title,
        ...props,
      })
    )
  );
  return dom.window.document;
};

it("marks the running game, and shows the mods icon only when modded", () => {
  const idle = renderRow(steamGame);
  assert.equal(idle.querySelector(".sidebar__menu-item--playing"), null);

  const playing = renderRow(steamGame, { playingGameId: "steam:123" });
  assert.ok(playing.querySelector(".sidebar__menu-item--playing"));
  assert.equal(playing.querySelector(".sidebar__game-modded-icon"), null);

  const modded = renderRow(steamGame, {
    playingGameId: "steam:123",
    playingModded: true,
  });
  assert.ok(modded.querySelector(".sidebar__game-modded-icon"));

  const other = renderRow(steamGame, {
    playingGameId: "steam:999",
    playingModded: true,
  });
  assert.equal(other.querySelector(".sidebar__menu-item--playing"), null);
  assert.equal(other.querySelector(".sidebar__game-modded-icon"), null);
});

it("shows a Steam mark for Steam-owned games and says when Steam launches them", () => {
  const owned = renderRow(steamGame);
  const mark = owned.querySelector(".sidebar__game-steam-icon");
  assert.equal(mark?.getAttribute("title"), "owned_on_steam");

  const viaSteam = renderRow({
    ...steamGame,
    executablePath: "/steam/steamapps/common/Game/game.exe",
  });
  assert.equal(
    viaSteam.querySelector(".sidebar__game-steam-icon")?.getAttribute("title"),
    "opens_through_steam"
  );

  assert.equal(
    renderRow({ ...steamGame, hasActiveSteamImport: false }).querySelector(
      ".sidebar__game-steam-icon"
    ),
    null
  );
});
