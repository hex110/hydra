# Local source matching

Download sources are matched to games by Hydra's server: the source URL is
registered with the API, which downloads the JSON, matches each release to a
catalogue game and returns the matches per game. When that matching misses a
release, or the server's copy of a source is out of date, the game shows fewer
downloads than the source has.

Local source matching closes that gap. Hydra keeps its own copy of every
source, matches it to games by title on your machine and adds what it finds
to the server's results. It is on by default and controlled by **Also match
games against Hydra's own copy of each source** in **Settings → Download
sources**.

## How it works

- Each source's JSON is downloaded to `<userData>/download-sources/<id>.json`
  when it is added, on startup and when you press **Sync sources**. Automatic
  refreshes skip copies younger than six hours.
- Release titles are cleaned the same way library folders are
  ([library scanning](library-scanning.md)): bracketed tags, versions, build
  numbers and release group names are removed
  (`Lost Soul Aside – V 1.103 / Build 22971784` → `Lost Soul Aside`). A
  release matches a game when the cleaned title and the store title are the
  same, ignoring punctuation, trademark symbols, roman numerals and edition
  suffixes. Sequels never match (`Hades` ≠ `Hades II`).
- On a game's page, local matches are merged with the server's list:
  - a local release that shares a link with a server release is not shown
    twice;
  - if the local copy of that release is newer (sources often reuse a link
    for a new version), its title, size and date replace the server's stale
    ones.
- The same merge happens in Big Picture's download dialog, including for games
  the catalogue lists as having no downloads.

## Source status

Each source on the settings page shows its local copy: how many downloads it
has and when it was updated, or why the last download failed. A failed
download keeps using the previous copy. Common failures:

| Message                             | Meaning                                                                                   |
| ----------------------------------- | ----------------------------------------------------------------------------------------- |
| `HTTP 404`                          | The source moved. The server may still serve an old copy; ask the source for its new URL. |
| `Blocked by a Cloudflare challenge` | The host only serves browsers that pass a challenge. Server-side matching still works.    |
| `The source did not return JSON`    | The URL points to a web page rather than the source file.                                 |

Removing a source deletes its local copy.
