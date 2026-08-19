# Open or Closed for Umbraco

![Open or Closed Logo](https://raw.githubusercontent.com/umbraco-community/OpenOrClosed/master/GithubFiles/Logo/OpenOrClosed_logo.png)

Yet another Business Hours package for Umbraco

[![OpenOrClosed - CI](https://github.com/umbraco-community/OpenOrClosed/actions/workflows/build.yml/badge.svg)](https://github.com/umbraco-community/OpenOrClosed/actions/workflows/build.yml)
[![OpenOrClosed - Release](https://github.com/umbraco-community/OpenOrClosed/actions/workflows/release.yml/badge.svg)](https://github.com/umbraco-community/OpenOrClosed/actions/workflows/release.yml)

Nuget Packages:

| Package | Version | Downloads |
| -- | -- | -- |
| OpenOrClosed | [![NuGet release](https://img.shields.io/nuget/v/OpenOrClosed.svg)](https://www.nuget.org/packages/OpenOrClosed/) | [![NuGet release](https://img.shields.io/nuget/dt/OpenOrClosed.svg)](https://www.nuget.org/packages/OpenOrClosed/) |

Umbraco Package: [![Our Umbraco project page](https://img.shields.io/badge/umbraco-marketplace-green.svg)](https://marketplace.umbraco.com/package/openorclosed)

Adds Property Editors to manage standard and special (read holiday) opening/closing times

The OpenOrClosed nuget package can be used in Core projects to add support for ModelsBuilder generated Content Models.

## Property Editors

### Standard Business Hours

Monday through to Sunday and optionally Bank Holidays, set each day Open or Closed with multiple ranges of times.  Each time range can be flagged with "By Appointment".

### Special Business Hours

Adds the ability to specify specific dates, with the same set of features for Standard Business Hours.

### Weekly Hours

A recurring Monday-to-Sunday schedule drawn on seven timelines. Drag a block's edges to resize it or
its middle to move it; click one to set exact times, add an optional label, or mark it by
appointment only. Ranges snap to 15 minutes, never cross midnight, and cannot be dragged into
overlapping. `24:00` is a valid end, meaning open until midnight.

### Holidays

Named date ranges that override the weekly schedule, with a shared **Default holiday hours**
timeline at the top and a per-holiday override of `Default`, `Closed` or `Custom`. A holiday can
repeat yearly, in which case it never expires.

## Choosing between them

The package ships two pairs of hours editors. They do not interact, so pick one pair per site:

| Use | When |
| -- | -- |
| **Weekly Hours** + **Holidays** | New sites. Direct manipulation, no overlaps possible, Delivery API support, and helpers that combine the two. |
| **Standard Business Hours** + **Special Business Hours** | You need per-day comments, `reversed` mode, or a Bank Holidays row - none of which the timeline editors support. |

There is no migration between the pairs. The stored `day` convention is kept compatible so one
could be added later.

## Combining Weekly Hours and Holidays

**Weekly Hours and Holidays are two separate properties, and reading the weekly one alone means
your site says it is open on Christmas Day.** The package ships extension methods that apply the
correct precedence - a matching holiday replaces that day's weekly hours entirely:

```csharp
@using OpenOrClosed.Core.Extensions
@using OpenOrClosed.Core.Models

@{
    var weekly = Model.Value<IEnumerable<WeeklyHoursDay>>("weeklyHours") ?? [];
    var holidays = Model.Value<HolidaySchedule>("holidays");

    var today = weekly.OpeningHoursOn(DateOnly.FromDateTime(DateTime.Now), holidays);
    var openNow = weekly.IsOpenAt(DateTime.Now, holidays);
}

<p>We are @(openNow ? "open" : "closed") right now.</p>

@if (today.Holiday is not null)
{
    <p>@today.Holiday.Name</p>
}

@if (today.IsOpen)
{
    <ul>
        @foreach (var range in today.Ranges)
        {
            <li>@range.Start.ToString(@"hh\:mm") - @range.End.ToString(@"hh\:mm")</li>
        }
    </ul>
}
else
{
    <p>Closed today.</p>
}
```

`OpeningHoursOn` returns the resolved `Ranges` for a date plus the `Holiday` that applied, if any.
`IsOpenAt` treats a range as start-inclusive and end-exclusive, so a shop closing at 17:00 is shut
at exactly 17:00.

A few behaviours worth knowing:

* **The weekly converter always returns seven days**, Monday first, whether or not the stored value
  holds an entry for each. A day with no hours has an empty `Ranges` and `IsOpen == false`, so
  `@foreach` renders a full week without the view reconstructing missing days.
* **A `Default` holiday with no default hours set is closed.** That is the intended reading of an
  empty default track.
* **A yearly holiday spanning New Year still matches in January** - a 27 December to 2 January range
  applies on 1 January of the following year.
* **`Remove Expired Holidays` affects the read path only.** With it on, finished holidays are absent
  from the converted value and the Delivery API, but the editor still shows them dimmed and marked
  *Expired*, so a mistyped date can be found and corrected. Use the **Remove expired** button to
  delete them for real.

## Change Log

### Version 17.2.0

* Added **Weekly Hours** — a recurring Monday-to-Sunday schedule drawn on seven timelines, with
  drag to move and resize, 15-minute snapping, per-range labels and by-appointment-only flags.
  Overlaps are impossible: drags clamp at a neighbour's edge, and the pickers in the range sidebar
  will not offer a time that would collide.
* Added **Holidays** — named date ranges that override the weekly schedule, with a shared default
  hours timeline and a per-holiday `Default` / `Closed` / `Custom` override. Holidays can repeat
  yearly, in which case they never expire.
* Both editors have value converters with Delivery API support. The weekly converter always
  returns seven days so a view can loop over a full week; the holidays converter drops finished
  holidays when **Remove Expired Holidays** is on, while the editor still shows them dimmed and
  marked *Expired* so a mistyped date can be corrected.
* Added `OpeningHoursOn` and `IsOpenAt` extension methods in `OpenOrClosed.Core.Extensions`, which
  apply the correct precedence across the two properties. **Reading the weekly property on its own
  means your site says it is open on Christmas Day** — see
  [Combining Weekly Hours and Holidays](#combining-weekly-hours-and-holidays).
* The existing Standard and Special Business Hours editors are untouched. See
  [Choosing between them](#choosing-between-them) for which pair to use; there is no migration
  between the pairs.

### Version 17.1.3

* Added Delivery API support to the Standard and Special Business Hours value converters.
* Fixed stale date conversion. Date-relative logic ran in `ConvertSourceToIntermediate`, whose
  result is cached for the lifetime of the element, so times were frozen at whenever the cache was
  warmed. It now runs in `ConvertIntermediateToObject` with a cache level of `None`.
* Fixed standard hours anchoring to the wrong week when today is a Sunday.
* Fixed `HasHours`, which was never set and so was always `false`.
* Converters return an empty enumerable rather than `null` for an empty value.
* Fixed `removeOldDates` throwing for any stored form other than a boxed `bool`.
* Fixed `reversed` mode toggling hours against the raw flag rather than the displayed state.
* Fixed every time field blanking when **Time Format** was off — a 12-hour `"9:00 AM"` string was
  being discarded by `<input type="time">`.
* Editors now re-read `value` and `config` when they change, not only on connect.
* Fixed special dates being compared as UTC, which dropped today's entry in negative UTC offsets.
* Per-day validation messages are now rendered rather than computed and thrown away.
* Fixed the upgrade migration matching only `EditorAlias`, and issuing a query with an empty
  `IN ()` clause when nothing matched.
* Fixed the test site's project reference, which contained a space in `"../"` and so never
  referenced the package at all.

### Version 17.1.2

* **Breaking Change:** Moved business logic back into main OpenOrClosed website - remove references to `OpenOrClosed.Core` and replace with `OpenOrClosed` nuget package where necessary.  Make sure you clean out obj/bin directories and rebuild.
* Fixed issues with static assets not available on Windows dev environments

### Version 17.1.0

**Breaking Change:** Models are now back in the `OpenOrClosed.Core` namespace (and nuget package), leaving the OpenOrClosed nuget package to mainly deliver the UI.

### Version 17

Updated for Umbraco 17

### Version 16

Completely re-built for Umbraco 16

* Improved validation
* Improved layout, including native time and date controls

### Version 2.0.6

UI Improvements and the ability to reverse open/closed status.

### Version 2.0.5

Special thanks to [Lasse Dollis Spilling](https://github.com/lassespilling) for his Comments contribution and cleanup

* Adds comments for each entry in Standard and Special Hours
* Added option to have all hours optional optional, not just closing hours.
* Fixed bug on updating Time pickers
* Cleaned up layout

### Version 2.0.1

* Standard Hours now reflect the current week for the OpensAt and ClosesAt lists

### Version 2.0.0

* Supports Umbraco 10+ only - for Umbraco 8 or 9 install version 1.1.0
* Hours are now optional, allowing for a Days Open/Closed facility without the need to specify times.
* Special Days can now be default to closed when added.
* System.DayOfWeek is now included in the StandardHours View Model, assisting with the ability to render a localised Day.

### Version 1.1.0

* Closed Times can now be made optional by configuration (breaking change)

### Version 1.0.0

* Supports Umbraco 8+

### Version 0.2.2 ***Potential BREAKING Change***

* Changes the Hours from string to DateTime in the View Model to enable better localisation support.

### Version 0.2.1

* Removes the Id property from the View Models since it's no longer populated anyway.

### Version 0.2.0

* Removes the Id property from the editor as it's redundant

## Logo

The package logo uses the "open hours" (by Gregor Cesnar) icon from the Noun Project, licensed under CC BY 3.0 US.
