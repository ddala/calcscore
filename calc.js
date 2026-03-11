// ========================================
// CONSTANTS & CONFIGURATION
// ========================================

const MAX_TEAMS = 4;
const ALERT_TIMEOUT_MS = 4000;
const DEFAULT_PLAYERS_2_TEAMS = 50;
const DEFAULT_PLAYERS_3_TEAMS = 75;
const DEFAULT_PLAYERS_4_TEAMS = 100;
const ICC_FIRST_PLACE_BONUS = 1;
const LOCALSTORAGE_KEY = 'hcr2Settings';

// Base scoring array - positions 1-100
const BASE_SCORES = [
    300, 280, 262, 244, 228, 213, 198, 185, 173, 161,
    150, 140, 131, 122, 114, 107, 99, 93, 87, 81,
    75, 70, 66, 61, 57, 54, 50, 47, 44, 41,
    38, 35, 33, 31, 29, 27, 25, 24, 22, 21,
    19, 18, 17, 16, 15, 14, 13, 12, 11, 11,
    10, 9, 9, 8, 8, 7, 7, 6, 6, 6,
    5, 5, 5, 4, 4, 4, 4, 3, 3, 3,
    3, 3, 3, 2, 2, 2, 2, 2, 2, 2,
    2, 2, 2, 1, 1, 1, 1, 1, 1, 1,
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1
];

// ========================================
// UTILITY FUNCTIONS
// ========================================

function showMessage(message, type = 'danger') {
    const alertBox = document.getElementById('errorAlert');
    if (!alertBox) return;

    alertBox.textContent = message;
    alertBox.className = `alert alert-${type} text-center position-fixed top-0 start-50 translate-middle-x w-75 shadow`;
    alertBox.classList.add('show');

    setTimeout(() => alertBox.classList.remove('show'), ALERT_TIMEOUT_MS);
}

function showError(message) {
    showMessage(message, 'danger');
}

function showSuccess(message) {
    showMessage(message, 'success');
}

// ========================================
// VALIDATION FUNCTIONS
// ========================================

function getPositions(input) {
    if (!input.trim()) {
        return { values: [] };
    }

    const values = [];
    const invalidTokens = [];
    const parts = input.split(',').map(x => x.trim());

    for (const part of parts) {
        if (part.includes('-')) {
            const [start, end] = part.split('-').map(Number);

            if (isNaN(start) || isNaN(end) || start > end) {
                invalidTokens.push(part);
            } else if (end - start > 1000) {
                // Prevent performance issues with huge ranges
                return { error: `Range "${part}" is too large (max 1000 positions per range)` };
            } else {
                for (let i = start; i <= end; i++) {
                    values.push(i);
                }
            }
        } else {
            const num = parseInt(part);
            if (isNaN(num)) {
                invalidTokens.push(part);
            } else {
                values.push(num);
            }
        }
    }

    if (invalidTokens.length > 0) {
        return { error: `Invalid input: ${invalidTokens.join(', ')}` };
    }

    // Check for duplicates within the same team
    const duplicates = values.filter((val, idx) => values.indexOf(val) !== idx);
    if (duplicates.length > 0) {
        const uniqueDuplicates = [...new Set(duplicates)];
        return { error: `Duplicate positions in same team: ${uniqueDuplicates.join(', ')}` };
    }

    return { values };
}

function validateAllInputs(numberOfTeams, totalPlayerCount, teamNames) {
    const positionsTaken = new Set();

    // Validate total player count
    if (isNaN(totalPlayerCount) || totalPlayerCount <= 0) {
        showError('Total player count must be a valid number greater than 0.');
        return null;
    }

    const teamData = [];

    // Validate each team's positions (except the last one, which is auto-calculated)
    for (let i = 1; i <= numberOfTeams; i++) {
        let positions;

        if (i < numberOfTeams) {
            const positionsInput = document.getElementById(`team${i}PositionsInput`);
            if (!positionsInput) {
                showError(`Could not find input for ${teamNames[i - 1]}`);
                return null;
            }

            const parsedPositions = getPositions(positionsInput.value);

            if (parsedPositions.error) {
                showError(`${teamNames[i - 1]} has invalid input: ${parsedPositions.error}`);
                return null;
            }

            positions = parsedPositions.values;

            // Validate positions are within valid range
            const invalidPositions = positions.filter(p => p < 1 || p > totalPlayerCount);
            if (invalidPositions.length > 0) {
                showError(
                    `${teamNames[i - 1]} has positions out of range (1-${totalPlayerCount}): ${invalidPositions.join(', ')}`
                );
                return null;
            }

            // Check for overlaps with other teams
            const duplicates = positions.filter(p => positionsTaken.has(p));
            if (duplicates.length > 0) {
                showError(`${teamNames[i - 1]} has overlapping positions: ${duplicates.join(', ')}`);
                return null;
            }

            for (const p of positions) positionsTaken.add(p);
        } else {
            // Last team gets remaining positions
            positions = getMissingNumbers(positionsTaken, totalPlayerCount);
        }

        teamData.push({
            teamName: teamNames[i - 1],
            positions: positions
        });
    }

    return teamData;
}

// ========================================
// SCORING LOGIC
// ========================================

function getMissingNumbers(positionsTaken, total) {
    const remaining = [];
    for (let i = 1; i <= total; i++) {
        if (!positionsTaken.has(i)) remaining.push(i);
    }
    return remaining;
}

function calculateTeamScore(positions, iccMode) {
    // Handle empty positions array
    if (positions.length === 0) {
        return 0;
    }

    // Create a fresh copy of the base scores to avoid mutation
    const scoresList = [...BASE_SCORES];

    // Extend scores list if needed (positions beyond base array get 1 point)
    const maxPosition = Math.max(...positions);
    while (scoresList.length < maxPosition) {
        scoresList.push(1);
    }

    let total = 0;
    for (const position of positions) {
        total += scoresList[position - 1];
    }

    // ICC mode: first place gets bonus point
    if (iccMode && positions.includes(1)) {
        total += ICC_FIRST_PLACE_BONUS;
    }

    return total;
}

// ========================================
// UI RENDERING
// ========================================

function renderResults(teamScores) {
    const resultElement = document.getElementById('result');
    const resultList = document.getElementById('resultList');
    const copyButton = document.getElementById('copyButton');

    if (!resultElement || !resultList) return;

    resultList.innerHTML = '';

    const maxScore = Math.max(...teamScores.map(t => t.score));

    for (const { score, teamName, totalPlayers } of teamScores) {
        const item = document.createElement('div');
        item.className = 'list-group-item d-flex align-items-center';

        const isWinner = score === maxScore;

        if (isWinner) {
            item.style.borderLeft = '4px solid var(--bs-warning)';
        }

        item.innerHTML = `
            <div class="flex-grow-1">
                <strong>${teamName}</strong>
                ${isWinner ? ' 🏆' : ''}
            </div>
            <div style="min-width: 70px;" class="text-end fw-bold">${score}</div>
            <div style="min-width: 90px;" class="text-end text-muted small">${totalPlayers} players</div>
        `;

        resultList.appendChild(item);
    }

    resultElement.classList.remove('d-none');
    if (copyButton) {
        copyButton.classList.remove('d-none');
    }
}

function renderPointsDifference(teamScores) {
    if (teamScores.length !== 2) return;

    const resultElement = document.getElementById('result');
    if (!resultElement) return;

    // Remove any previous summary
    const existingSummary = document.getElementById('pointsDifference');
    if (existingSummary) existingSummary.remove();

    const [teamA, teamB] = teamScores;
    const diff = teamA.score - teamB.score;
    const absDiff = Math.abs(diff);

    const summaryDiv = document.createElement('div');
    summaryDiv.id = 'pointsDifference';
    summaryDiv.className = 'mt-1 py-2 text-center';

    if (diff === 0) {
        summaryDiv.innerHTML = '<span class="text-secondary">Tie game</span>';
    } else {
        const leader = diff > 0 ? teamA.teamName : teamB.teamName;
        summaryDiv.innerHTML = `<strong>${leader}</strong> ahead by <strong>${absDiff}</strong> points`;
    }

    resultElement.appendChild(summaryDiv);
}

// ========================================
// SETTINGS MANAGEMENT
// ========================================

function getDefaultSettings() {
    return {
        iccMode: true,
        sortScores: false,
        teamNames: ['Team 1', 'Team 2', 'Team 3', 'Team 4']
    };
}

function getSettings() {
    try {
        const saved = localStorage.getItem(LOCALSTORAGE_KEY);
        if (saved) {
            return JSON.parse(saved);
        }
    } catch (error) {
        console.warn('Failed to load settings from localStorage:', error);
    }
    return getDefaultSettings();
}

function saveSettings() {
    const iccModeCheckbox = document.getElementById('iccModeCheckbox');
    const sortScoresCheckbox = document.getElementById('sortScoresCheckbox');

    if (!iccModeCheckbox || !sortScoresCheckbox) return;

    const teamNames = [];
    for (let i = 1; i <= MAX_TEAMS; i++) {
        const input = document.getElementById(`team${i}NameInput`);
        teamNames.push(input ? input.value : '');
    }

    const settings = {
        iccMode: iccModeCheckbox.checked,
        sortScores: sortScoresCheckbox.checked,
        teamNames: teamNames
    };

    try {
        localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(settings));
        setTeamNames();
    } catch (error) {
        console.error('Failed to save settings to localStorage:', error);
        showError('Failed to save settings. Your browser may have disabled localStorage.');
    }
}

function initSettings() {
    const settings = getSettings();

    const iccModeCheckbox = document.getElementById('iccModeCheckbox');
    const sortScoresCheckbox = document.getElementById('sortScoresCheckbox');

    if (iccModeCheckbox) {
        iccModeCheckbox.checked = settings.iccMode;
    }
    if (sortScoresCheckbox) {
        sortScoresCheckbox.checked = settings.sortScores;
    }

    settings.teamNames.forEach((name, i) => {
        const input = document.getElementById(`team${i + 1}NameInput`);
        if (input) {
            input.value = name || '';
        }
    });

    setTeamNames();
}

function getTeamNames() {
    const settings = getSettings();
    return settings.teamNames.map((name, i) => name || `Team ${i + 1}`);
}

function setTeamNames() {
    const teamNames = getTeamNames();

    teamNames.forEach((name, i) => {
        const label = document.getElementById(`team${i + 1}PositionsLabel`);
        if (label) {
            label.textContent = `${name} positions:`;
        }
    });
}

// ========================================
// TEAM INPUT MANAGEMENT
// ========================================

function generateTeamInputs(teamCount) {
    const container = document.getElementById('teamInputs');
    if (!container) return;

    container.innerHTML = '';

    // Generate inputs for all teams except the last one (which is auto-calculated)
    const inputCount = Math.max(1, teamCount - 1);

    for (let i = 1; i <= inputCount; i++) {
        const teamDiv = document.createElement('div');
        teamDiv.className = 'mb-3';
        teamDiv.innerHTML = `
            <label for="team${i}PositionsInput" class="form-label" id="team${i}PositionsLabel">
                Team ${i} positions:
            </label>
            <input
                type="text"
                class="form-control"
                id="team${i}PositionsInput"
                name="positions"
                placeholder="e.g. 1,3-4,6,9,12-14..."
                autocomplete="off"
            />
        `;
        container.appendChild(teamDiv);
    }

    // Update labels with custom team names
    setTeamNames();
}

function updateTeamInputs() {
    const teamCountSelect = document.getElementById('teamCountSelect');
    const totalPlayerCountInput = document.getElementById('totalPlayerCountInput');

    if (!teamCountSelect || !totalPlayerCountInput) return;

    const selectedTeamCount = parseInt(teamCountSelect.value);

    // Generate the appropriate number of input fields
    generateTeamInputs(selectedTeamCount);

    // Update default total player count based on team count
    if (selectedTeamCount === 2) {
        totalPlayerCountInput.value = DEFAULT_PLAYERS_2_TEAMS;
    } else if (selectedTeamCount === 3) {
        totalPlayerCountInput.value = DEFAULT_PLAYERS_3_TEAMS;
    } else if (selectedTeamCount === 4) {
        totalPlayerCountInput.value = DEFAULT_PLAYERS_4_TEAMS;
    }
}

// ========================================
// MAIN CALCULATOR
// ========================================

function computeTeamScores(teamData, iccMode) {
    const teamScores = [];

    for (const { teamName, positions } of teamData) {
        const score = calculateTeamScore(positions, iccMode);

        teamScores.push({
            teamName: teamName,
            positions: positions,
            score: score,
            totalPlayers: positions.length
        });
    }

    return teamScores;
}

function calculateScores() {
    const totalPlayerCountInput = document.getElementById('totalPlayerCountInput');
    const teamCountSelect = document.getElementById('teamCountSelect');

    if (!totalPlayerCountInput || !teamCountSelect) {
        showError('Could not find required input elements.');
        return;
    }

    const totalPlayerCount = parseInt(totalPlayerCountInput.value);
    const numberOfTeams = parseInt(teamCountSelect.value);
    const teamNames = getTeamNames();
    const settings = getSettings();

    // Validate all inputs
    const teamData = validateAllInputs(numberOfTeams, totalPlayerCount, teamNames);
    if (!teamData) {
        return; // Validation errors already shown
    }

    // Compute scores
    let teamScores = computeTeamScores(teamData, settings.iccMode);

    // Sort if requested
    if (settings.sortScores) {
        teamScores.sort((a, b) => b.score - a.score);
    }

    // Render results
    renderResults(teamScores);
    renderPointsDifference(teamScores);
}

// ========================================
// EVENT HANDLERS
// ========================================

function copyResults() {
    const resultElement = document.getElementById('result');
    if (!resultElement) return;

    const text = resultElement.innerText.trim();

    navigator.clipboard.writeText(text)
        .then(() => showSuccess('✅ Results copied to clipboard!'))
        .catch(() => showError('❌ Failed to copy results.'));
}

// ========================================
// INITIALIZATION
// ========================================

function fillTestData() {
    if (!new URLSearchParams(window.location.search).has('debug')) return;

    const teamCountSelect = document.getElementById('teamCountSelect');
    if (!teamCountSelect) return;

    const teamCount = parseInt(teamCountSelect.value);

    const testData = {
        2: ['1-3,7,10,15-20,30,42'],
        3: ['1-5,16-20,45-50', '6-10,21-25,51-55'],
        4: ['1-5,21-25', '6-10,26-30', '11-15,31-35']
    };

    const data = testData[teamCount] || testData[2];
    data.forEach((positions, i) => {
        const input = document.getElementById(`team${i + 1}PositionsInput`);
        if (input) input.value = positions;
    });
}

function initApp() {
    // Initialize settings from localStorage
    initSettings();

    // Generate initial team inputs
    updateTeamInputs();

    // Fill test data if ?debug is in the URL
    fillTestData();

    // Attach event listeners
    const calculateButton = document.getElementById('calculateScoresButton');
    if (calculateButton) {
        calculateButton.addEventListener('click', calculateScores);
    }

    const teamCountSelect = document.getElementById('teamCountSelect');
    if (teamCountSelect) {
        teamCountSelect.addEventListener('change', () => {
            updateTeamInputs();
            fillTestData();
        });
    }

    const copyButton = document.getElementById('copyButton');
    if (copyButton) {
        copyButton.addEventListener('click', copyResults);
    }

    const saveSettingsButton = document.getElementById('saveSettingsButton');
    if (saveSettingsButton) {
        saveSettingsButton.addEventListener('click', saveSettings);
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', initApp);
