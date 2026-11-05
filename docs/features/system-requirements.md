# System requirements check

Hydra compares your PC with the requirements a game's Steam page lists and
says, per column, whether you meet them. Steam games only for now; other
stores' requirements come later.

## What you see

On the game page, **System requirements** (below About this game) shows
Steam's Minimum and Recommended lists. Above each list is one line:

- **Your PC meets this.**
- **Falls short: graphics card, memory.** Names every part below the
  line. If your card is only a guess (see below) it says so.
- **Nothing falls short, but processor could not be checked.** Some part of the
  requirement text isn't a model Hydra knows ("Quad core 3 GHz",
  "DirectX 11 compatible"). Hydra never calls an unknown part a pass or a fail.
- **Hydra could not check this against your PC.** Nothing in the list could be
  compared.
- **Tell Hydra about your PC…** when nothing about your PC is known.

Each line links to **Settings → My PC**.

Operating system and storage are not checked: Windows requirements say nothing
about a Linux machine running the game through Proton (ProtonDB covers that),
and free disk space depends on where the game goes.

## My PC

**Settings → My PC** lists processor, graphics card and memory with what
Hydra detected, a picker to correct each, and **Use detected** to undo a
correction. Corrections are stored in `userPreferences.systemSpecs` (model ids,
and memory in GB) and win over detection every time, so a later re-detection
never overwrites them.

Detection (`main/services/system-requirements/`, read once per run):

- **Processor and memory:** from the operating system.
- **Graphics card, Linux:** the game GPU's PCI id from the machine profile,
  named through the system `pci.ids` (hwdata). **Windows:** PowerShell's
  `Win32_VideoController`. The fastest known adapter wins, so an integrated
  chip doesn't hide the card.
- **One id, several cards.** An RX 9070, 9070 XT and 9070 GRE share PCI id
  `1002:7550`, and `pci.ids` lists them as one entry. Hydra expands that into
  all three, assumes the slowest until you pick yours in My PC, and says it
  guessed when that decides a result.
- **Laptop chips** ("Laptop GPU", "Max-Q") are scored at 80 % of the desktop
  chip of the same name.

macOS has no detection; My PC asks for the parts instead.

## How the comparison works

All in `shared/system-requirements/`, covered by `requirements.test.ts`.

- **The table** (`hardware-table.ts`) holds one score per CPU and GPU model:
  how fast in games, scaled so a GTX 1060 and a Core i5-8400 are 100 on their
  own scales. **The scores are hand-curated approximations, not benchmark
  output**, covering roughly 2008 to 2025. A model missing from the table is
  unknown, not wrong: add it there. There is no automatic refresh yet; finding
  a maintained, openly licensed source is the open question.
- **Name matching** (`hardware-match.ts`) tokenises both sides (brands, clock
  speeds and "8-Core Processor" are dropped; `GTX1060` equals `GTX 1060`) and
  picks the table model with the most tokens found in order, so "RTX 3060 Ti"
  isn't read as "RTX 3060".
- **Requirement text** is Steam's HTML. Each `Processor`, `Graphics` and
  `Memory` line is read; alternatives ("X or Y", "X / Y") count as met when
  you beat the easiest one.
- **Tolerance:** a part within 10 % below the required score still passes,
  because the scores are approximate. Memory is exact.
- **Verdict:** any part below makes it _below_; otherwise unknown parts make
  it _partial_; all parts known and met is _meets_.
