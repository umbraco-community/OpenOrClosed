# Timeline hours editor — design

Issue: [#79 Feature: New Hours selection UI](https://github.com/umbraco-community/OpenOrClosed/issues/79)
Date: 2026-08-19
Status: approved for planning

## Context

OpenOrClosed's existing editors ask an editor to fill in time fields row by row. Issue #79 asks
for something more direct: a bar per day showing 00:00–24:00, on which sets of hours are drawn,
dragged and clicked.

The mockups that prompted this show a materially simpler feature than the current Standard Hours
editor, which carries thirteen configuration options, per-day open/closed comments, a Bank
Holidays row and a `reversed` mode. Rather than bend the timeline around all of that, this work
ships **two new property editors** and leaves the existing pair untouched.

## Scope

**In scope**

- `OpenOrClosed.WeeklyHours` — a recurring Monday-to-Sunday schedule drawn on seven timelines.
- `OpenOrClosed.Holidays` — named date ranges that override the weekly schedule, with a shared
  default set of hours and per-holiday overrides.
- Value converters for both, including Delivery API support.
- Extension methods that combine the two and answer "are we open at this instant".

**Out of scope**

- Any migration from `OpenOrClosed.StandardHours` or `OpenOrClosed.SpecialHours`. The `day`
  convention is kept compatible so a migration *could* be added later, but it is not built here.
- Changes to the existing editors, their converters, or the package migration plan.
- `reversed` mode, custom open/closed labels, per-day comments, a Bank Holidays row.
- Playwright or component-level browser tests.

## Settled decisions

| Decision | Choice |
|---|---|
| Relationship to existing editors | New editors, new aliases; existing two untouched |
| Editor composition | Two separate, independently placeable property editors |
| Day order | Monday first |
| Time axis | Six-hour labelled columns; drag snaps to 15 minutes |
| Range within a day | Ranges never cross midnight; `24:00` is a valid end |
| Overlaps | Impossible — drags clamp at a neighbour's edge |
| Narrow blocks | Fall back to an indicator; full detail in a tooltip on hover/focus |
| Per-range extras | Optional text label, plus a by-appointment-only flag |
| Holiday hours | A shared default track, overridable per holiday |
| Holiday recurrence | Real dates with years; repeat adds N years to both ends |
| Holiday editing | Compact table; a dialog per holiday |

## User interface

### Weekly hours editor

Seven rows, Monday to Sunday. Each row is a track spanning 00:00 to 24:00 with labelled columns
at 12 AM, 06 AM, 12 PM, 06 PM and 12 AM, and faint dividers at each six-hour boundary. A day with
no blocks is closed; there is no separate open/closed toggle to fall out of step with the blocks.

Blocks render as filled rounded rectangles showing their time range. When a block carries a label
or the by-appointment flag, a small indicator icon appears before the text — a distinct icon for
each. When a block is too narrow for text, it shows the indicators alone.

### Interaction

- **Add** — click empty track. The new range starts at the snapped click point and runs for the
  configured default duration (`defaultClose` − `defaultOpen`, 8 hours by default), truncated to
  fit the gap it was dropped into. If the gap under the cursor is smaller than the 15-minute
  minimum, nothing happens.
- **Resize** — drag either end. The dragged edge snaps to 15 minutes and clamps at the adjacent
  block's edge, or at 00:00 / 24:00. It cannot cross its own opposite edge; minimum length is
  15 minutes.
- **Move** — drag the block body. Same snapping, clamped so the whole block stays inside the gap
  formed by its neighbours.
- **Edit** — click the block to open the range dialog.
- **Tooltip** — hover or keyboard focus shows `9:00 AM – 5:00 PM · Kitchen closes 4:30`.

Because drags clamp, an overlap cannot be produced by dragging. The dialog can, since times are
typed there, so the dialog validates on save and refuses a range that would overlap another,
showing the conflict inline.

### Range dialog

Fields: **Starts at** and **Ends at** (hour, minute, AM/PM — the meridiem control is hidden when
`time_24hr` is on), an **All day** checkbox, an optional **Label**, and a **By appointment only**
checkbox when `showAppointmentOnly` is enabled. Actions: Remove, Cancel, Save.

**All day** sets the range to 00:00–24:00. Because that necessarily conflicts with any other
range on the day, the checkbox is disabled — with an explanatory title — whenever the day holds
more than one range.

### Holidays editor

A **Default holiday hours** timeline at the top, then a table of holidays with columns Name,
Dates, Yearly and Hours. The Hours column shows a pill reading `Default`, `Closed`, or the custom
times. `+ Add holiday` appends a row.

Clicking a row opens the holiday dialog: Name, start and end date, a Repeat yearly checkbox, a
`Default / Closed / Custom` segmented control, and — when Custom is selected — a timeline for that
holiday's own hours. Actions: Remove, Cancel, Save.

Validation: name required, end date on or after start date.

### Keyboard

Every block is a focusable button labelled with its day, times and label, e.g.
`Monday, 9:00 AM to 5:00 PM, Kitchen closes 4:30`.

| Key | Action |
|---|---|
| Enter / Space | Open the range dialog |
| ← / → | Move the block by one snap step |
| Shift + ← / → | Resize the end by one snap step |
| Delete / Backspace | Remove the block |
| Enter on an empty track | Add a range in the largest free gap |

Keyboard adjustments clamp exactly as drags do. An `aria-live="polite"` region announces the
resulting range after each change, since a moving rectangle conveys nothing to a screen reader.

## Stored values

### `OpenOrClosed.WeeklyHours`

An array holding only the days that have hours. A day absent from the array is closed.

```json
[
  { "day": 1, "ranges": [
      { "start": "09:00", "end": "12:30", "label": null, "byAppointmentOnly": false },
      { "start": "13:30", "end": "17:00", "label": "Kitchen closes 4:30", "byAppointmentOnly": false }
  ]},
  { "day": 6, "ranges": [
      { "start": "18:00", "end": "24:00", "label": null, "byAppointmentOnly": true }
  ]}
]
```

`day` is `System.DayOfWeek` — 0 is Sunday — matching the existing editors. Array order is not
significant. Times are 24-hour `"HH:mm"`. `"24:00"` is valid as an `end` only; `start` is always in
`00:00`–`23:45`.

Storage is sparse, but what consumers receive is not — see *Converters* below, where the missing
days are filled in as closed.

### `OpenOrClosed.Holidays`

```json
{
  "defaultHours": [
    { "start": "10:00", "end": "14:00", "label": null, "byAppointmentOnly": false }
  ],
  "holidays": [
    { "name": "Christmas Shutdown", "start": "2026-12-27", "end": "2027-01-02",
      "repeatYearly": true, "hoursMode": "default", "hours": [] },
    { "name": "Stocktake", "start": "2027-02-03", "end": "2027-02-05",
      "repeatYearly": false, "hoursMode": "custom",
      "hours": [ { "start": "09:00", "end": "12:00", "label": null, "byAppointmentOnly": false } ] }
  ]
}
```

`hoursMode` is one of `default`, `closed`, `custom`. It is explicit rather than inferred from
whether `hours` is null or empty, because that distinction does not survive a round-trip reliably.
When `hoursMode` is not `custom`, `hours` is ignored on read and written as `[]`.

## Server contract

### Models

```csharp
public sealed class HoursRange
{
    public TimeSpan Start { get; init; }
    public TimeSpan End { get; init; }          // may equal 24:00
    public TimeSpan Duration => End - Start;
    public string? Label { get; init; }
    public bool ByAppointmentOnly { get; init; }
}

public sealed class WeeklyHoursDay
{
    public DayOfWeek Day { get; init; }
    public string DayName { get; init; }        // localised via the current culture
    public IReadOnlyList<HoursRange> Ranges { get; init; }
    public bool IsOpen => Ranges.Count > 0;
}

public enum HolidayHoursMode { Default, Closed, Custom }

public sealed class Holiday
{
    public string Name { get; init; }
    public DateOnly Start { get; init; }
    public DateOnly End { get; init; }
    public bool RepeatYearly { get; init; }
    public HolidayHoursMode HoursMode { get; init; }
    public IReadOnlyList<HoursRange> Hours { get; init; }
}

public sealed class HolidaySchedule
{
    public IReadOnlyList<HoursRange> DefaultHours { get; init; }
    public IReadOnlyList<Holiday> Holidays { get; init; }
}
```

`TimeSpan` rather than `TimeOnly`: `TimeOnly` cannot represent `24:00`, which would make "open
until midnight" — an agreed requirement — unrepresentable. A `JsonConverter` reads and writes
`TimeSpan` as `"HH:mm"` so the Delivery API emits `{"start":"09:00","end":"24:00"}` rather than
`.NET`'s default `"09:00:00"` / `"1.00:00:00"`.

### Converters

Both implement `PropertyValueConverterBase` and `IDeliveryApiPropertyValueConverter`, following
the structure established on the existing converters:

- `ConvertSourceToIntermediate` deserializes only; nothing time-dependent.
- `ConvertIntermediateToObject` and `ConvertIntermediateToDeliveryApiObject` project into fresh
  instances and never mutate the shared intermediate.
- Neither converter returns null. Weekly hours convert to an empty sequence; holidays convert to a
  `HolidaySchedule` with empty `DefaultHours` and `Holidays`.

Value types: `IEnumerable<WeeklyHoursDay>` and `HolidaySchedule` respectively, the same for the
Razor and Delivery API paths.

**The weekly converter always emits seven days**, Monday through Sunday, whether or not the stored
value holds an entry for each. A day with no stored ranges becomes a `WeeklyHoursDay` with an empty
`Ranges` and `IsOpen == false`. This makes `@foreach` over the value render a full week without the
view reconstructing missing days, and it makes `IsOpen` meaningful rather than an artifact of what
happened to be saved. Ranges within a day are sorted by `Start`.

**Expired holidays are filtered out on read.** When `removeExpiredHolidays` is on, the holidays
converter drops any holiday that has already finished, so a strongly typed model and the Delivery
API only ever see current and future holidays. A holiday is expired when
`RepeatYearly == false && End < today`; a repeating holiday never expires, because it recurs.

Cache levels differ as a result:

| Converter | Cache level | Why |
|---|---|---|
| Weekly hours | `PropertyCacheLevel.Element` | Nothing in the conversion depends on today |
| Holidays | `PropertyCacheLevel.None` | Expiry is relative to today |

The filtering happens in `ConvertIntermediateToObject` and
`ConvertIntermediateToDeliveryApiObject`, never in `ConvertSourceToIntermediate`. The intermediate
value is cached for the lifetime of the element regardless of cache level, so date-dependent work
placed there would be frozen at whenever the cache was warmed — the bug fixed in the existing
Special Hours converter. Keeping the intermediate a pure deserialize and the cache level `None` is
what makes filtering by today correct across a day boundary.

### Combining the two editors

Because the editors are independent properties, something must decide that a holiday beats the
weekly schedule. The package ships that as pure extension methods — no services, no DI:

```csharp
OpeningHoursForDate OpeningHoursOn(this IEnumerable<WeeklyHoursDay> weekly,
                                   DateOnly date,
                                   HolidaySchedule? holidays = null);

bool IsOpenAt(this IEnumerable<WeeklyHoursDay> weekly,
              DateTime instant,
              HolidaySchedule? holidays = null);

public sealed class OpeningHoursForDate
{
    public DateOnly Date { get; init; }
    public bool IsOpen { get; init; }
    public IReadOnlyList<HoursRange> Ranges { get; init; }
    public Holiday? Holiday { get; init; }      // set when a holiday applied
}
```

**Precedence** — a matching holiday replaces that day's weekly hours entirely:
`Default` uses `DefaultHours`, `Closed` yields no ranges, `Custom` uses the holiday's own. A
`Default` holiday on a schedule whose `DefaultHours` is empty is therefore closed, which is the
intended reading of an empty default track. When more than one holiday matches a date, the one
with the earliest start wins; ties break on list order.

**Yearly matching** — for date `D` and holiday `H` with `RepeatYearly`, test containment against
`H.Start.AddYears(n)`–`H.End.AddYears(n)` for `n = D.Year - H.Start.Year` and `n - 1`. Testing the
previous year's occurrence as well is what lets a range beginning in December still match in
January. `.NET` clamps 29 February to the 28th in non-leap years, which is the desired behaviour.

**Boundaries** — `IsOpenAt` treats a range as `Start <= t < End`, so a shop closing at 17:00 is
shut at exactly 17:00. A range ending at `24:00` includes every instant up to midnight.

## Data type settings

**Weekly hours** — `time_24hr` (default true), `defaultOpen` (`09:00`), `defaultClose` (`17:00`),
`showAppointmentOnly` (default false).

`time_24hr` genuinely works here: block labels are rendered by the component, unlike the existing
editor where the value was handed to a native `<input type="time">` that ignored it.

**Holidays** — `removeExpiredHolidays` (default true). It governs the read path: when on, expired
holidays are absent from the converted value and from the Delivery API.

The editor still shows them. Hiding stored entries from the person maintaining them makes a
mistyped date impossible to find and impossible to correct, so expired holidays render dimmed and
marked *Expired*, with an explicit **Remove expired** action above the table. Nothing is deleted
from the stored value without the editor asking for it.

## Client architecture

```
Client/src/
  timeline/
    time-range.ts                 pure logic — no DOM, no Lit
    time-range.test.ts
    ooc-timeline.element.ts       one track: ticks, blocks, pointer + keyboard
    ooc-range-dialog.element.ts
  weekly-hours/
    manifest.ts
    ooc-weekly-hours.element.ts
  holidays/
    manifest.ts
    ooc-holidays.element.ts
    ooc-holiday-dialog.element.ts
```

`time-range.ts` holds every non-trivial rule: parsing and formatting `"HH:mm"` including `24:00`,
snapping to the grid, clamping a resize or move against neighbours, finding the gap under a click,
finding the largest free gap, and validating a typed range. It is a pure module so it can be
tested without a browser.

`<ooc-timeline>` accepts `ranges`, `snapMinutes`, `time24hr` and `showAppointmentOnly`; it emits
`change` carrying the new range array and `edit-range` carrying an index. It knows nothing about
days, holidays or Umbraco, which is what lets the weekly editor, the holidays default track and
the holiday dialog all use it unchanged.

The property editor elements own value plumbing and Umbraco integration only. They read `value`
and `config` reactively rather than once on connect, and dispatch `UmbPropertyValueChangeEvent`
on change.

This split is a deliberate response to `business-hours-base.element.ts`, where 555 lines mix value
plumbing, config coercion, time arithmetic, validation and templates, none of it testable outside
a browser.

## Testing

**TypeScript** — vitest as a devDependency in `Client/package.json`, no DOM environment needed,
covering `time-range.ts`: snapping at boundaries, clamping against a neighbour on both sides,
overlap rejection from typed input, gap-finding on a nearly full day, `24:00` as an end, the
15-minute minimum, and format/parse round-trips.

**C#** — added to the existing `tests/OpenOrClosed.Tests` project, following the structure of the
current Delivery API tests: both converters across the Razor and Delivery API paths, empty value
handling, non-mutation of the intermediate, the `"HH:mm"` JSON converter including `24:00`, and
the precedence helper — holiday over weekly, all three `hoursMode` values, a yearly holiday
rolling from December into January, and 29 February in a non-leap year.

Expiry gets its own cases, since it is the one date-dependent path: a past one-off dropped, a
past-but-repeating holiday kept, a holiday ending today kept, and `removeExpiredHolidays` off
keeping everything. The converters take an injectable `today` for the same reason the existing
ones do, so these run against fixed dates rather than `DateTime.Now`.

**Not covered** — assembled UI behaviour in a real backoffice, which is verified by hand.

## Delivery order

The work splits cleanly in two, and the first half is independently useful:

1. `time-range.ts` and `<ooc-timeline>`, the range dialog, the `HoursRange` model and its JSON
   converter, then the weekly hours editor and its value converter, with tests.
2. The holidays editor, `HolidaySchedule`, its value converter, the combining extension methods
   and their tests.

Splitting them also keeps `IsOpenAt` honest — it cannot be written until both halves exist, so it
belongs in the second phase rather than being stubbed in the first.

## Risks

- **Two overlapping sets of editors.** The package will ship four hours-related property editors.
  The README needs to be clear about which to choose, and the existing pair should be described as
  the option for sites needing comments, `reversed` or Bank Holidays.
- **Consumers must combine two properties.** Mitigated by shipping the extension methods, but an
  implementor who ignores them will get the weekly schedule on Christmas Day. This must be
  prominent in the docs.
- **Pointer interaction across input types.** Pointer Events with capture covers mouse, touch and
  pen, but touch drag on a 24-hour track is fiddly at phone widths. The backoffice is not
  realistically used at that size, so this is accepted rather than solved.

## Reference

Mockups produced during design are in `.superpowers/brainstorm/` (git-ignored):
`weekly-grid.html`, `holidays.html`, `labels.html`.
