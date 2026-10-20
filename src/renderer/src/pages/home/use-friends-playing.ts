import { useEffect, useState } from "react";
import type { UserFriend } from "@types";
import { useUserDetails } from "@renderer/hooks";

const REFRESH_MS = 2 * 60_000;

export type PlayingFriend = UserFriend & {
  currentGame: NonNullable<UserFriend["currentGame"]>;
};

/** Friends in a game right now, when signed in. */
export function useFriendsPlaying() {
  const { userDetails } = useUserDetails();
  const [friends, setFriends] = useState<PlayingFriend[]>([]);

  useEffect(() => {
    if (!userDetails) {
      setFriends([]);
      return;
    }

    let cancelled = false;
    const load = async () => {
      await window.electron.prefetchFriends().catch(() => {});
      const snapshot = await window.electron
        .getFriendsSnapshot()
        .catch(() => null);
      if (cancelled || !snapshot) return;
      setFriends(
        snapshot.friends.filter(
          (friend): friend is PlayingFriend => friend.currentGame !== null
        )
      );
    };

    void load();
    const interval = window.setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [userDetails]);

  return friends;
}
