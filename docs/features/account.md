# Hydra account

A Hydra account is optional in Hydra Plus. Everything that runs on your own
machine works signed out: the library, downloads, game setup, achievements,
play tracking ([Steam history](steam-history.md), [Floppy](floppy.md)),
artwork with your own [SteamGridDB key](game-page.md#artwork) and
self-hosted [save sync](save-sync.md). Hydra's public catalogue data
(search, game details, artwork, achievement names, download sources, update
checks) needs no account either.

## What an account adds

Signing in turns on the features that live on Hydra's servers: the public
profile, friends, chat, reviews, achievement points, souvenirs, Hydra Cloud
(with a subscription), and the Epic Games and RetroAchievements connections.
While signed out none of these show: no sign-in prompts, no Hydra Cloud
offers (the checkout page is not even loaded), no reviews section, no points
panel, and the Epic and RetroAchievements cards are hidden.

## Hydra Cloud is not the account

A Hydra account does not switch Hydra Cloud on. Cloud features show only when
saves can actually sync: a [save sync](save-sync.md) location is set, or the
account has a Hydra Cloud subscription. Otherwise there is no cloud tab in a
game's options, no save widget on the game page, no "will not be synced"
notices, no locked points or souvenir rows, no VikingFile entry in the
download dialog and no locked emulator-save section. Nothing opens a sign-in
window or the checkout from those places; subscribing stays in **Settings →
Integrations → Hydra services → Hydra account**. The check is
`useCloudSaveAccess()`.

Not covered: the profile pages (reached only with an account) still show
their own subscription prompts.

## Signing in and out

**Settings → Integrations → Hydra services → Hydra account** signs in, opens
your profile and signs out. The top of the sidebar shows your profile when
signed in; signed out it opens **Notifications** instead, with the unread
count, so local notifications such as Steam wishlist releases stay reachable.

## Achievements signed out

Achievements are read and shown without an account: the game page lists
them, the achievements page shows **Your achievements** instead of a profile,
and unlocks found in game files are merged and notified. Achievement names
and icons come from Hydra's public catalogue. Only syncing unlocks to a
profile (and points) needs an account.

## Code

- `useCloudSaveAccess()` (`"open"` / `"paywall"` / `"sign-in"`) gates the save
  widget, the game options cloud tabs and the save manager.
- `useSubscription().showHydraCloudModal` does nothing signed out, and the
  Hydra Cloud modal is only mounted signed in (`app.tsx`).
- Achievement metadata is requested with `needsAuth: false`
  (`get-game-achievement-data.ts`); the achievement watcher no longer waits
  for a sign-in before merging unlocks.
- `settings-hydra-account.tsx` is the account card.
