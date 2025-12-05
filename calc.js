function showMessage(message, type = "danger") {
    const alertBox = document.getElementById("errorAlert");
    alertBox.textContent = message;

    alertBox.className = `alert alert-${type} text-center position-fixed top-0 start-50 translate-middle-x w-75 shadow`;
    alertBox.classList.add("show");

    setTimeout(() => alertBox.classList.remove("show"), 4000);
}

function showError(msg) { showMessage(msg, "danger"); }
function showSuccess(msg) { showMessage(msg, "success"); }

function calculateScores() {
    const teamScores = []; 
    const positionsTaken = [];
    const totalPlayerCount = parseInt(document.getElementById("totalPlayerCountInput").value);
    const numberOfTeams = parseInt(document.getElementById("teamCountSelect").value);
    const teamNames = GetTeamNames();
    const settings = GetSettings();

    if (isNaN(totalPlayerCount) || totalPlayerCount <= 0) {
        showError("Total player count must be a valid number.");
        return;
    }

    for (let i = 1; i <= numberOfTeams; i++) {
        let positions;

        if (i < numberOfTeams) {
            const positionsInput = document.getElementById(`team${i}PositionsInput`).value;
            const parsedPositions = getPositions(positionsInput);

            if (parsedPositions.error) {
                showError(`${teamNames[i - 1]} has invalid input: ${parsedPositions.error}`);
                return;
            }
            positions = parsedPositions.values;

            const invalidPositions = positions.filter(p => p < 1 || p > totalPlayerCount);
            if (invalidPositions.length > 0) {
                showError(`${teamNames[i - 1]} has invalid positions: ${invalidPositions.join(", ")}`);
                return;
            }

            const duplicates = positions.filter(p => positionsTaken.includes(p));
            if (duplicates.length > 0) {
                showError(`${teamNames[i - 1]} has overlapping positions: ${duplicates.join(", ")}`);
                return;
            }

            positionsTaken.push(...positions);
        } else {
            positions = getMissingNumbers(positionsTaken, totalPlayerCount);
        }

        const teamScore = calculateTeamScore(positions, settings.iccMode);

        teamScores.push({
            positions: positions,
            score: teamScore,
            totalPlayers: positions.length,
            teamName: teamNames[i - 1]
        });
    }

    const maxScore = Math.max(...teamScores.map(t => t.score));
    if (settings.sortScores) teamScores.sort((a, b) => b.score - a.score);

    const resultElement = document.getElementById("result");
    resultElement.innerHTML = "<h3>Results</h3>";
    let resultList = document.getElementById("resultList");
    if (!resultList) {
        resultList = document.createElement("div");
        resultList.id = "resultList";
        resultList.className = "list-group mt-2";
        resultElement.appendChild(resultList);
    }
    resultList.innerHTML = "";

    for (let i = 0; i < teamScores.length; i++) {
        const team = teamScores[i];

        const item = document.createElement("div");
        item.className = "list-group-item d-flex justify-content-between align-items-center";

        if (team.score === maxScore) {
            item.classList.add("border", "border-warning", "bg-dark", "text-white");
            item.innerHTML = `<div><span class="me-2">🏆</span><strong>${team.teamName}</strong> — ${team.score} points</div><small class="text-muted">players: ${team.totalPlayers}</small>`;
        } else {
            item.innerHTML = `<div><strong>${team.teamName}</strong> — ${team.score} points</div><small class="text-muted">players: ${team.totalPlayers}</small>`;
        }

        resultList.appendChild(item);
    }
 
    if (teamScores.length === 2) {
        const a = teamScores[0];
        const b = teamScores[1];
        const diff = a.score - b.score;
        const absDiff = Math.abs(diff);
        const diffText = diff === 0 ? 'Tie' : `${diff > 0 ? a.teamName : b.teamName} leads by ${absDiff} points`;
 
        const summaryDiv = document.createElement('div');
        summaryDiv.classList.add('mt-3', 'p-2', 'text-center', 'fw-bold', 'rounded');
 
        if (diff === 0) {
            summaryDiv.classList.add('bg-secondary', 'text-white');
        } else {
            summaryDiv.classList.add('bg-info', 'text-dark');
        }
 
        summaryDiv.innerText = `Points difference: ${diffText}`;
        resultElement.appendChild(summaryDiv);
    }
 
    resultElement.classList.remove("d-none");
    document.getElementById("copyButton").classList.remove("d-none");
}

function copyResults() {
    const resultElement = document.getElementById("result");
    const text = resultElement.innerText.trim();
    navigator.clipboard.writeText(text)
        .then(() => showSuccess("✅ Results copied to clipboard!"))
        .catch(() => showError("❌ Failed to copy results."));
}

function getPositions(input) {
    if (!input.trim()) return { values: [] };
    const values = [];
    const invalidTokens = [];
    const parts = input.split(',').map(x => x.trim());

    for (const part of parts) {
        if (part.includes('-')) {
            const [start, end] = part.split('-').map(Number);
            if (isNaN(start) || isNaN(end) || start > end) {
                invalidTokens.push(part);
            } else {
                for (let i = start; i <= end; i++) values.push(i);
            }
        } else {
            const num = parseInt(part);
            if (isNaN(num)) invalidTokens.push(part);
            else values.push(num);
        }
    }

    if (invalidTokens.length > 0) {
        return { error: invalidTokens.join(", ") };
    }

    return { values };
}

const scoresList = [300,280,262,244,228,213,198,185,173,161,150,140,131,122,114,107,99,93,87,81,75,70,66,61,57,54,50,47,44,41,38,35,33,31,29,27,25,24,22,21,19,18,17,16,15,14,13,12,11,11,10,9,9,8,8,7,7,6,6,6,5,5,5,4,4,4,4,3,3,3,3,3,3,2,2,2,2,2,2,2,2,2,2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1];
function calculateTeamScore(positions, iccMode) {
    
    while (scoresList.length < Math.max(...positions)) {
        scoresList.push(1);
    }

    let total = 0;
    for (const p of positions) {
        total += scoresList[p - 1];
    }
    if (iccMode && positions.includes(1)) {
        total += 1;
    }
    return total;
}
function getMissingNumbers(positions,total){const all=Array.from({length:total},(_,i)=>i+1);return all.filter(p=>!positions.includes(p));}

function saveSettings(){const icc=document.getElementById('iccModeCheckbox').checked;const sort=document.getElementById('sortScoresCheckbox').checked;const t1=document.getElementById('team1NameInput').value;const t2=document.getElementById('team2NameInput').value;const t3=document.getElementById('team3NameInput').value;const t4=document.getElementById('team4NameInput').value;const s={iccMode:icc,sortScores:sort,teamNames:[t1,t2,t3,t4]};localStorage.setItem('hcr2Settings',JSON.stringify(s));SetTeamNames();}
function getDefaultSettings(){return{iccMode:true,sortScores:false,teamNames:['Team 1','Team 2','Team 3','Team 4']};}
document.addEventListener('DOMContentLoaded', () => {
    InitSettings();
    document.getElementById('calculateScoresButton').addEventListener('click', calculateScores);
});
function InitSettings(){const s=GetSettings();document.getElementById('iccModeCheckbox').checked=s.iccMode;document.getElementById('sortScoresCheckbox').checked=s.sortScores;s.teamNames.forEach((n,i)=>{document.getElementById(`team${i+1}NameInput`).value=n||'';});SetTeamNames();}
function GetSettings(){const saved=localStorage.getItem('hcr2Settings');if(saved)return JSON.parse(saved);return getDefaultSettings();}
function GetTeamNames(){const s=GetSettings();return s.teamNames.map((n,i)=>n||`Team ${i+1}`);}
function SetTeamNames(skipLast=true){GetTeamNames().forEach((n,i,a)=>{if(skipLast&&i===a.length-1)return;document.getElementById(`team${i+1}PositionsLabel`).innerText=n?`${n} positions:`:`Team ${i+1} positions:`;});}
function updateTeamInputs() {
    const teamCountSelect = document.getElementById("teamCountSelect");
    const selectedTeamCount = parseInt(teamCountSelect.value);

    const editableCount = Math.max(1, selectedTeamCount - 1);

    for (let i = 1; i <= 4; i++) {
        const teamInputs = document.getElementById(`team${i}Inputs`);
        if (!teamInputs) continue;
        teamInputs.style.display = (i <= editableCount) ? "" : "none";
    }

    SetTeamNames(true);

    const totalPlayerCountInput = document.getElementById("totalPlayerCountInput");
    if (totalPlayerCountInput) {
        if (selectedTeamCount === 2) totalPlayerCountInput.value = "50";
        else if (selectedTeamCount === 3) totalPlayerCountInput.value = "75";
        else if (selectedTeamCount === 4) totalPlayerCountInput.value = "100";
    }
}

document.addEventListener('DOMContentLoaded', () => {
    updateTeamInputs();
    document.getElementById('teamCountSelect').addEventListener('change', updateTeamInputs);
});