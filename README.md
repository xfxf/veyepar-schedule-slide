# pyconline-schedule-slide (pretalx version)

Tool to display information about the next speaker for [PyconlineAU 2020][pyconau2020].

This should also work with other conferences using [pretalx schedule JSON files][pretalx-schedule].

![screenshot - schedule in OBS](./screenshots/obs.jpg)

**Note:** This is the `pretalx` branch of the code, as used at PyconlineAU 2020, and is no longer maintained.

**See also:** [description of slides, with more screenshots](./slides.md).

## Setting up

1. Provide a `schedule.json` from pretalx:

   * use [test data][pretalx-schedule]: copy `democon-schedule.json` to `schedule.json`.

   * live data: `./update_schedule.sh` (shell script, requires cURL)

   * live data: `update_schedule.ps1` (PowerShell script)

     [Requires signing][ps-sign], [an Unrestricted execution policy][ps-unrestricted], or running with `type | powershell`:

     ```powershell
     PS C:\...\pyconline-schedule-slide> type update_schedule.ps1 | powershell
     ```

2. Serve the checked-out `pyconline-schedule-slide` repository with a web server of your choice.

   For local development, you could use Python for this:

   ```shell
   $ python3 -m http.server -b 127.0.0.1
   ```

   **Warning:** Python's built-in web server is single threaded, and browsers will hold the TCP connection open after loading. This will prevent the page from being loaded in multiple browser windows (or OBS instances).

3. In OBS, create a `Browser` source:

   * URL: (replace with where you're hosting this, see [options](#options) below)
   * Dimensions: 1920x1080 (or 1280x720), must be 16:9 aspect ratio.
   * Shutdown source when not visible: enable
   * Refresh browser when scene becomes active: enable

## Options

Options are set via query parameters:

* `r` **(required, string)**: Room name to display events for.

  This needs to match one of the keys of `schedule.conference.days[].rooms`, and is _case sensitive_.

  If no room is specified, an error and a list of valid rooms for the day will be shown.

  **Example:** `?r=Magenta Room` displays events from `Magenta Room`.

* `c` **(optional, boolean)**: Only display the clock, and don't load the schedule.

  **Example:** `?c=1`

* `m` **(optional, string)**: Message to display when only showing the clock.

  **Example:** `?c=1&m=Hello%20world!`

* `lt` **(optional, datetime)**: Time to treat as the "load time" of this page, which becomes a persistent offset when handling the schedule and displaying conference time.

  This is useful for testing, when the test data is in the past or future.

  This is passed verbatim to [JavaScript's `Date` constructor][date].

  **Example:** `?lt=2020-04-17T12:30:00+02:00` treats the load time as 2020-04-17 at 12:30 UTC+2.

[date]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/Date
[pyconau2020]: https://2020.pycon.org.au/
[pretalx-schedule]: https://pretalx.com/democon/schedule/export/schedule.json
[ps-sign]: https://docs.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_signing?view=powershell-7
[ps-unrestricted]: https://docs.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies?view=powershell-7#unrestricted