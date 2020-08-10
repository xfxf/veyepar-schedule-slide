# pyconline-schedule-slide

Tool to display information about the next speaker for PyconAU / pyconline.

This is hooked up to `democon-schedule.json`, which [comes from PretalX](https://pretalx.com/democon/schedule/export/schedule.json).  This needs to be replaced with the actual schedule.

Because this uses `XmlHttpRequest`, this needs to be run on a local web server, eg: `python3 -m http.server -b 127.0.0.1`

## Options

Options are set via query parameters:

* `r` **(required, string)**: Room name to display events for.

  This needs to match one of the keys of `schedule.conference.days[].rooms`, and is _case sensitive_.

  **Example:** `?r=Magenta Room` displays events from `Magenta Room`.

* `lt` **(optional, datetime)**: Time to treat as the "load time" of this page, which becomes a persistent offset when handling the schedule.

  This is useful for testing, when the test data is in the past or future.

  If no timezone offset is specified, assumes local time.  This is passed verbatim to JavaScript's `Date` constructor.

  Example: `?lt=2020-04-17T12:30:00+02:00` treats the load time as 2020-04-07 at 12:30 UTC+2.
