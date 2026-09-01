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

Set **Preset Hours** on the data type and hovering a day — or tabbing into it — offers those blocks
as faint outlines. Click one and that set alone lands; the others stay on offer, so you can take
one, two or all of them, in any order. Blocks that would clash with hours already on the day are
never offered, and clicking anywhere the preset is not offering something adds an ad-hoc set exactly
as it always has. Labels and the by-appointment flag travel with a preset block, so "Lunch" only has
to be typed once.

### Holidays

Named date ranges that override the weekly schedule, with a shared **Default holiday hours**
timeline at the top and a per-holiday override of `Default`, `Closed` or `Custom`. A holiday can
repeat yearly, in which case it never expires.

**Preset Hours** works here too, on the **Default holiday hours** track and on a holiday's
**Custom** track. Mind the difference between the two names: *Preset Hours* is configuration, a
pattern held on the data type, while *Default holiday hours* is content — the hours this node's
holidays fall back to.

## Copying hours within a property

Every day on **Weekly Hours**, and every row on **Holidays**, has a `…` action menu.

* **Copy hours to…** opens a list of the other days (or holidays) with **Weekdays**, **Weekend** and
  **All** shortcuts. Tick the targets and the source's hours replace theirs — targets that already
  have hours are marked as such before you commit.
* **Clear hours** empties the day, or returns a holiday to `Default`.
* **Duplicate**, on Holidays only, copies a whole holiday under a new name and opens it ready for its
  dates to be changed.

This is not the same thing as the property clipboard below. This copies **within one property on one
node**; the clipboard copies **a whole property value between nodes**.

## Copying hours between nodes

All four editors support Umbraco's property clipboard. Use the property's action menu to **Copy**
its value, then **Replace** on the same property on another node — useful for rolling a set of bank
holiday closures out across branch locations.

Two things worth knowing before you rely on it:

* **The clipboard is per browser.** Umbraco stores entries in the browser's local storage, so what
  you copy is not visible to your colleagues or on your other devices.
* **Pasting is one node at a time.** Umbraco has no bulk "apply this property to the nodes I have
  selected" action, so a hundred branches means a hundred pastes. Copied entries are named
  `<Node name> - <Property label>`, so the one you want stays easy to find in the picker.

Copying between *different* editors is deliberately not possible — a Weekly Hours value cannot be
pasted into Special Business Hours, even though both describe opening times.

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

@functions {
    // A TimeSpan of exactly 24:00 carries Days == 1 and Hours == 0, so "hh\:mm" renders it as
    // "00:00" - open until midnight would read as closing at the start of the day.
    static string Clock(TimeSpan time) => $"{(int)time.TotalHours:00}:{time.Minutes:00}";
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
            <li>
                @Clock(range.Start) - @Clock(range.End)
                @if (range.Label is not null)
                {
                    <text>(@range.Label)</text>
                }
                @if (range.ByAppointmentOnly)
                {
                    <text>- by appointment only</text>
                }
            </li>
        }
    </ul>
}
else
{
    <p>Closed today.</p>
}
```

To answer "when are you open" for more than one date, call `OpeningHoursOn` per date rather than
reading the weekly property directly — a holiday only applies to the dates it covers:

```csharp
@foreach (var offset in Enumerable.Range(0, 7))
{
    var date = DateOnly.FromDateTime(DateTime.Now).AddDays(offset);
    var day = weekly.OpeningHoursOn(date, holidays);

    <tr>
        <td>@date.ToString("ddd d MMM")</td>
        <td>@(day.Holiday?.Name ?? "-")</td>
        <td>@(day.IsOpen ? string.Join(", ", day.Ranges.Select(r => $"{Clock(r.Start)} - {Clock(r.End)}")) : "Closed")</td>
    </tr>
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
* **A range ending at midnight is stored as `24:00`, which is a `TimeSpan` of 24 hours.** Its
  `Hours` component is 0 and its `Days` component is 1, so `ToString(@"hh\:mm")` renders it as
  `00:00`. Format from `TotalHours`, as the sample above does.
* **`Remove Expired Holidays` affects the read path only.** With it on, finished holidays are absent
  from the converted value and the Delivery API, but the editor still shows them dimmed and marked
  *Expired*, so a mistyped date can be found and corrected. Use the **Remove expired** button to
  delete them for real.

## Change Log

### Version 17.4.0

* Added **Preset Hours** to the Weekly Hours and Holidays data types: configure blocks of hours
  once, then hover a day — or tab into it — to be offered them as faint outlines, and click the ones
  you want. Blocks that clash with hours already on the day are not offered. Clicking bare timeline
  still adds a single ad-hoc set, and leaving the setting empty changes nothing.
* Every weekday row and holiday row now has an action menu: **Copy hours to…** replicates a row's
  hours onto any number of others, **Clear hours** empties it, and **Duplicate** copies a whole
  holiday. See [Copying hours within a property](#copying-hours-within-a-property).

### Version 17.3.1

* **Fixed: a Weekly Hours value upgraded from the Standard Business Hours editor read as closed all
  week.** That editor writes a *Holidays* row carrying no day at all (`"day": null`), and the stored
  shape declared `day` as a non-nullable `int` - so the row failed to deserialize, and because a
  stored value is read leniently (null rather than an exception), the whole week went with it. Rows
  without a usable day are now skipped, leaving the real days intact. Rows from the older editor
  carry `hoursOfBusiness` rather than `ranges` and continue to be ignored, as before.

### Version 17.3.0

* All four property editors now support Umbraco's property clipboard: **Copy** an editor's value
  from one node and **Replace** it on another. Note that the clipboard is per browser, and that
  pasting is one node at a time — Umbraco has no bulk apply. See
  [Copying hours between nodes](#copying-hours-between-nodes).

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
* Added Delivery API support to the Standard and Special Business Hours value converters.
* The backoffice UI is now localisable. The package ships an `en` dictionary under the
  `openOrClosed` area; a translation is a single file plus a `localization` manifest entry.
* Backoffice day names and the timeline axis now follow the current culture and the
  **Time Format** setting rather than being hardcoded English.
* Accessibility: holiday rows are reachable and operable by keyboard, focus is kept when a
  range is added or deleted, and block tooltips appear on keyboard focus as well as hover.
* All four property editors now dispatch `UmbChangeEvent` rather than the deprecated
  `property-value-change`, which Umbraco removes in 20.0.0.

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
