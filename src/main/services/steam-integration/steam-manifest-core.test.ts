import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  findSteamUpdate,
  parseSteamManifestState,
  setSteamManifestBranch,
} from "./steam-manifest-core.ts";

const manifest = (
  options: {
    flags?: number;
    buildId?: string;
    target?: string;
    beta?: string;
    mountedBeta?: string;
    lineBreak?: string;
  } = {}
) =>
  [
    '"AppState"',
    "{",
    '\t"appid"\t\t"457140"',
    '\t"name"\t\t"Oxygen Not Included"',
    `\t"StateFlags"\t\t"${options.flags ?? 4}"`,
    '\t"installdir"\t\t"OxygenNotIncluded"',
    `\t"buildid"\t\t"${options.buildId ?? "100"}"`,
    `\t"TargetBuildID"\t\t"${options.target ?? "0"}"`,
    '\t"AutoUpdateBehavior"\t\t"1"',
    '\t"UserConfig"',
    "\t{",
    '\t\t"language"\t\t"english"',
    ...(options.beta ? [`\t\t"BetaKey"\t\t"${options.beta}"`] : []),
    "\t}",
    '\t"MountedConfig"',
    "\t{",
    '\t\t"language"\t\t"english"',
    ...(options.mountedBeta
      ? [`\t\t"BetaKey"\t\t"${options.mountedBeta}"`]
      : []),
    "\t}",
    "}",
    "",
  ].join(options.lineBreak ?? "\n");

describe("parseSteamManifestState", () => {
  it("reads the state, builds and chosen branch", () => {
    assert.deepEqual(
      parseSteamManifestState(
        manifest({ beta: "public_testing", target: "7" })
      ),
      {
        appId: "457140",
        name: "Oxygen Not Included",
        stateFlags: 4,
        buildId: "100",
        targetBuildId: "7",
        autoUpdateBehavior: 1,
        betaKey: "public_testing",
      }
    );
  });

  it("takes the branch from UserConfig, not MountedConfig", () => {
    const state = parseSteamManifestState(manifest({ mountedBeta: "old" }));
    assert.equal(state.betaKey, null);
  });
});

describe("findSteamUpdate", () => {
  const branches = [
    { name: "public", buildId: "100" },
    { name: "beta", buildId: "200" },
  ];

  it("finds nothing when the installed build is the branch's", () => {
    assert.equal(
      findSteamUpdate(parseSteamManifestState(manifest()), branches),
      null
    );
  });

  it("finds a branch build newer than the installed one", () => {
    const update = findSteamUpdate(
      parseSteamManifestState(manifest({ buildId: "90" })),
      branches
    );
    assert.deepEqual(update, {
      branch: "public",
      installedBuildId: "90",
      availableBuildId: "100",
    });
  });

  it("follows the chosen branch", () => {
    const update = findSteamUpdate(
      parseSteamManifestState(manifest({ beta: "beta" })),
      branches
    );
    assert.equal(update?.availableBuildId, "200");
    assert.equal(update?.branch, "beta");
  });

  it("trusts Steam's own update marks", () => {
    assert.equal(
      findSteamUpdate(parseSteamManifestState(manifest({ flags: 6 })), branches)
        ?.availableBuildId,
      "100"
    );
    assert.equal(
      findSteamUpdate(
        parseSteamManifestState(manifest({ target: "150" })),
        branches
      )?.availableBuildId,
      "150"
    );
  });

  it("ignores apps that are not fully installed and stale caches", () => {
    assert.equal(
      findSteamUpdate(
        parseSteamManifestState(manifest({ flags: 1026 })),
        branches
      ),
      null
    );
    assert.equal(
      findSteamUpdate(
        parseSteamManifestState(manifest({ buildId: "300" })),
        branches
      ),
      null
    );
  });
});

describe("setSteamManifestBranch", () => {
  it("adds the branch and marks the update, touching nothing else", () => {
    const original = manifest();
    const changed = setSteamManifestBranch(original, "public_testing");

    assert.equal(changed, manifest({ flags: 6, beta: "public_testing" }));
  });

  it("replaces an existing branch", () => {
    assert.equal(
      setSteamManifestBranch(manifest({ beta: "a", mountedBeta: "a" }), "b"),
      manifest({ flags: 6, beta: "b", mountedBeta: "a" })
    );
  });

  it("removes the key to return to the default branch", () => {
    assert.equal(
      setSteamManifestBranch(manifest({ beta: "a", mountedBeta: "a" }), null),
      manifest({ flags: 6, mountedBeta: "a" })
    );
    assert.equal(
      setSteamManifestBranch(manifest({ beta: "a" }), "public"),
      manifest({ flags: 6 })
    );
  });

  it("keeps the line endings and existing flags", () => {
    assert.equal(
      setSteamManifestBranch(manifest({ lineBreak: "\r\n", flags: 4 }), "b"),
      manifest({ lineBreak: "\r\n", flags: 6, beta: "b" })
    );
    assert.equal(
      setSteamManifestBranch(manifest({ flags: 6 }), null),
      manifest({ flags: 6 })
    );
  });

  it("adds a UserConfig section when there is none", () => {
    const bare = '"AppState"\n{\n\t"StateFlags"\t\t"4"\n}\n';
    assert.equal(
      setSteamManifestBranch(bare, "beta"),
      '"AppState"\n{\n\t"StateFlags"\t\t"6"\n\t"UserConfig"\n\t{\n\t\t"BetaKey"\t\t"beta"\n\t}\n}\n'
    );
  });

  it("refuses a manifest without StateFlags", () => {
    assert.equal(setSteamManifestBranch('"AppState"\n{\n}\n', "beta"), null);
  });
});
