# Phase 2 manual checklist

Tasks 6 and 7 of `2026-08-20-timeline-hours-editor-phase-2.md` have no automated coverage by
design, so this pass is their only verification. Re-run it after any change to
`ooc-holidays.element.ts`, `ooc-holiday-modal.element.ts` or `holiday-modal.token.ts`.

Automated state at the time of writing: 147 C# tests, 105 TypeScript tests, `tsc --strict` clean.

## Data type

- [ ] A new data type using **Holidays** appears in the picker under `richContent`.
- [ ] Its four settings save and reopen intact: Remove Expired Holidays, Time Format,
      Enable Appointment Only.
- [ ] Defaults on a fresh data type are: Remove Expired **on**, Time Format **on** (24 hour),
      Appointment Only **off**.

## Default hours track

- [ ] Clicking empty track creates a range.
- [ ] Dragging a block's edge resizes it; dragging its middle moves it.
- [ ] Handles appear on hover and on keyboard focus.
- [ ] Clicking a block opens the range sidebar; Save applies, Remove deletes, Cancel leaves it be.

## Holiday table

- [ ] `+ Add holiday` opens the sidebar with today's date in both fields and an empty name.
- [ ] Saving with a blank name shows "A name is required" and does **not** close the sidebar.
- [ ] An end date before the start date is rejected with the end-date message.
- [ ] Custom mode with no hours is rejected with the custom-hours message.
- [ ] A single-day holiday (start == end) saves.
- [ ] Saving adds a row; rows are ordered by start date, then name.
- [ ] The Hours pill reads `Default`, `Closed`, or the first range's times with a `+N` suffix when
      there is more than one.
- [ ] Clicking a row reopens it with every field populated, custom hours included.
- [ ] Remove deletes that row and no other — check with three rows, removing the middle one.
- [ ] With Time Format off, the pill and the custom timeline read in 12-hour form.

## Modes

- [ ] `Default` shows a hint naming the default hours, or says the holiday is closed when the
      default track is empty.
- [ ] `Closed` shows no timeline.
- [ ] `Custom` shows a timeline that behaves like the default track, including its own range sidebar.

## Expiry

- [ ] A holiday whose end date has passed renders dimmed and marked *(Expired)*.
- [ ] A past holiday with Repeat yearly **on** is **not** marked expired.
- [ ] A holiday ending **today** is not marked expired.
- [ ] **Remove expired** appears only when something is expired, and removes exactly those rows.

## Round trip

- [ ] Save the document, reload the page: every holiday, its mode, its dates, its repeat flag and
      its custom hours survive.
- [ ] Navigating away immediately after a save does **not** prompt "discard unsaved changes".
      A dirty prompt here means the shape the editor writes does not match what the server reads.
- [ ] The browser console is clean throughout — in particular no *"Property Editor received a Change
      Event who's target is not the Property Editor Element"* during any drag.

## Server

- [ ] A Razor template following the README sample compiles and renders.
- [ ] `OpeningHoursOn` returns the holiday's hours on a holiday date and the weekly hours otherwise,
      and `Holiday` is populated only on the former.
- [ ] `IsOpenAt(DateTime.Now, holidays)` agrees with what the editor shows.
- [ ] With **Remove Expired Holidays** on, the Delivery API response omits expired one-off holidays
      but still lists repeating ones.
- [ ] With it off, the Delivery API lists everything.
- [ ] The Delivery API emits times as `"09:00"` / `"24:00"` and `hoursMode` as `"default"` /
      `"closed"` / `"custom"` — not `.NET`'s `"09:00:00"` or `"Default"`.
- [ ] The weekly property's Delivery API output still emits `"day": 2`, not `"day": "Tuesday"`.
