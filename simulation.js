const MAX_SIMULATIONS = 1000000;
const HISTOGRAM_BINS = 41;
const MAX_BANKED_POINTS = 100000;

function seededRandom(seed) {
    let state = seed >>> 0;
    return function random() {
        state = (state + 0x6D2B79F5) | 0;
        let value = Math.imul(state ^ state >>> 15, 1 | state);
        value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
        return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
}

function wilsonInterval(successes, trials) {
    const z = 1.959963984540054;
    const probability = successes / trials;
    const denominator = 1 + z * z / trials;
    const center = (probability + z * z / (2 * trials)) / denominator;
    const halfWidth = z * Math.sqrt((probability * (1 - probability) + z * z / (4 * trials)) / trials) / denominator;
    return [Math.max(0, center - halfWidth), Math.min(1, center + halfWidth)];
}

function formatPercent(count, total) {
    return `${(count / total * 100).toFixed(2)}%`;
}

// Grouping is pinned to en-US so thousands separators and the decimal point stay
// consistent with the toFixed percentages, whatever locale the browser runs in.
function formatNumber(value, decimals = 0) {
    return value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatSigned(value) {
    const rounded = Number.isInteger(value) ? value : Number(value.toFixed(2));
    const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '';
    return `${sign}${formatNumber(Math.abs(rounded), Number.isInteger(rounded) ? 0 : 2)}`;
}

// Plain-language reading of a probability: "6 of every 10" lands faster at a
// glance than "63.47%", but lopsided odds read better as "1 of every N".
function describeChance(count, total) {
    if (count === 0) return 'Team A never came out ahead in these runs.';
    if (count === total) return 'Team A came out ahead in every run.';
    const probability = count / total;
    if (probability >= 0.9) return `Team A slips behind in only about 1 of every ${formatNumber(Math.round(1 / (1 - probability)))} tie orderings.`;
    if (probability >= 0.1) return `Team A comes out ahead in about ${Math.round(probability * 10)} of every 10 tie orderings.`;
    return `Team A comes out ahead in about 1 of every ${formatNumber(Math.round(1 / probability))} tie orderings.`;
}

// Reads the value at quantile q straight from the count-per-gap tally, so the
// median and quartiles are exact rather than estimated from a sample.
function quantileFromCounts(counts, offset, total, q) {
    const target = q * total;
    let seen = 0;
    for (let index = 0; index < counts.length; index++) {
        seen += counts[index];
        if (seen >= target && counts[index] > 0) return index + offset;
    }
    return counts.length - 1 + offset;
}

function renderSplitBar(teamAWins, teamBWins, draws, simulations) {
    const segments = [
        { className: 'team-a', label: 'Team A ahead', count: teamAWins },
        { className: 'tie', label: 'Dead heat', count: draws },
        { className: 'team-b', label: 'Team B ahead', count: teamBWins }
    ].filter(segment => segment.count > 0);

    const bar = segments.map(segment =>
        `<div class="split-seg ${segment.className}" style="flex: ${segment.count}"></div>`).join('');
    const legend = segments.map(segment =>
        `<span><i class="swatch ${segment.className}"></i>${segment.label} <b>${formatPercent(segment.count, simulations)}</b></span>`).join('');
    const description = segments.map(segment =>
        `${segment.label} ${formatPercent(segment.count, simulations)}`).join(', ');

    return `<div class="split-bar" role="img" aria-label="${description}">${bar}</div>
        <div class="split-legend">${legend}</div>`;
}

// Bin metadata for the hover readout, rebuilt on every run.
let gapChartBins = [];

function describeBin(lowGap, highGap, className) {
    if (className === 'tie') return `Within ${formatNumber(Math.max(highGap, -lowGap))} points either way`;
    const [near, far] = className === 'team-a' ? [Math.max(lowGap, 0), highGap] : [Math.abs(highGap), Math.abs(lowGap)];
    const team = className === 'team-a' ? 'Team A' : 'Team B';
    return near === far ? `${team} ahead by ${formatNumber(near)}` : `${team} ahead by ${formatNumber(near)}–${formatNumber(far)}`;
}

// Distribution of the points gap, binned symmetrically around zero so the dashed
// centre line is the break-even point and both sides can be weighed by eye.
function renderGapChart(counts, offset, simulations, lowestGap, highestGap) {
    const widest = Math.max(Math.abs(lowestGap), Math.abs(highestGap));
    gapChartBins = [];
    if (widest === 0) return '';

    // Never draw more bins than there are distinct gaps, so a two-outcome tie
    // shows two bars rather than two spikes in a field of empty ones. The count
    // stays odd to keep a bin centred on the break-even line.
    const distinct = counts.reduce((total, count) => total + (count > 0 ? 1 : 0), 0);
    const binCount = Math.min(HISTOGRAM_BINS, Math.max(3, distinct % 2 ? distinct : distinct + 1));
    const half = (binCount - 1) / 2;
    const binWidth = widest / half;
    const bins = new Array(binCount).fill(0);
    for (let index = 0; index < counts.length; index++) {
        if (!counts[index]) continue;
        bins[Math.round((index + offset) / binWidth) + half] += counts[index];
    }

    const tallest = Math.max(...bins);
    const bars = bins.map((count, index) => {
        const className = index < half ? 'team-b' : index > half ? 'team-a' : 'tie';
        gapChartBins.push({
            className,
            label: describeBin(Math.round((index - half - 0.5) * binWidth), Math.round((index - half + 0.5) * binWidth), className),
            share: formatPercent(count, simulations),
            runs: `${formatNumber(count)} of ${formatNumber(simulations)} runs`
        });
        return `<div class="gap-bar ${className}" style="height: ${(count / tallest * 100).toFixed(2)}%"></div>`;
    }).join('');

    return `<div class="gap-chart">
        <p class="gap-hint">Point at a bar to read its share</p>
        <div class="gap-tip" hidden>
            <div class="gap-tip-label"><i class="swatch"></i><span></span></div>
            <div class="gap-tip-value"><b></b><span></span></div>
        </div>
        <div class="gap-bars" tabindex="0" role="img" aria-label="Distribution of the points gap, from ${formatSigned(lowestGap)} to ${formatSigned(highestGap)}">${bars}</div>
        <div class="gap-axis"><span>${formatSigned(-widest)}</span><span>0</span><span>${formatSigned(widest)}</span></div>
    </div>`;
}

// Hover readout: the whole column is the hit target, not the drawn bar, so short
// bars are as easy to point at as tall ones. Arrow keys walk the same readout.
function attachGapChartHover() {
    const chart = document.querySelector('.gap-chart');
    if (!chart || !gapChartBins.length) return;
    const bars = chart.querySelector('.gap-bars');
    const tip = chart.querySelector('.gap-tip');
    const hint = chart.querySelector('.gap-hint');
    const swatch = tip.querySelector('.swatch');
    const labelText = tip.querySelector('.gap-tip-label span');
    const shareText = tip.querySelector('.gap-tip-value b');
    const runsText = tip.querySelector('.gap-tip-value span');
    let active = -1;

    function read(index) {
        const clamped = Math.max(0, Math.min(gapChartBins.length - 1, index));
        const bin = gapChartBins[clamped];
        if (clamped !== active) {
            active = clamped;
            bars.classList.add('is-reading');
            Array.from(bars.children).forEach((bar, position) => bar.classList.toggle('is-active', position === clamped));
            swatch.className = `swatch ${bin.className}`;
            labelText.textContent = bin.label;
            shareText.textContent = bin.share;
            runsText.textContent = bin.runs;
            hint.hidden = true;
            tip.hidden = false;
        }
        // Centre the tip over its column, then keep it inside the chart's box.
        const centre = (clamped + 0.5) / gapChartBins.length * bars.offsetWidth;
        const halfTip = tip.offsetWidth / 2;
        tip.style.left = `${Math.max(halfTip, Math.min(chart.offsetWidth - halfTip, centre))}px`;
    }

    function clear() {
        if (active === -1) return;
        active = -1;
        bars.classList.remove('is-reading');
        Array.from(bars.children).forEach(bar => bar.classList.remove('is-active'));
        tip.hidden = true;
        hint.hidden = false;
    }

    bars.addEventListener('pointermove', event => {
        const box = bars.getBoundingClientRect();
        read(Math.floor((event.clientX - box.left) / box.width * gapChartBins.length));
    });
    bars.addEventListener('pointerleave', clear);
    bars.addEventListener('blur', clear);
    bars.addEventListener('keydown', event => {
        const step = { ArrowLeft: -1, ArrowRight: 1, Home: -gapChartBins.length, End: gapChartBins.length }[event.key];
        if (step === undefined) {
            if (event.key === 'Escape') clear();
            return;
        }
        event.preventDefault();
        read(active === -1 ? Math.floor(gapChartBins.length / 2) : active + step);
    });
}

function renderDetails(entries) {
    const cells = entries.map(([label, value]) =>
        `<div><div class="detail-label">${label}</div><div class="detail-value">${value}</div></div>`).join('');
    return `<div class="detail-grid">${cells}</div>`;
}

function readOptionalNumber(id) {
    const raw = document.getElementById(id).value.trim();
    return raw === '' ? 0 : Number(raw);
}

// One row of the average-split readout: who, how much, and where it came from.
function renderBreakdownRow(className, name, value, detail) {
    return `<div>
            <span class="name"><i class="swatch ${className}"></i>${name}</span>
            <span class="value">${value}</span>
            <span class="detail">${detail}</span>
        </div>`;
}

function renderAverageSplit(averageA, averageB, detailA, detailB) {
    const total = averageA + averageB;
    const bar = total === 0 ? '' : `<div class="split-bar" role="img" aria-label="Team A ${formatNumber(averageA, 2)}, Team B ${formatNumber(averageB, 2)}">
            <div class="split-seg team-a" style="flex: ${averageA}"></div>
            <div class="split-seg team-b" style="flex: ${averageB}"></div>
        </div>`;
    return `${bar}
        <div class="split-breakdown">
            ${renderBreakdownRow('team-a', 'Team A', formatNumber(averageA, 2), detailA)}
            ${renderBreakdownRow('team-b', 'Team B', formatNumber(averageB, 2), detailB)}
        </div>`;
}

function validateSimulationInput(teamA, teamB, simulations, margin, bankedA, bankedB) {
    if (!Number.isInteger(teamA) || teamA < 0 || teamA > 50) return 'Team A must have 0–50 max-score players.';
    if (!Number.isInteger(teamB) || teamB < 0 || teamB > 50) return 'Team B must have 0–50 max-score players.';
    if (teamA + teamB > BASE_SCORES.length) return `The combined count cannot exceed ${BASE_SCORES.length}.`;
    if (!Number.isInteger(simulations) || simulations < 1 || simulations > MAX_SIMULATIONS) return `Simulations must be between 1 and ${MAX_SIMULATIONS.toLocaleString()}.`;
    if (margin !== null && (!Number.isInteger(margin) || margin < 1)) return 'Minimum margin must be a positive whole number.';
    for (const points of [bankedA, bankedB]) {
        if (!Number.isInteger(points) || points < 0 || points > MAX_BANKED_POINTS) return `Points from other players must be whole numbers from 0 to ${formatNumber(MAX_BANKED_POINTS)}.`;
    }
    return null;
}

async function runSimulation(event) {
    event?.preventDefault();
    const teamA = Number(document.getElementById('simulationTeamA').value);
    const teamB = Number(document.getElementById('simulationTeamB').value);
    const simulations = Number(document.getElementById('simulationRuns').value);
    const seedInput = document.getElementById('simulationSeed').value.trim();
    const marginInput = document.getElementById('simulationMargin').value.trim();
    const minimumMargin = marginInput === '' ? null : Number(marginInput);
    const bankedA = readOptionalNumber('simulationBankedA');
    const bankedB = readOptionalNumber('simulationBankedB');
    const error = validateSimulationInput(teamA, teamB, simulations, minimumMargin, bankedA, bankedB);
    if (error) return showError(error);

    const parsedSeed = seedInput === '' ? null : Number(seedInput);
    if (parsedSeed !== null && (!Number.isInteger(parsedSeed) || parsedSeed < -2147483648 || parsedSeed > 4294967295)) {
        return showError('Seed must be a whole number from −2,147,483,648 to 4,294,967,295.');
    }

    const seed = parsedSeed === null ? crypto.getRandomValues(new Uint32Array(1))[0] : parsedSeed;
    updateShareUrl({ teamA, teamB, simulations, seed, minimumMargin, bankedA, bankedB });
    const random = seededRandom(seed);
    const tiedPlayers = teamA + teamB;
    const teams = Array.from({ length: tiedPlayers }, (_, index) => index < teamA);
    const pointsAtStake = BASE_SCORES.slice(0, tiedPlayers).reduce((sum, score) => sum + score, 0);
    const button = document.getElementById('runSimulationButton');
    button.disabled = true;
    button.textContent = 'Simulating…';

    // Team A's score fixes everything else: Team B takes whatever is left of the
    // pot, so one tally indexed by Team A's score holds the exact distribution.
    const scoreCounts = new Int32Array(pointsAtStake + 1);
    const chunkSize = 5000;

    try {
        for (let start = 0; start < simulations; start += chunkSize) {
            const end = Math.min(start + chunkSize, simulations);
            for (let run = start; run < end; run++) {
                for (let i = tiedPlayers - 1; i > 0; i--) {
                    const j = Math.floor(random() * (i + 1));
                    [teams[i], teams[j]] = [teams[j], teams[i]];
                }
                let scoreA = 0;
                for (let position = 0; position < tiedPlayers; position++) {
                    if (teams[position]) scoreA += BASE_SCORES[position];
                }
                scoreCounts[scoreA]++;
            }
            button.textContent = `Simulating… ${Math.round(end / simulations * 100)}%`;
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    } finally {
        button.disabled = false;
        button.textContent = 'Run simulation';
    }

    // Points already banked outside the tie shift every comparison, so they are
    // folded in here rather than added to the display afterwards: a run is a win
    // for Team A only if the tie plus what each side already holds comes out ahead.
    const banked = bankedA - bankedB;
    const hasBanked = bankedA > 0 || bankedB > 0;
    let teamAWins = 0, teamBWins = 0, draws = 0, marginWins = 0, tieTotalA = 0;
    for (let score = 0; score <= pointsAtStake; score++) {
        const count = scoreCounts[score];
        if (!count) continue;
        tieTotalA += score * count;
        const gap = 2 * score - pointsAtStake + banked;
        if (gap > 0) teamAWins += count;
        else if (gap < 0) teamBWins += count;
        else draws += count;
        if (minimumMargin !== null && gap >= minimumMargin) marginWins += count;
    }

    const averageTieA = tieTotalA / simulations;
    const averageTieB = pointsAtStake - averageTieA;

    // Re-index the tally by points gap, carrying the banked offset so the chart's
    // centre line is the real break-even point and every figure reads from here.
    const gapCounts = new Int32Array(2 * pointsAtStake + 1);
    for (let score = 0; score <= pointsAtStake; score++) gapCounts[2 * score] = scoreCounts[score];
    const gapOffset = -pointsAtStake + banked;
    const gapAt = quantile => quantileFromCounts(gapCounts, gapOffset, simulations, quantile);
    const lowestGap = gapAt(0);
    const highestGap = gapAt(1);

    const averageGap = averageTieA - averageTieB + banked;
    const [ciLow, ciHigh] = wilsonInterval(teamAWins, simulations);
    const details = [
        ['Simulated runs', formatNumber(simulations)],
        ['Random seed', String(seed)],
        ['Tied places', tiedPlayers ? `1–${tiedPlayers}` : 'none'],
        ['Points at stake', formatNumber(pointsAtStake)],
        ['95% confidence', `${(ciLow * 100).toFixed(2)}–${(ciHigh * 100).toFixed(2)}%`]
    ];
    if (hasBanked) details.push(['From other players', `A ${formatNumber(bankedA)}, B ${formatNumber(bankedB)}`]);
    if (draws > 0) details.push(['Dead heats', `${formatNumber(draws)} runs`]);

    const threshold = minimumMargin === null ? '' : `<div class="sim-panel threshold">
            <span class="figure-label">Team A wins by ${formatNumber(minimumMargin)} points or more</span>
            <span class="figure-value">${formatPercent(marginWins, simulations)}</span>
        </div>`;

    const shareOfStake = points => pointsAtStake === 0 ? 'no points at stake' : `${(points / pointsAtStake * 100).toFixed(2)}% of the tie`;
    const split = hasBanked
        ? `<div class="sim-panel">
            <h4>Expected match score</h4>
            ${renderAverageSplit(bankedA + averageTieA, bankedB + averageTieB,
                `${formatNumber(bankedA)} banked plus ${formatNumber(averageTieA, 2)} from the tie`,
                `${formatNumber(bankedB)} banked plus ${formatNumber(averageTieB, 2)} from the tie`)}
        </div>`
        : `<div class="sim-panel">
            <h4>Average split of the ${formatNumber(pointsAtStake)} points at stake</h4>
            ${renderAverageSplit(averageTieA, averageTieB, shareOfStake(averageTieA), shareOfStake(averageTieB))}
        </div>`;

    document.getElementById('simulationResultContent').innerHTML = `
        <div class="sim-panel">
            <div class="verdict-label">Team A wins the ${hasBanked ? 'match' : 'tie'}</div>
            <div class="verdict-value">${formatPercent(teamAWins, simulations)}</div>
            <div class="verdict-reading">${describeChance(teamAWins, simulations)}</div>
            ${renderSplitBar(teamAWins, teamBWins, draws, simulations)}
        </div>
        ${split}
        <div class="sim-panel">
            <h4>${hasBanked ? 'Final' : 'Tie'} points gap, Team A minus Team B</h4>
            <div class="figure-row">
                <div>
                    <div class="figure-label">Average</div>
                    <div class="figure-value">${formatSigned(averageGap)}</div>
                </div>
                <div>
                    <div class="figure-label">Median</div>
                    <div class="figure-value">${formatSigned(gapAt(0.5))}</div>
                </div>
            </div>
            ${renderGapChart(gapCounts, gapOffset, simulations, lowestGap, highestGap)}
        </div>
        ${threshold}
        <div class="sim-panel">${renderDetails(details)}</div>
        <p class="simulation-note">Every ordering of the tied players is treated as equally likely. Players outside the tied group are left out${hasBanked ? ', apart from the points entered above, which are treated as already settled' : ''}.</p>`;
    attachGapChartHover();
    document.getElementById('simulationResult').classList.remove('hidden');
}

// A run is fully described by its inputs plus the seed it landed on, so the
// address bar can carry the whole thing. Sharing is then just copying the URL,
// and the seed makes a shared link reproduce the same numbers.
const SHARE_FIELDS = {
    a: 'simulationTeamA', b: 'simulationTeamB', runs: 'simulationRuns',
    seed: 'simulationSeed', margin: 'simulationMargin',
    pa: 'simulationBankedA', pb: 'simulationBankedB'
};

function applySharedInputs() {
    const params = new URLSearchParams(location.search);
    let shared = false;
    for (const [key, id] of Object.entries(SHARE_FIELDS)) {
        const value = (params.get(key) ?? '').trim();
        if (!value) continue;
        document.getElementById(id).value = value;
        shared = true;
    }
    // A link carrying banked points should show where they came from.
    if (params.get('pa') || params.get('pb')) document.getElementById('bankedPointsSection').open = true;
    return shared;
}

function updateShareUrl({ teamA, teamB, simulations, seed, minimumMargin, bankedA, bankedB }) {
    const params = new URLSearchParams({ a: teamA, b: teamB, runs: simulations, seed });
    if (minimumMargin !== null) params.set('margin', minimumMargin);
    if (bankedA > 0) params.set('pa', bankedA);
    if (bankedB > 0) params.set('pb', bankedB);
    history.replaceState(null, '', `${location.pathname}?${params}`);
}

async function copyShareLink() {
    try {
        await navigator.clipboard.writeText(location.href);
        showSuccess('Link copied. It opens with these settings and reruns the same seed.');
    } catch {
        showError('Could not reach the clipboard. Copy the link from the address bar instead.');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('simulationForm').addEventListener('submit', runSimulation);
    document.getElementById('copySimulationLinkButton').addEventListener('click', copyShareLink);
    // A shared link should show its result, not just its inputs.
    if (applySharedInputs()) runSimulation();
});
