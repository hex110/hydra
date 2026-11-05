# System palette (matugen)

Hydra Plus can follow the Material You palette that
[matugen](https://github.com/InioX/matugen) generates from a wallpaper (also
what dms/DankMaterialShell and many Hyprland setups run on every wallpaper
change). Settings → General → Appearance → **System palette**.

It sits under the existing custom CSS themes: the palette sets colour variables,
and an active custom theme can still override anything.

## How it works

1. **Template.** Hydra Plus ships a matugen template
   (`MATUGEN_TEMPLATE` in `src/shared/matugen-palette.ts`). It renders a small
   CSS file of `--hydra-*` custom properties from matugen's **dark** scheme
   (Hydra Plus is dark-only).
2. **Setup.** The **Set up matugen** button writes the template to
   `<userData>/matugen/template.css`, adds a `[templates.hydraplus]` block to
   `$XDG_CONFIG_HOME/matugen/config.toml` (backup kept once as
   `config.toml.bak-hydra-plus`; an existing block is left alone) and turns the
   palette on. The output goes to `<userData>/matugen/palette.css`. Nothing is
   written until the user clicks it. **Copy template** is for people who keep
   their matugen setup by hand.
3. **Watch.** `src/main/services/matugen-palette.ts` polls the palette file once
   a second (`fs.watchFile`: it copes with the file not existing yet and with
   writers that replace it), parses only the known `--hydra-*` declarations and
   sends them to every window (`on-matugen-palette-updated`). An empty read
   right after a live palette is retried once before falling back, so a write in
   progress does not flash the stock colours.
4. **Apply.** `src/renderer/src/matugen-palette.ts` keeps one
   `<style id="matugen-palette">:root { … }</style>` first in `<head>`, so a
   custom theme's own CSS (appended later) wins. It runs for every window, since
   all of them are one bundle. CSS variables also cross into the achievement
   notification's shadow root.
5. **Read.** `globals.scss` tokens are `var(--hydra-x, <stock colour>)`. With no
   palette, off, missing or empty file, the app is pixel-identical to stock.

The status line says which state it is in: off, waiting for the first file,
unreadable, no Hydra Plus colours in it, or applied. The palette file path can
be changed (default: the setup output).

## Tokens

| `--hydra-…`        | Replaces (`globals.scss`)                  | matugen role               |
| ------------------ | ------------------------------------------ | -------------------------- |
| `background`       | `$background-color`                        | `surface`                  |
| `background-deep`  | `$dark-background-color`                   | `surface_container_lowest` |
| `surface`          | `$surface-color` (was the loose `#1c1c1c`) | `surface_container`        |
| `text-strong`      | `$muted-color`                             | `on_surface`               |
| `text`             | `$body-color`                              | `on_surface_variant`       |
| `border`           | `$border-color`                            | `on_surface` at 8 %        |
| `accent`           | `$brand-teal`                              | `primary`                  |
| `accent-secondary` | `$brand-blue`                              | `tertiary`                 |

Not themed on purpose: success, warning, error and danger colours (they must
keep their meaning), rank/ProtonDB/review colours, and the neutral white
overlays and hardcoded text greys. Big Picture has its own stylesheet and is
not covered yet.

## Rules for styles

- **Never pass a palette token to a Sass colour function** (`rgba()`,
  `color.mix()`, `darken()` …). The tokens are CSS variables, so Sass does not
  fail; it emits invalid CSS. Use `globals.with-alpha($token, $alpha)` (replaces
  the alpha, like `rgba($colour, $alpha)`) or CSS `color-mix()` /
  relative colours. `src/renderer/src/scss/palette-tokens.test.ts` fails on it.
- New repeated colours become tokens in `globals.scss`; a new palette token also
  needs an entry in `MATUGEN_PALETTE_ROLES` (or the `border`-style special case)
  so the template emits it.

## Limits and open ideas

- **First colours.** dms skips regenerating an unchanged palette, so a new
  template would not render until the next wallpaper change. Whenever the
  palette is on and the default file is missing, Hydra Plus renders the template
  itself from dms's cached dark palette
  (`$XDG_CACHE_HOME/DankMaterialShell/dms-colors.json`, the colours dms gave
  matugen), once per enable. Other shells have no such cache, so there the
  status stays "waiting" until matugen writes the file. A custom palette path
  is never seeded.
- Not yet: a seed-colour picker for desktops without dms or matugen, light
  mode, Big Picture.

## Testing

Unit: `src/shared/matugen-palette.test.ts` (parser, config edit),
`palette-tokens.test.ts` (guard). By hand: sandboxed dev instance with `HOME`
and `XDG_CONFIG_HOME` pointed at a scratch folder (so the setup button cannot
touch the real matugen config), click **Set up matugen**, then
`matugen -c <scratch>/.config/matugen/config.toml color hex "#c2410c" --mode dark`
and watch the open app repaint.
