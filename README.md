# pyconline-schedule-slide

Tool to display information about the next speaker for PyconAU / pyconline.

This is hooked up to `democon-schedule.json`, which [comes from pretalx][pretalx-schedule].  This needs to be replaced with the actual schedule.

This needs to be run on a local web server, because this uses `XmlHttpRequest`. (eg: `python3 -m http.server -b 127.0.0.1`)

![screenshot - schedule in OBS](./screenshots/obs.png)

**See also:** [description of slides, with more screenshots](./slides.md).

## Options

Options are set via query parameters:

* `r` **(required, string)**: Room name to display events for.

  This needs to match one of the keys of `schedule.conference.days[].rooms`, and is _case sensitive_.

  If no room is specified, an error and a list of valid rooms for the day will be shown.

  **Example:** `?r=Magenta Room` displays events from `Magenta Room`.

* `c` **(optional, boolean)**: Only display the clock, and don't load the schedule.

  Example: `?c=1`

* `lt` **(optional, datetime)**: Time to treat as the "load time" of this page, which becomes a persistent offset when handling the schedule and displaying conference time.

  This is useful for testing, when the test data is in the past or future.

  This is passed verbatim to [JavaScript's `Date` constructor][date].

  Example: `?lt=2020-04-17T12:30:00+02:00` treats the load time as 2020-04-17 at 12:30 UTC+2.

[date]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/Date
[pretalx-schedule]: https://pretalx.com/democon/schedule/export/schedule.json