import { registerSlashCommand } from '../../../slash-commands.js';

const INDICATOR_ID = 'deepseek-hours-indicator';
const SLASH_COMMAND_NAME = 'DSH';
const PEAK_WINDOWS_UTC = Object.freeze([
    { start: 1 * 60, end: 4 * 60 },
    { start: 6 * 60, end: 10 * 60 },
]);
const UPDATE_INTERVAL_MS = 30_000;

let updateTimer;

/**
 * Peak windows are 01:00-04:00 and 06:00-10:00 UTC on weekdays. Weekends
 * are low-rate all day. Beijing weekends correspond to Friday 16:00 UTC through
 * Sunday 16:00 UTC, keeping all calculations in UTC.
 */
function getDeepSeekPeriod(now = new Date()) {
    const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const isBeijingWeekend = isBeijingWeekendUtc(now);
    const isHigh = !isBeijingWeekend
        ? PEAK_WINDOWS_UTC.some(({ start, end }) => utcMinutes >= start && utcMinutes < end)
        : false;
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const day = now.getUTCDate();

    // Search the next few UTC boundaries for the first actual state change.
    // This skips weekend boundaries that do not change the displayed state.
    const boundaryMinutes = PEAK_WINDOWS_UTC.flatMap(({ start, end }) => [start, end]);
    let nextChange = null;
    for (let dayOffset = 0; dayOffset <= 4 && !nextChange; dayOffset += 1) {
        for (const boundaryMinute of boundaryMinutes) {
            const candidate = new Date(Date.UTC(year, month, day + dayOffset, 0, boundaryMinute));
            if (candidate <= now) {
                continue;
            }

            const candidatePeriod = getDeepSeekPeriodAt(candidate);
            if (candidatePeriod !== isHigh) {
                nextChange = candidate;
                break;
            }
        }
    }

    return { isLow: !isHigh, nextChange };
}

function getDeepSeekPeriodAt(now) {
    const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    if (isBeijingWeekendUtc(now)) {
        return false;
    }

    return PEAK_WINDOWS_UTC.some(({ start, end }) => utcMinutes >= start && utcMinutes < end);
}

function isBeijingWeekendUtc(now) {
    const utcDay = now.getUTCDay();
    const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();

    return utcDay === 6
        || (utcDay === 0 && utcMinutes < 16 * 60)
        || (utcDay === 5 && utcMinutes >= 16 * 60);
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

function updateIndicator(indicator, now = new Date()) {
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

    return nextChange;
}

function scheduleRefresh(nextChange) {
    window.clearTimeout(updateTimer);

    // Refresh at the next boundary or within 30 seconds.
    const millisecondsUntilChange = nextChange.getTime() - Date.now();
    const delay = Math.min(
        UPDATE_INTERVAL_MS,
        Math.max(250, millisecondsUntilChange + 100),
    );
    updateTimer = window.setTimeout(refreshIndicator, delay);
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

    return true;
}

function renderIndicatorAt(now) {
    if (!mountIndicator()) {
        return null;
    }

    const indicator = document.getElementById(INDICATOR_ID);
    if (!indicator) {
        return null;
    }

    return updateIndicator(indicator, now);
}

function refreshIndicator() {
    const nextChange = renderIndicatorAt(new Date());
    if (nextChange === null) {
        updateTimer = window.setTimeout(refreshIndicator, 250);
        return;
    }

    scheduleRefresh(nextChange);
}

function runDeepSeekHoursCommand(_, value) {
    const argument = Array.isArray(value) ? value[0] : value;
    const requestedState = String(argument ?? '').trim().toLowerCase();

    if (requestedState === 'refresh') {
        refreshIndicator();
        return '';
    }

    if (requestedState !== 'refresh') {
        return `Usage: /${SLASH_COMMAND_NAME} refresh`;
    }
}

function refreshWhenVisible() {
    if (!document.hidden) {
        refreshIndicator();
    }
}

function start() {
    window.clearTimeout(updateTimer);
    refreshIndicator();

    // Refresh when the page becomes active again.
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('focus', refreshIndicator);
    window.addEventListener('pageshow', refreshIndicator);
}

registerSlashCommand(
    SLASH_COMMAND_NAME,
    runDeepSeekHoursCommand,
    [],
    `Usage: /${SLASH_COMMAND_NAME} refresh`,
);

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
    start();
}
