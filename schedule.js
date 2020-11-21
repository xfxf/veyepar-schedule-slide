"use strict";

// Shown when there are no more events today in a room.
const FINISHED_FOR_DAY_TITLE = 'Finished for the day!';
const FINISHED_FOR_DAY_MESSAGE = 'Proceedings in {room} have finished.';

// Shown when there are no days of the conference that are today.
// Query parameter ?lt=(ISO8601 DateTime) can activate a time-warp for testing...
const NO_EVENTS_TODAY = 'No events scheduled today!';

// Shown when there's an event in a room right now.
const CURRENT_EVENT_TITLE = 'Starting soon';

// Veyepar schedule JSON URL
// https://veyepar.nextdayvideo.com/main/C/{...}/S/{...}.json
// Cache bust every 5 minutes (but we don't actually reload this).
// const SCHEDULE_URL = 'https://veyepar.nextdayvideo.com/main/C/pyconau/S/pyconau_2020.json?_=' + Math.floor((new Date()).getTime() / 300000);
const SCHEDULE_URL = './schedule.json?_=' + Math.floor((new Date()).getTime() / 300000);

// First line of error text
const ERROR_MESSAGE = 'Well, this is embarrassing. :(';

const FORMATTER = new Intl.DateTimeFormat('en-AU', {hour: 'numeric', minute: 'numeric'});
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
	const mins = Math.ceil(time / 60_000);
	const hours = Math.floor(time / 3600_000);

	if (mins <= 60) {
		return `In ${mins} minute${mins == 1 ? '' : 's'}`;
	} else {
		return `In ${hours} hour${hours == 1 ? '' : 's'}`;
	}
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
 * Parses a pretalx duration string into a number of seconds.
 */
function parseDuration(duration) {
	// Serialisation: https://github.com/CarlFK/veyepar/blob/d2e168161748f5076b24240844b9f4bff8695e79/dj/main/views.py#L367
	// This dumps out the underlying Episode objects as JSON. duration defined here:
	// https://github.com/CarlFK/veyepar/blob/4337edf3a917cc4e8371f469d32669dd8c4d538b/dj/main/models.py#L284-L285
	// This is declared as "HH:MM:SS", but is stored in a CharField.
	//  (ノಠ益ಠ)ノ
	duration = duration.split(':', 3);
	return (parseInt(duration[0]) * 3600) + (parseInt(duration[1]) * 60) + parseInt(duration[2]);
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
	titleElem.innerText = event.name;
	presenterElem.innerText = event.authors;

}

(() => {
	updateClock();
	setInterval(updateClock, 1000);
	if (options.clockOnly) {
		titleElem.innerText = (options.message || '');
		return;
	}

	getSchedule().then((scheduleData) => {
		const loadTime = new Date((new Date()).getTime() + options.timeWarp);
		if (options.timeWarp != 0) {
			console.log('Timewarp engaged: ' + (options.timeWarp > 0 ? '+' : '') + options.timeWarp + ' ms. Current time: ' + loadTime);
		}

		// Find which room should apply
		const roomList = new Set(scheduleData.map(e => e.location));
		if (!roomList.has(options.room)) {
			fatal('Unknown room (?r=' + (options.room || '') + '), options: ' + JSON.stringify(Array.from(roomList)));
			return;
		}

		scheduleData = scheduleData.filter(e => e.location == options.room);

		// Add in start and end times as unix millis
		for (const event of scheduleData) {
			event.startMillis = (new Date(event.start)).getTime();
			event.durationSeconds = parseDuration(event.duration);
			event.endMillis = event.startMillis + (event.durationSeconds * 1000);
		}

		// Sort by start time.
		scheduleData.sort((a, b) => a.startMillis - b.startMillis);
		roomSchedule.push(...scheduleData);

		// Kick-off automatic updates of the schedule
		setInterval(updateDisplay, 1000);
		updateDisplay();
	}).catch((error) => {
		fatal(error);
	});
})();
