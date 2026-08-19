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

## Date and time constraints

Added after the phase 2 build. `uui-input` forwards `min`/`max` to the native input but registers
no `rangeUnderflow` validator, so these constrain the *picker* while `validateHoliday` /
`validateRange` remain the backstop for typed values.

- [ ] In the holiday sidebar, opening the **Ends on** picker offers no date before the start —
      the reported case was Starts on 25/12/2026 with Ends on freely settable to 19/09/2026.
- [ ] **Starts on** is *not* constrained by the end. Moving the start past the end is allowed and
      the end follows it. Set 25/12, then 20/12 → end stays; then set start to 27/12 → end becomes
      27/12.
- [ ] A start of 27/12 with a repeating holiday ending 02/01 the following year still saves — the
      year, not just the day, is compared.
- [ ] Typing an out-of-range end by hand still shows the end-date message on Save rather than
      silently saving.
- [ ] In the range sidebar, **Ends at** offers no time before **Starts at**.
- [ ] With three ranges on a day, opening the middle one: **Starts at** offers nothing before the
      previous range's end, and **Ends at** nothing after the next range's start — so the
      "overlaps another range" error is unreachable from the pickers.
- [ ] On the last range of the day, **Ends at** caps at 23:59, and **All day** still produces a
      true 24:00 end.

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
