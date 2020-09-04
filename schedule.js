"use strict";

// Shown when there are no more events today in a room.
const FINISHED_FOR_DAY_TITLE = 'Finished for the day!';
const FINISHED_FOR_DAY_MESSAGE = 'Proceedings in {room} have finished.';

// Shown when there are no days of the conference that are today.
// Query parameter ?lt=(ISO8601 DateTime) can activate a time-warp for testing...
const NO_EVENTS_TODAY = 'No events scheduled today!';

// Shown when there's an event in a room right now.
const CURRENT_EVENT_TITLE = 'Starting soon';

// pretalx schedule JSON URL
// https://pretalx.com/.../schedule/export/schedule.json
// Cache bust every 5 minutes (but we don't actually reload this).
const SCHEDULE_URL = 'https://pretalx.com/pycon-au-2020/schedule/export/schedule.json?_=' + Math.floor((new Date()).getTime() / 300000);

// First line of error text
const ERROR_MESSAGE = 'Well, this is embarrassing. :(';

const FORMATTER = new Intl.DateTimeFormat('en-AU', {hour: 'numeric', minute: 'numeric'});
const PRETALX_VERSIONS = ['v1.1', 'v1.2', 'v1.3'];
const startingAtElem = document.getElementById('starting-at');
const titleElem = document.getElementById('title');
const presenterElem = document.getElementById('presenter');
const nowElem = document.getElementById('now');
const options = getOptions();
const roomSchedule = [];

/**
 * Formats a relative time in milliseconds.
 *
 * The time value passed is always positive (in the future).
 */
function formatRelativeTime(time) {
	var mins = Math.ceil(time / 60_000);
	return `In ${mins} minute${mins == 1 ? '' : 's'}`;
}

/**
 * Displays an error message on fatal errors.
 */
function fatal(message) {
	titleElem.innerText = ERROR_MESSAGE;
	startingAtElem.innerText = '';
	presenterElem.innerText = message;
}

/**
 * Get all passed query parameters to the page.
 */
function getQueryParams() {
	const ret = {};
	const qs = document.location.search.slice(1);
	if (qs.length == 0) {
		// no params available.
		console.log('No query parameters specified')
		return ret;
	}

	for (const param of qs.split('&')) {
		if (param.length == 0) {
			// Empty token, skip
			continue;
		}

		const kv = param.split('=', 2);
		const key = unescape(kv[0]);
		const val = unescape(kv[1]);

		if (key in ret) {
			console.log('Ignoring redefined parameter: ' + key);
			continue;
		}

		if (val === undefined) {
			console.log('Ignoring undefined parameter: ' + key);
			continue;
		}

		ret[key] = val;
	}

	return ret;
}

/**
 * Parse all options passed to the page.
 */
function getOptions() {
	const params = getQueryParams();

	// For testing: set `lt` to a time to treat as the "load time" of this page.
	var timeWarp = 0;
	if (params['lt']) {
		timeWarp = ((new Date(params['lt'])).getTime() - (new Date()).getTime());
	}
	if (Number.isNaN(timeWarp)) {
		timeWarp = 0;
	}

	return {
		// Select the room that we're in
		room: params['r'],
		timeWarp: timeWarp,
		clockOnly: params['c'] == '1',
		message: params['m'],
	};
}

/**
 * Loads the schedule JSON.
 *
 * Returns a Promise, resolved with the parsed schedule JSON.
 */
function getSchedule() {
	return new Promise((resolve, reject) => {
		const req = new XMLHttpRequest();
		req.addEventListener('load', () => {
			if (req.status == 200) {
				var schedule;
				try {
					schedule = JSON.parse(req.response)['schedule'];
				} catch (e) {
					reject('Error parsing schedule: ' + e);
					return;
				}

				if (!schedule || PRETALX_VERSIONS.includes(schedule['version'])) {
					reject('Unsupported schedule schema: ' + schedule['version']);
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
 * Parses a pretalx duration string into a number of minutes.
 */
function parseDuration(duration) {
	// https://github.com/pretalx/pretalx/blob/10993118f711e395995a59cf150e18cca9f69451/src/pretalx/common/serialize.py#L4
	// Format is:
	// - days:hours:minutes
	// - hours:minutes
	duration = duration.split(':', 3);

	// Minutes
	var ret = parseInt(duration.pop());

	const hours = parseInt(duration.pop());
	if (hours) {
		ret += hours * 60;
	}

	const days = parseInt(duration.pop());
	if (days) {
		ret += days * 1440;
	}

	return ret;
}

function getCurrentOrNextEvent(nowMillis) {
	var nextEvent = null;

	for (const event of roomSchedule) {
		// 15 minutes before the end of the event
		const end15 = event.endMillis - 900_000;
		// If the end-15m is before 10min after the start time, use original end time.
		const end = (end15 < (event.startMillis + 600_000)) ? event.endMillis : end15;
		if (event.startMillis <= nowMillis && end > nowMillis) {
			// Current event!
			return event;
		}

		if (event.startMillis > nowMillis) {
			// Upcoming event, is it the latest?
			if (!nextEvent || nextEvent.startMillis > event.startMillis) {
				nextEvent = event;
			}
		}
	}

	// May also return null, if all events are done for the day.
	return nextEvent;
}

function updateClock() {
	var time = new Date((new Date()).getTime() + options.timeWarp);
	nowElem.innerText = FORMATTER.format(time);
}

function updateDisplay() {
	const nowMillis = (new Date()).getTime() + options.timeWarp;
	var event = getCurrentOrNextEvent(nowMillis);

	if (event == null) {
		startingAtElem.innerText = '';
		titleElem.innerText = FINISHED_FOR_DAY_TITLE;
		presenterElem.innerText = FINISHED_FOR_DAY_MESSAGE.replace('{room}', options.room);
		return;
	} else if (event.startMillis > nowMillis + 60_000) {
		// Upcoming event
		startingAtElem.innerText = formatRelativeTime(event.startMillis - nowMillis);
	} else {
		// Current event
		startingAtElem.innerText = CURRENT_EVENT_TITLE;
	}
	titleElem.innerText = event.title;
	presenterElem.innerText = event.persons.map((p) => p.public_name).join(', ');

}

(() => {
	updateClock();
	setInterval(updateClock, 1000);
	if (options.clockOnly) {
		titleElem.innerText = (options.message || '');
		return;
	}

	getSchedule().then((scheduleData) => {
		// Find the day to work with for this conference
		var today = null;
		const loadTime = new Date((new Date()).getTime() + options.timeWarp);
		if (options.timeWarp != 0) {
			console.log('Timewarp engaged: ' + (options.timeWarp > 0 ? '+' : '') + options.timeWarp + ' ms. Current time: ' + loadTime);
		}

		for (const day of scheduleData.conference.days) {
			const dayStart = new Date(day.day_start);
			const dayEnd = new Date(day.day_end);

			if (dayStart <= loadTime && dayEnd > loadTime) {
				// We found today!
				today = day;
				break;
			}
		}

		if (today == null) {
			console.log('Could not find conference day for ' + loadTime);
			console.log('Try overriding the load time with the `lt` query parameter`');
			startingAtElem.innerText = '';
			titleElem.innerText = NO_EVENTS_TODAY;
			presenterElem.innerText = '';
			return;
		}

		// Find which room should apply
		const roomList = Object.getOwnPropertyNames(today.rooms);
		const room = options.room ? today.rooms[options.room] : null;
		if (!room) {
			fatal('Unknown room (?r=' + (options.room || '') + '), options: ' + JSON.stringify(roomList));
			return;
		}

		// Add in start and end times as unix millis
		for (const event of room) {
			event.startMillis = (new Date(event.date)).getTime();
			event.durationMinutes = parseDuration(event.duration);
			event.endMillis = event.startMillis + (event.durationMinutes * 60000);
		}

		// Sort by start time.
		room.sort((a, b) => a.startMillis - b.startMillis);
		roomSchedule.push(...room);

		// Kick-off automatic updates of the schedule
		setInterval(updateDisplay, 1000);
		updateDisplay();
	}).catch((error) => {
		fatal(error);
	});
})();
