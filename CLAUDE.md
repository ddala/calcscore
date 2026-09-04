# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Calcscore is a simple web application for calculating standings in ICC (Inter-Clan Challenge) matches in HCR2 (Hill Climb Racing 2). It's vanilla HTML/CSS/JavaScript with no build system and no dependencies — the only external resource is a Google Fonts stylesheet.

## Architecture

Two pages sharing one stylesheet and one constants file:

- `index.html` — the score calculator
- `simulation.html` — the max-score tie simulation
- `styles.css` — all styling for both pages, including the design tokens in `:root`
- `shared.js` — `BASE_SCORES` and the alert helpers, loaded by both pages
- `calc.js` — calculator logic (loaded by `index.html` only)
- `simulation.js` — simulation logic (loaded by `simulation.html` only)
- `icclogo.png` — logo in the top bar

Navigation between the pages is plain links in the top bar, marked with `aria-current="page"`. The two features are independent: the calculator owns the settings modal and localStorage, the simulation owns the URL query string.

### Key components

**Scoring system (`shared.js`)**
- `BASE_SCORES` holds point values for positions 1–100 and is never mutated; callers copy it.
- In ICC mode 1st place gets +1 (301 instead of 300).
- The calculator extends the list with 1 for positions beyond 100.

**Team calculation (`calc.js`)**
- Supports 2–4 teams. For n teams only n−1 need position input; the last is derived from the remaining positions.
- Position input is comma-separated with ranges: `1,3-4,6,9,12-14`.
- Validation rejects overlapping positions and anything outside 1–totalPlayerCount.

**Settings (`calc.js`)**
- localStorage key `hcr2Settings`: `iccMode`, `sortScores`, `teamNames` (4 strings).
- Defaults: ICC mode on, sorting off, "Team 1"–"Team 4". All access is wrapped in try/catch.

**Simulation (`simulation.js`)**
- Monte Carlo over random orderings of a max-score tie between two teams, with a seeded PRNG so a run is reproducible.
- Team A's score determines the points gap (`gap = 2·scoreA − pointsAtStake`), so one `Int32Array` tally indexed by that score holds the exact distribution — that is what the median and the histogram read from.
- The run is mirrored into the query string (`?a=&b=&runs=&seed=&margin=`) via `history.replaceState`, including the resolved seed. Opening such a link prefills the form and runs it automatically, which is how sharing works.
- Team A/B colors (`--team-a`, `--team-b`) were chosen to pass OKLCH lightness, chroma and colour-blind separation checks against the dark surface. Re-validate before changing them.

## Running the application

Static site, no build step:

```bash
python -m http.server 8000
# OR
npx serve .
# OR open index.html directly (file://)
```

## Testing

No automated tests. Manual workflow:

Calculator
1. 2/3/4 team configurations
2. Position parsing: single values, ranges, mixed input
3. Error cases: overlapping positions, invalid ranges, out-of-bounds positions
4. ICC mode on/off (1st place 301 vs 300)
5. Settings persistence across reloads
6. Copy results button

Simulation
7. Run with the defaults, then with 0 players on one side and with both sides equal
8. Same seed twice gives identical numbers; blank seed gives a new one each run
9. Copy share link, open it in a new tab — same inputs, same result
10. A link with junk params shows an error and does not run
11. Histogram hover and arrow-key readout

## Deployment

Push to `main` triggers `.github/workflows/deploy.yml`, which scp's the site to `/var/www/calcscore` on the production host (nginx, calcscore.ddala.dev). GitHub Pages publishes the same branch to https://ddala.github.io/calcscore/.

The workflow lists the files to copy explicitly — `appleboy/scp-action` has no `exclude` input, and copying the whole checkout once put `.git` in the web root. **Any new file the site needs must be added to `source:` in that workflow**, or it will 404 in production while working locally.

## Code style

- camelCase functions, no inline event handlers — everything via `addEventListener`.
- DOM lookups are checked before use, so a shared script can run on a page that lacks those elements.
- Result markup is built as template strings and assigned to `innerHTML`; only validated numbers are interpolated. Keep it that way — never interpolate raw user or URL text.
- Colors, spacing and fonts come from the tokens in `styles.css`; don't hardcode hex values in markup.
