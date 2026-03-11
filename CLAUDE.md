# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Calcscore is a simple web application for calculating standings in ICC (Inter-Clan Challenge) matches in HCR2 (Hill Climb Racing 2). It's a vanilla HTML/CSS/JavaScript application with no build system or dependencies beyond Bootstrap 5.

## Architecture

This is a single-page application consisting of three files:
- `index.html` - UI structure with Bootstrap 5 dark theme
- `calc.js` - All application logic and scoring calculations
- `icclogo.png` - ICC logo displayed in navbar

### Key Components

**Scoring System (calc.js:157-172)**
- `scoresList` array contains point values for positions 1-100 (defined at calc.js:157)
- In ICC mode, 1st place gets +1 bonus point (301 total instead of 300)
- The scoring algorithm extends the scoresList with value 1 for positions beyond 100

**State Management (calc.js:175-184)**
- Settings stored in localStorage under key 'hcr2Settings'
- Settings include: iccMode (boolean), sortScores (boolean), teamNames (array of 4 strings)
- Default settings: ICC mode enabled, sorting disabled, default team names "Team 1" through "Team 4"

**Team Calculation Logic (calc.js:14-119)**
- Supports 2-4 teams
- For n teams, only n-1 teams require position input (last team auto-calculated from remaining positions)
- Position input format: comma-separated values with range support (e.g., "1,3-4,6,9,12-14")
- Validation ensures: no overlapping positions, all positions within 1-totalPlayerCount range

**UI Patterns**
- Error/success messages use animated alerts (showMessage/showError/showSuccess at calc.js:1-12)
- Winner highlighting: team(s) with max score get trophy emoji and warning border (calc.js:87-92)
- For 2-team matches, displays point difference summary (calc.js:97-115)
- Results can be copied to clipboard via copy button (calc.js:121-127)

## Running the Application

This is a static website with no build process. To run:

```bash
# Serve locally (any method works):
python -m http.server 8000
# OR
npx serve .
# OR open index.html directly in browser (file://)
```

Then navigate to http://localhost:8000

## Testing

No automated tests exist. Manual testing workflow:
1. Test 2/3/4 team configurations
2. Verify position parsing: single values, ranges, mixed input
3. Verify error cases: overlapping positions, invalid ranges, out-of-bounds positions
4. Test ICC mode on/off (1st place should be 301 vs 300 points)
5. Test settings persistence across page reloads
6. Test copy results button

## Code Organization

calc.js is organized into clear sections:
1. **Constants & Configuration** (lines 1-25) - All magic numbers, default values, and the BASE_SCORES array
2. **Utility Functions** (lines 27-48) - Message display functions
3. **Validation Functions** (lines 50-161) - Input parsing and validation logic
4. **Scoring Logic** (lines 163-193) - Score calculation and helper functions
5. **UI Rendering** (lines 195-273) - Results display and winner highlighting
6. **Settings Management** (lines 275-363) - localStorage operations for user preferences
7. **Team Input Management** (lines 365-420) - Dynamic generation of team input fields
8. **Main Calculator** (lines 422-474) - Orchestrates validation, computation, and rendering
9. **Event Handlers** (lines 476-489) - Click handlers for buttons
10. **Initialization** (lines 491-525) - Single initApp() function sets up the app

## Code Style Notes

- All functions use camelCase naming convention
- HTML uses Bootstrap 5 utilities extensively with data-bs-* attributes
- No inline event handlers - all events attached via addEventListener
- Team input fields are generated dynamically via JavaScript
- BASE_SCORES array is never mutated (fresh copies created when needed)
- All localStorage operations wrapped in try-catch for safety
- DOM element existence checked before use to prevent errors
