import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { XIcon } from "@primer/octicons-react";
import cn from "classnames";
import type { GroupGame, GroupProposal } from "@shared";

import { Button, Modal, TextField } from "@renderer/components";
import { useFormat } from "@renderer/hooks";
import { logger } from "@renderer/logger";

import { getGroupName } from "./recommendation-card";
import { useSteamTagLabels } from "./use-steam-tag-labels";
import { useTuneSettings } from "./use-tune-settings";
import "./group-proposals-modal.scss";

const MAX_PICKED = 3;
const MATCHES = 8;

type Request = { kind: "refine"; groupId: string } | { kind: "around" };

interface GroupProposalsModalProps {
  request: Request;
  /** Refine: the group's name, for the title. */
  groupName?: string;
  /** Build around: the library games to pick from. */
  libraryGames: GroupGame[];
  onClose: () => void;
}

/**
 * Refine a group (keep the parts of it that feel like the group) or build
 * one around one to three games (a tight, a medium and a broad choice). What
 * is kept becomes a group of your own.
 */
export function GroupProposalsModal({
  request,
  groupName,
  libraryGames,
  onClose,
}: Readonly<GroupProposalsModalProps>) {
  const { t } = useTranslation("catalogue");
  const { formatNumber } = useFormat();
  const tagLabels = useSteamTagLabels();
  const { options, setOptions } = useTuneSettings();
  const [picked, setPicked] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [proposals, setProposals] = useState<GroupProposal[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());

  const load = (gameKeys: string[] = []) => {
    setIsLoading(true);
    setSelected(new Set());
    window.electron
      .getGroupProposals(
        request.kind === "refine"
          ? { kind: "refine", groupId: request.groupId, options }
          : { kind: "around", gameKeys, options }
      )
      .then(setProposals)
      .catch((error) => {
        logger.error("Could not propose groups", error);
        setProposals([]);
      })
      .finally(() => setIsLoading(false));
  };

  // Refine has nothing to choose first.
  useEffect(() => {
    if (request.kind === "refine") load();
    // Asked once when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const uniqueGames = useMemo(() => {
    const byKey = new Map<string, GroupGame>();
    for (const game of libraryGames) byKey.set(game.key, game);
    return [...byKey.values()];
  }, [libraryGames]);
  const titleOf = (key: string) =>
    uniqueGames.find((game) => game.key === key)?.title ?? key;

  const needle = query.trim().toLowerCase();
  const matches = needle
    ? uniqueGames
        .filter(
          (game) =>
            !picked.includes(game.key) &&
            game.title.toLowerCase().includes(needle)
        )
        .slice(0, MATCHES)
    : [];

  const keep = () => {
    if (!proposals) return;
    const stamp = Date.now().toString(36);
    const kept = proposals
      .filter((_, index) => selected.has(index))
      .map((proposal, index) => ({
        id: `c-${stamp}-${index}`,
        gameKeys: proposal.gameKeys,
        tagIds: proposal.tagIds,
      }));
    if (kept.length === 0) return;

    setOptions({
      customGroups: [...options.customGroups, ...kept],
      // Refining replaces the group with the parts kept.
      ...(request.kind === "refine"
        ? {
            groupSettings: {
              ...options.groupSettings,
              [request.groupId]: {
                ...options.groupSettings[request.groupId],
                hidden: true,
              },
            },
            group: kept[0].id,
          }
        : { group: kept[0].id }),
    });
    onClose();
  };

  const title =
    request.kind === "refine"
      ? t("refine_title", { name: groupName ?? "" })
      : t("build_around_title");

  return (
    <Modal
      visible
      large
      title={title}
      description={t(
        request.kind === "refine"
          ? "refine_description"
          : "build_around_description"
      )}
      onClose={onClose}
    >
      <div className="group-proposals">
        {request.kind === "around" && (
          <div className="group-proposals__pick">
            <TextField
              theme="dark"
              value={query}
              placeholder={t("build_around_placeholder")}
              aria-label={t("build_around_placeholder")}
              disabled={picked.length >= MAX_PICKED}
              onChange={(event) => setQuery(event.target.value)}
            />
            {matches.length > 0 && (
              <ul className="group-proposals__matches">
                {matches.map((game) => (
                  <li key={game.key}>
                    <button
                      type="button"
                      className="group-proposals__match"
                      onClick={() => {
                        setPicked((current) => [...current, game.key]);
                        setQuery("");
                      }}
                    >
                      {game.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {picked.length > 0 && (
              <ul className="group-proposals__chips">
                {picked.map((key) => (
                  <li key={key} className="group-proposals__chip">
                    {titleOf(key)}
                    <button
                      type="button"
                      aria-label={t("tune_seed_remove", {
                        title: titleOf(key),
                      })}
                      onClick={() =>
                        setPicked((current) =>
                          current.filter((entry) => entry !== key)
                        )
                      }
                    >
                      <XIcon size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Button
              theme="outline"
              disabled={picked.length === 0 || isLoading}
              onClick={() => load(picked)}
            >
              {t("build_around_show")}
            </Button>
          </div>
        )}

        {isLoading && (
          <p className="group-proposals__hint">{t("proposals_loading")}</p>
        )}
        {!isLoading && proposals?.length === 0 && (
          <p className="group-proposals__hint">{t("proposals_none")}</p>
        )}

        {!isLoading && proposals && proposals.length > 0 && (
          <>
            <ul className="group-proposals__list">
              {proposals.map((proposal, index) => {
                const isSelected = selected.has(index);
                return (
                  <li key={proposal.gameKeys.join(",")}>
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      className={cn("group-proposals__card", {
                        "group-proposals__card--selected": isSelected,
                      })}
                      onClick={() =>
                        setSelected((current) => {
                          const next = new Set(current);
                          if (next.has(index)) next.delete(index);
                          else next.add(index);
                          return next;
                        })
                      }
                    >
                      <span className="group-proposals__name">
                        {proposal.size && (
                          <span className="group-proposals__size">
                            {t(`proposal_size_${proposal.size}`)}
                          </span>
                        )}
                        {getGroupName(proposal, tagLabels)}
                      </span>
                      <span className="group-proposals__count">
                        {t("proposal_games", {
                          count: proposal.gameCount,
                          formattedCount: formatNumber(proposal.gameCount),
                        })}
                      </span>
                      <ul className="group-proposals__examples">
                        {proposal.examples.map((game) => (
                          <li key={game.key}>
                            {game.title}
                            {game.hours > 0 && (
                              <span className="group-proposals__hours">
                                {t("hours_short", {
                                  hours: Math.round(game.hours),
                                })}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="group-proposals__actions">
              <Button
                theme="primary"
                disabled={selected.size === 0}
                onClick={keep}
              >
                {selected.size === 0
                  ? t("proposals_choose")
                  : t(
                      request.kind === "refine"
                        ? "refine_keep"
                        : "build_around_keep",
                      { count: selected.size }
                    )}
              </Button>
              <Button theme="outline" onClick={onClose}>
                {t("cancel", { ns: "game_details" })}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
