const MAX_SIMULATIONS = 1000000;
const HISTOGRAM_BINS = 41;

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

function validateSimulationInput(teamA, teamB, simulations, margin) {
    if (!Number.isInteger(teamA) || teamA < 0 || teamA > 50) return 'Team A must have 0–50 max-score players.';
    if (!Number.isInteger(teamB) || teamB < 0 || teamB > 50) return 'Team B must have 0–50 max-score players.';
    if (teamA + teamB > BASE_SCORES.length) return `The combined count cannot exceed ${BASE_SCORES.length}.`;
    if (!Number.isInteger(simulations) || simulations < 1 || simulations > MAX_SIMULATIONS) return `Simulations must be between 1 and ${MAX_SIMULATIONS.toLocaleString()}.`;
    if (margin !== null && (!Number.isInteger(margin) || margin < 1)) return 'Minimum margin must be a positive whole number.';
    return null;
}

async function runSimulation(event) {
    event.preventDefault();
    const teamA = Number(document.getElementById('simulationTeamA').value);
    const teamB = Number(document.getElementById('simulationTeamB').value);
    const simulations = Number(document.getElementById('simulationRuns').value);
    const seedInput = document.getElementById('simulationSeed').value.trim();
    const marginInput = document.getElementById('simulationMargin').value.trim();
    const minimumMargin = marginInput === '' ? null : Number(marginInput);
    const error = validateSimulationInput(teamA, teamB, simulations, minimumMargin);
    if (error) return showError(error);

    const parsedSeed = seedInput === '' ? null : Number(seedInput);
    if (parsedSeed !== null && (!Number.isInteger(parsedSeed) || parsedSeed < -2147483648 || parsedSeed > 4294967295)) {
        return showError('Seed must be a whole number from −2,147,483,648 to 4,294,967,295.');
    }

    const seed = parsedSeed === null ? crypto.getRandomValues(new Uint32Array(1))[0] : parsedSeed;
    const random = seededRandom(seed);
    const tiedPlayers = teamA + teamB;
    const teams = Array.from({ length: tiedPlayers }, (_, index) => index < teamA);
    const pointsAtStake = BASE_SCORES.slice(0, tiedPlayers).reduce((sum, score) => sum + score, 0);
    const button = document.getElementById('runSimulationButton');
    button.disabled = true;
    button.textContent = 'Simulating…';

    let teamAWins = 0, teamBWins = 0, draws = 0, marginWins = 0;
    let totalA = 0, totalB = 0;
    // Team A's score fixes the gap (gap = 2·scoreA − pointsAtStake), so a single
    // tally indexed by that score holds the exact distribution of every run.
    const scoreCounts = new Int32Array(pointsAtStake + 1);
    const chunkSize = 5000;

    for (let start = 0; start < simulations; start += chunkSize) {
        const end = Math.min(start + chunkSize, simulations);
        for (let run = start; run < end; run++) {
            for (let i = tiedPlayers - 1; i > 0; i--) {
                const j = Math.floor(random() * (i + 1));
                [teams[i], teams[j]] = [teams[j], teams[i]];
            }
            let scoreA = 0, scoreB = 0;
            for (let position = 0; position < tiedPlayers; position++) {
                if (teams[position]) scoreA += BASE_SCORES[position];
                else scoreB += BASE_SCORES[position];
            }
            const difference = scoreA - scoreB;
            if (difference > 0) teamAWins++;
            else if (difference < 0) teamBWins++;
            else draws++;
            if (minimumMargin !== null && difference >= minimumMargin) marginWins++;
            totalA += scoreA;
            totalB += scoreB;
            scoreCounts[scoreA]++;
        }
        button.textContent = `Simulating… ${Math.round(end / simulations * 100)}%`;
        await new Promise(resolve => setTimeout(resolve, 0));
    }

    // Re-index the tally by points gap: scoreA maps to gap 2·scoreA − pointsAtStake,
    // which keeps every derived figure below reading from one source.
    const gapCounts = new Int32Array(2 * pointsAtStake + 1);
    for (let score = 0; score <= pointsAtStake; score++) gapCounts[2 * score] = scoreCounts[score];
    const gapOffset = -pointsAtStake;
    const gapAt = quantile => quantileFromCounts(gapCounts, gapOffset, simulations, quantile);
    const lowestGap = gapAt(0);
    const highestGap = gapAt(1);

    const averageGap = (totalA - totalB) / simulations;
    const [ciLow, ciHigh] = wilsonInterval(teamAWins, simulations);
    const details = [
        ['Simulated runs', formatNumber(simulations)],
        ['Random seed', String(seed)],
        ['Tied places', tiedPlayers ? `1–${tiedPlayers}` : 'none'],
        ['Points at stake', formatNumber(pointsAtStake)],
        ['95% confidence', `${(ciLow * 100).toFixed(2)}–${(ciHigh * 100).toFixed(2)}%`]
    ];
    if (draws > 0) details.push(['Dead heats', `${formatNumber(draws)} runs`]);

    const threshold = minimumMargin === null ? '' : `<div class="sim-panel threshold">
            <span class="figure-label">Team A wins by ${formatNumber(minimumMargin)} points or more</span>
            <span class="figure-value">${formatPercent(marginWins, simulations)}</span>
        </div>`;

    document.getElementById('simulationResultContent').innerHTML = `
        <div class="sim-panel">
            <div class="verdict-label">Team A wins the tie</div>
            <div class="verdict-value">${formatPercent(teamAWins, simulations)}</div>
            <div class="verdict-reading">${describeChance(teamAWins, simulations)}</div>
            ${renderSplitBar(teamAWins, teamBWins, draws, simulations)}
        </div>
        <div class="sim-panel">
            <h4>Points gap, Team A minus Team B</h4>
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
        <p class="simulation-note">Every ordering of the tied players is treated as equally likely. Players outside the tied group are left out.</p>`;
    attachGapChartHover();
    document.getElementById('simulationResult').classList.remove('hidden');
    button.disabled = false;
    button.textContent = 'Run simulation';
}

function switchView(viewName) {
    document.getElementById('calculatorView').classList.toggle('hidden', viewName !== 'calculator');
    document.getElementById('simulationView').classList.toggle('hidden', viewName !== 'simulation');
    document.querySelectorAll('[data-view]').forEach(button => {
        const active = button.dataset.view === viewName;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
    });
    history.replaceState(null, '', viewName === 'simulation' ? '#simulation' : location.pathname + location.search);
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => switchView(button.dataset.view)));
    document.getElementById('simulationForm').addEventListener('submit', runSimulation);
    if (location.hash === '#simulation') switchView('simulation');
});
