const INDICATOR_ID = 'deepseek-hours-indicator';
const PEAK_WINDOWS_UTC = Object.freeze([
    { start: 1 * 60, end: 4 * 60 },
    { start: 6 * 60, end: 10 * 60 },
]);
const UPDATE_INTERVAL_MS = 30_000;

let updateTimer;

/**
 * Peak windows are 01:00-04:00 and 06:00-10:00 UTC. All other times are low.
 * UTC arithmetic keeps the result identical in every local time zone and across DST.
 */
function getDeepSeekPeriod(now = new Date()) {
    const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const isHigh = PEAK_WINDOWS_UTC.some(({ start, end }) => utcMinutes >= start && utcMinutes < end);
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const day = now.getUTCDate();

    let nextChange;
    if (utcMinutes < PEAK_WINDOWS_UTC[0].start) {
        nextChange = new Date(Date.UTC(year, month, day, 1, 0));
    } else if (utcMinutes < PEAK_WINDOWS_UTC[0].end) {
        nextChange = new Date(Date.UTC(year, month, day, 4, 0));
    } else if (utcMinutes < PEAK_WINDOWS_UTC[1].start) {
        nextChange = new Date(Date.UTC(year, month, day, 6, 0));
    } else if (utcMinutes < PEAK_WINDOWS_UTC[1].end) {
        nextChange = new Date(Date.UTC(year, month, day, 10, 0));
    } else {
        nextChange = new Date(Date.UTC(year, month, day + 1, 1, 0));
    }

    return { isLow: !isHigh, nextChange };
}

function formatDuration(milliseconds) {
    const totalMinutes = Math.max(0, Math.ceil(milliseconds / 60_000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours === 0) {
        return `${minutes}m`;
    }

    return `${hours}h ${minutes}m`;
}

function updateIndicator(indicator) {
    const now = new Date();
    const { isLow, nextChange } = getDeepSeekPeriod(now);
    const state = isLow ? 'low' : 'high';
    const nextState = isLow ? 'HIGH' : 'LOW';
    const localTime = new Intl.DateTimeFormat(undefined, {
        weekday: 'short',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
    }).format(nextChange);
    const description = `DeepSeek ${state.toUpperCase()} hours. ${nextState} in ${formatDuration(nextChange - now)} (${localTime})`;

    indicator.dataset.state = state;
    indicator.querySelector('.deepseek-hours-label').textContent = state.toUpperCase();
    indicator.title = description;
    indicator.setAttribute('aria-label', description);
}

function mountIndicator() {
    const host = document.getElementById('top-settings-holder') || document.getElementById('top-bar');
    if (!host) {
        return false;
    }

    let slot = document.getElementById(`${INDICATOR_ID}-slot`);
    if (!slot) {
        slot = document.createElement('div');
        slot.id = `${INDICATOR_ID}-slot`;
        slot.className = 'deepseek-hours-slot';
    }

    let indicator = document.getElementById(INDICATOR_ID);
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = INDICATOR_ID;
        indicator.className = 'deepseek-hours-indicator';
        indicator.setAttribute('role', 'status');
        indicator.setAttribute('aria-live', 'polite');
        indicator.innerHTML = '<span class="deepseek-hours-label"></span>';
        slot.appendChild(indicator);
    }

    if (slot.parentElement !== host) {
        host.appendChild(slot);
    }

    updateIndicator(indicator);
    return true;
}

function start() {
    if (!mountIndicator()) {
        window.setTimeout(start, 250);
        return;
    }

    window.clearInterval(updateTimer);
    updateTimer = window.setInterval(() => {
        const indicator = document.getElementById(INDICATOR_ID);
        if (indicator) {
            updateIndicator(indicator);
        } else {
            mountIndicator();
        }
    }, UPDATE_INTERVAL_MS);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
    start();
}
