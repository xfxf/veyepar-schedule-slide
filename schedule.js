'use strict';

/**
 * @typedef RoomOptions
 * @type object
 * @property {string} room - room name (as slug)
 * @property {string} show - show name
 * @property {string} client - client name
 * @property {number} timeWarp - number of milliseconds that the display should be timewarped by
 * @property {boolean} clockOnly - show only the clock (including timewarp)
 * @property {string} message - custom message display
 */

/**
 * [Veyepar presenter type](https://github.com/xfxf/veyepar/blob/12bcfe08ca8f8dd1689275d0a0350522c45533ca/dj/main/views.py#L421-L429)
 *
 * @typedef {Object} VeyeparPresenter
 * @property {string} id - opaque presenter UUID
 * @property {string} name - presenter's name
 * @property {string} avatar_url - presenter's photo
 */

/**
 * [Veyepar episode type](https://github.com/xfxf/veyepar/blob/12bcfe08ca8f8dd1689275d0a0350522c45533ca/dj/main/views.py#L363)
 *
 * Episodes are otherwise known as scheduled event slots. Someone stands up and talks. Everyone
 * claps. Many words. Then more claps. Then comments from the audience. Then more claps.
 *
 * @typedef {Object} VeyeparEpisode
 * @property {string} start - episode start time as timestamp with zoneinfo
 * @property {string} start_at - 5 minutes before the episode start time, formatted as `HH:MM dd.mm.YYYY`
 * @property {string} location - room name
 * @property {string} location_slug - room slug
 * @property {string} name - episode name
 * @property {string} slug - episode slug
 * @property {string} authors - episode presenter names, concatenated
 * @property {string} duration - episode duration, as `HH:MM:SS`, or sometimes `HH:MMM:SS`
 * @property {string} track - episode track name, eg: workshops, education
 * @property {boolean} prerecord - the episode is pre-recorded
 * @property {VeyeparPresenter[]} presenters - presenter names
 * @property {string} conf_url - the URL to the episode on the event's website
 * @property {string} conf_key - event-specific episode ID
 */

/**
 * Our mangling of Veyepar's episode type.
 *
 * @typedef {Object} Episode
 * @property {Date} start - episode start time as Date
 * @property {number} startMillis - episode start time as milliseconds since epoch
 * @property {Date} end - episode end time as Date
 * @property {number} endMillis - episode end time as milliseconds since epoch
 * @property {number} durationSeconds - episode duration in seconds
 * @property {string} start_at - 5 minutes before the episode start time, formatted as `HH:MM dd.mm.YYYY`
 * @property {string} location - room name
 * @property {string} location_slug - room slug
 * @property {string} name - episode name
 * @property {string} slug - episode slug
 * @property {string} authors - episode presenter names, concatenated
 * @property {string} duration - episode duration, as `HH:MM:SS`, or sometimes `HH:MMM:SS`
 * @property {string} track - episode track name, eg: workshops, education
 * @property {boolean} prerecord - the episode is pre-recorded
 * @property {VeyeparPresenter[]} presenters - presenter names
 * @property {string} conf_url - the URL to the episode on the event's website
 * @property {string} conf_key - event-specific episode ID
 */

// Shown when there are no more events today in a room.
const FINISHED_FOR_DAY_TITLE = 'Finished for the day!';
const FINISHED_FOR_DAY_MESSAGE = 'Proceedings in {room} have finished.';

// Shown when there are no days of the conference that are today.
// Query parameter ?lt=(ISO8601 DateTime) can activate a time-warp for testing...
const NO_EVENTS_TODAY = 'No events scheduled today!';

// Shown when there's an event in a room right now.
const CURRENT_EVENT_TITLE = 'Starting soon';

/**
 * If the next event starts in less than `CURRENT_EVENT_START_SECS` seconds,
 * treat is as the "current" event, and display `CURRENT_EVENT_TITLE`
 * ("Starting soon"), instead of an absolute time.
 *
 * This can be overridden with the `data-current-event-start` attribute on the
 * `<body>` tag.
 *
 * @type {number}
 */
const CURRENT_EVENT_START_SECS = parseInt(document.body.dataset.currentEventStartSecs) || 60;

/**
 * The maximum number of seconds _after_ an event's scheduled start time to keep
 * treating it as the "current" event. Using this, rather than the scheduled
 * end time, stops us advertising talks that finished very early (eg: a talk in
 * a 50 minute slot that finished in 20 minutes).
 *
 * By default, this is 600 seconds (10 minutes).
 *
 * Events shorter than `MAX_DURATION_SECS` will treated as the "current" event
 * for their originally scheduled time (eg: a 5 minute talk will only be current
 * for those 5 minutes, not 10 minutes.).
 *
 * This can be overridden with the `data-max-duration-secs` attribute on the
 * `<body>` tag. If an event's talks consistently start late, then increase this
 * number.
 *
 * @type {number}
 */
const MAX_DURATION_SECS = parseInt(document.body.dataset.maxDurationSecs) || 600;

// First line of error text
const ERROR_MESSAGE = 'Well, this is embarrassing. :(';

// Default veyepar show & client
const DEFAULT_CLIENT = document.body.dataset.client;
const DEFAULT_SHOW = document.body.dataset.show;

// Show time remaining to next event, rather than an absolute time.
const NEXT_EVENT_REMAINING = document.body.dataset.nextEventRemaining == '1';

// Shown for when a next event is scheduled.
const NEXT_EVENT_TITLE = 'At {time}';

// Locale to use for date formatting.
const LOCALE = document.body.lang || 'en-AU';

// Use the layout for showing two events at once.
const TWO_EVENTS = document.body.dataset.twoEvents === '1';

const FORMATTER = new Intl.DateTimeFormat(LOCALE, {
    hour: 'numeric',
    minute: 'numeric',
    hour12:
        document.body.dataset.hour12 === undefined
            ? undefined
            : document.body.dataset.hour12 === '1',
});

const firstElem = {
    startingAtElem: document.getElementById('starting-at'),
    titleElem: document.getElementById('title'),
    presenterElem: document.getElementById('presenter'),
};

const secondElem = {
    startingAtElem: document.getElementById('starting-at2'),
    titleElem: document.getElementById('title2'),
    presenterElem: document.getElementById('presenter2'),
};

const nowElem = document.getElementById('now');
const timeWarpElem = document.getElementById('timewarp-indicator');
const options = getOptions();

/**
 * This room's schedule.
 * @type {Episode[]}
 */
const roomSchedule = [];

// Veyepar schedule JSON URL
// https://portal2.nextdayvideo.com.au/main/C/{...}/S/{...}.json
// Cache bust every 5 minutes (but we don't actually reload this).
const SCHEDULE_URL =
    `https://portal.nextdayvideo.com.au/main/C/${options.client}/S/${options.show}.json?_=` +
    Math.floor(new Date().getTime() / 300000);
// const SCHEDULE_URL = './schedule.json?_=' + Math.floor((new Date()).getTime() / 300000);

/**
 * Formats a relative time in milliseconds.
 * @param {number} time - duration in milliseconds, must be positive
 * @returns {string} Formatted description, like "In Y minute(s)"
 */
function formatRelativeTime(time) {
    const mins = Math.ceil(time / 60_000);
    const hours = Math.floor(time / 3600_000);
    const days = Math.floor(time / 86_400_000);

    if (hours == 0) {
        return `In ${mins} minute${mins == 1 ? '' : 's'}`;
    } else if (days == 0) {
        return `In ${hours} hour${hours == 1 ? '' : 's'}`;
    } else {
        return `In ${days} day${days == 1 ? '' : 's'}`;
    }
}

/**
 * Formats a time in the default format.
 * @param {Date} date - input Date object
 * @returns {String} formatted time
 */
function formatTime(date) {
    return FORMATTER.format(date);
}

/**
 * Displays an error message on fatal errors.
 * @param {string} message - message to show
 */
function fatal(message) {
    setInnerText(firstElem.titleElem, ERROR_MESSAGE);
    setInnerText(firstElem.presenterElem, message);
    setInnerText(firstElem.startingAtElem, '');
    setInnerText(secondElem.titleElem, '');
    setInnerText(secondElem.presenterElem, '');
    setInnerText(secondElem.startingAtElem, '');
}

/**
 * Get all passed query parameters to the page.
 * @returns {Record<string, string>}
 */
function getQueryParams() {
    const ret = {};
    const params = new URLSearchParams(document.location.search);
    if (params.size == 0) {
        // no params available.
        console.error('No query parameters specified');
        return ret;
    }

    for (const [key, val] of params.entries()) {
        if (key in ret) {
            console.warn(`Ignoring redefined parameter: ${key}=${val}`);
            continue;
        }

        if (val === undefined) {
            console.warn(`Ignoring undefined parameter: ${key}`);
            continue;
        }

        ret[key] = val;
    }

    return ret;
}

/**
 * Parse all options passed to the page.
 *
 * @returns {RoomOptions} Room options.
 */
function getOptions() {
    const params = getQueryParams();

    // For testing: set `lt` to a time to treat as the "load time" of this page.
    var timeWarp = 0;
    if (params['lt']) {
        timeWarp = new Date(params['lt']).getTime() - new Date().getTime();
    }
    if (Number.isNaN(timeWarp)) {
        timeWarp = 0;
    }

    return {
        // Select the room that we're in
        room: params['r'],
        show: params['show'] ? params['show'] : DEFAULT_SHOW,
        client: params['client'] ? params['client'] : DEFAULT_CLIENT,
        timeWarp: timeWarp,
        clockOnly: params['c'] == '1',
        message: params['m'],
    };
}

/**
 * Loads the event schedule.
 *
 * @returns {Promise<VeyeparEpisode[]>} parsed schedule data
 */
function getSchedule() {
    return new Promise((resolve, reject) => {
        const req = new XMLHttpRequest();
        req.addEventListener('load', () => {
            if (req.status == 200) {
                var schedule;
                try {
                    schedule = JSON.parse(req.response);
                } catch (e) {
                    reject('Error parsing schedule: ' + e);
                    return;
                }

                if (!schedule || !Array.isArray(schedule)) {
                    reject('Incorrect type for schedule');
                } else {
                    resolve(schedule);
                }
            } else {
                reject('Error loading schedule: HTTP ' + req.status);
            }
        });
        req.addEventListener('error', () => {
            reject('Error fetching schedule');
        });

        req.open('GET', SCHEDULE_URL);
        req.send();
    });
}

/**
 * Parses a Veyepar duration string into a number of seconds.
 * @param {String} duration
 * @returns {number}
 */
function parseDuration(duration) {
    // Serialisation: https://github.com/CarlFK/veyepar/blob/d2e168161748f5076b24240844b9f4bff8695e79/dj/main/views.py#L367
    // This dumps out the underlying Episode objects as JSON.
    //
    // `Episode.duration` defined here:
    // https://github.com/CarlFK/veyepar/blob/4337edf3a917cc4e8371f469d32669dd8c4d538b/dj/main/models.py#L284-L285
    // This is declared as "HH:MM:SS", but is stored in a CharField.
    duration = duration.split(':', 3);
    return parseInt(duration[0]) * 3600 + parseInt(duration[1]) * 60 + parseInt(duration[2]);
}

/**
 * Get the current or next event, and the one after it.
 *
 * May return `null` entries where we are done for the day.
 *
 * `second` will always be `null` if `!TWO_EVENTS`.
 * @param {number} nowMillis - current time in milliseconds since epoch
 * @returns {{first: Episode?, second: Episode?}}
 */
function getFeaturedEvents(nowMillis) {
    var o = {
        first: null,
        second: null,
    };

    // roomSchedule should be in chronological order
    for (const event of roomSchedule) {
        const end = Math.min(event.startMillis + MAX_DURATION_SECS * 1000, event.endMillis);

        if (event.startMillis <= nowMillis && end > nowMillis) {
            // Current event!
            o.first = event;
            if (!TWO_EVENTS) {
                break;
            }
            continue;
        }

        // Upcoming event
        if (event.startMillis > nowMillis) {
            if (!o.first) {
                // No "first" event yet
                o.first = event;
                if (!TWO_EVENTS) {
                    break;
                }
                continue;
            } else {
                // Second event
                o.second = event;
                break;
            }
        }
    }

    return o;
}

/**
 * Set `innerText` property of an element, if it has changed.
 *
 * This avoids forcing the browser to do a page re-layout, and potentially flicker.
 * @param {HTMLElement?} elem The element to change. If `null`, changes nothing.
 * @param {String} newText New text to set.
 */
function setInnerText(elem, newText) {
    if (elem && elem.innerText != newText) {
        elem.innerText = newText;
    }
}

/**
 * Updates the clock on the page.
 * @returns {number} Current time in milliseconds since epoch, including timewarp.
 */
function updateClock() {
    if (timeWarpElem != null) {
        timeWarpElem.style.display = options.timeWarp != 0 ? '' : 'none';
    }

    const nowMillis = new Date().getTime() + options.timeWarp;
    setInnerText(nowElem, formatTime(new Date(nowMillis)));
    return nowMillis;
}

/**
 * Refresh episode info
 * @param {{startingAtElem: HTMLElement?, titleElem: HTMLElement?, presenterElem: HTMLElement?}} elem - target elements
 * @param {Episode?} episode - episode data
 * @param {number} nowMillis - current time in milliseconds including timewarp
 */
function fillElems(elem, episode, nowMillis) {
    if (!episode) {
        setInnerText(elem.startingAtElem, '');
        setInnerText(elem.presenterElem, '');
        setInnerText(elem.titleElem, '');
        return;
    }

    if (episode.startMillis > nowMillis + CURRENT_EVENT_START_SECS * 1000) {
        // Event is upcoming
        if (NEXT_EVENT_REMAINING) {
            setInnerText(elem.startingAtElem, formatRelativeTime(first.startMillis - nowMillis));
        } else {
            setInnerText(
                elem.startingAtElem,
                NEXT_EVENT_TITLE.replace('{time}', formatTime(episode.start))
            );
        }
    } else {
        // Event is now
        setInnerText(elem.startingAtElem, CURRENT_EVENT_TITLE);
    }

    setInnerText(elem.titleElem, episode.name);
    setInnerText(elem.presenterElem, episode.authors);
}

/**
 * Refresh all the things.
 */
function updateDisplay() {
    const nowMillis = updateClock();
    const { first, second } = getFeaturedEvents(nowMillis);

    if (!first) {
        setInnerText(firstElem.startingAtElem, '');
        setInnerText(firstElem.titleElem, FINISHED_FOR_DAY_TITLE);
        setInnerText(
            firstElem.presenterElem,
            FINISHED_FOR_DAY_MESSAGE.replace('{room}', options.room)
        );
        fillElems(second, null, nowMillis);
        return;
    }

    fillElems(firstElem, first, nowMillis);

    if (!TWO_EVENTS || !second) {
        return;
    }

    // Second event handling.
    fillElems(secondElem, second, nowMillis);
}

(() => {
    document.addEventListener('keypress', (ev) => {
        let delta = 0;
        switch (ev.key) {
            case 'q':
            case 'h':
                // -24 hours
                delta = -86_400_000;
                break;
            case 'J':
                // -30 minutes
                delta = -1_800_000;
                break;
            case 'j':
                // -5 minutes
                delta = -300_000;
                break;
            case 'k':
                // +5 minutes
                delta = 300_000;
                break;
            case 'K':
                // +30 minutes
                delta = 1_800_000;
                break;
            case 'x':
            case 'l':
                // +24 hours
                delta = 86_400_000;
                break;
            case 'n':
                console.log('Time warp disabled');
                options.timeWarp = 0;
                ev.preventDefault();
                return;
        }

        if (delta != 0) {
            options.timeWarp += delta;
            const nowMillis = new Date().getTime() + options.timeWarp;
            console.log(`Time warp: ${options.timeWarp / 1000} seconds (press n to reset)`);
            ev.preventDefault();
        }
    });

    if (options.clockOnly) {
        updateClock();
        setInterval(updateClock, 1000);
        titleElem.innerText = options.message || '';
        return;
    }

    getSchedule()
        .then((scheduleData) => {
            const loadTime = new Date(new Date().getTime() + options.timeWarp);
            if (options.timeWarp != 0) {
                console.log(
                    'Timewarp engaged: ' +
                        (options.timeWarp > 0 ? '+' : '') +
                        options.timeWarp +
                        ' ms. Current time: ' +
                        loadTime
                );
            }

            // Find which room should apply
            const roomList = new Set(scheduleData.map((e) => e.location));
            const roomSlugList = new Set(scheduleData.map((e) => e.location_slug));
            if (!(roomList.has(options.room) || roomSlugList.has(options.room))) {
                fatal(
                    'Unknown room (?r=' +
                        (options.room || '') +
                        '), options: ' +
                        Array.from(roomSlugList).join(', ')
                );
                return;
            }

            scheduleData = scheduleData.filter(
                (e) => e.location == options.room || e.location_slug == options.room
            );

            // Add in start and end times as unix millis
            // ie: convert VeyeparEpisode to Episode
            for (const event of scheduleData) {
                event.start = new Date(event.start);
                event.startMillis = event.start.getTime();
                event.durationSeconds = parseDuration(event.duration);
                event.end = new Date(event.end);
                event.endMillis = event.startMillis + event.durationSeconds * 1000;
            }

            // Sort by start time.
            scheduleData.sort((a, b) => a.startMillis - b.startMillis);
            roomSchedule.push(...scheduleData);

            // Kick-off automatic updates of the schedule
            setInterval(updateDisplay, 1000);
            updateDisplay();
        })
        .catch((error) => {
            fatal(error);
        });
})();
