using OpenOrClosed.Core.Models;

namespace OpenOrClosed.Core.Extensions;

/// <summary>
/// Combines a weekly schedule with a holiday schedule. The two live in separate properties, so
/// something has to decide that a holiday beats the weekly hours - this is that, shipped as pure
/// extension methods rather than a service so consumers need no DI.
/// </summary>
public static class OpeningHoursExtensions
{
    /// <summary>Resolves the hours that apply on <paramref name="date"/>.</summary>
    /// <remarks>A matching holiday replaces that day's weekly hours entirely.</remarks>
    public static OpeningHoursForDate OpeningHoursOn(
        this IEnumerable<WeeklyHoursDay> weekly, DateOnly date, HolidaySchedule? holidays = null)
    {
        var holiday = MatchingHoliday(holidays, date);

        var ranges = holiday is null
            ? WeeklyRanges(weekly, date.DayOfWeek)
            : HolidayRanges(holiday, holidays);

        return new OpeningHoursForDate
        {
            Date = date,
            IsOpen = ranges.Count > 0,
            Ranges = ranges,
            Holiday = holiday,
        };
    }

    /// <summary>Whether the business is open at <paramref name="instant"/>.</summary>
    /// <remarks>
    /// A range is treated as <c>Start &lt;= t &lt; End</c>, so closing at 17:00 means shut at
    /// exactly 17:00. A range ending at 24:00 covers every instant up to midnight.
    /// </remarks>
    public static bool IsOpenAt(
        this IEnumerable<WeeklyHoursDay> weekly, DateTime instant, HolidaySchedule? holidays = null)
    {
        var today = weekly.OpeningHoursOn(DateOnly.FromDateTime(instant), holidays);
        var time = instant.TimeOfDay;

        return today.Ranges.Any(range => range.Start <= time && time < range.End);
    }

    private static IReadOnlyList<HoursRange> WeeklyRanges(
        IEnumerable<WeeklyHoursDay> weekly, DayOfWeek day)
        => weekly.FirstOrDefault(entry => entry.Day == day)?.Ranges ?? [];

    private static IReadOnlyList<HoursRange> HolidayRanges(
        Holiday holiday, HolidaySchedule? holidays)
        => holiday.HoursMode switch
        {
            // An empty default track means a Default holiday is closed - the intended reading.
            HolidayHoursMode.Default => holidays?.DefaultHours ?? [],
            HolidayHoursMode.Custom => holiday.Hours,
            _ => [],
        };

    /// <summary>
    /// The holiday covering <paramref name="date"/> whose occurrence starts earliest, ties
    /// breaking on list order.
    /// </summary>
    private static Holiday? MatchingHoliday(HolidaySchedule? holidays, DateOnly date)
    {
        Holiday? best = null;
        DateOnly bestStart = default;

        foreach (var holiday in holidays?.Holidays ?? [])
        {
            if (!Covers(holiday, date, out var occurrenceStart))
            {
                continue;
            }

            // Strictly earlier, so an equal start leaves the earlier list entry in place.
            if (best is null || occurrenceStart < bestStart)
            {
                best = holiday;
                bestStart = occurrenceStart;
            }
        }

        return best;
    }

    /// <summary>
    /// Whether <paramref name="holiday"/> covers <paramref name="date"/>, reporting which
    /// occurrence matched so callers can compare starts.
    /// </summary>
    private static bool Covers(Holiday holiday, DateOnly date, out DateOnly occurrenceStart)
    {
        occurrenceStart = holiday.Start;

        if (!holiday.RepeatYearly)
        {
            return date >= holiday.Start && date <= holiday.End;
        }

        // Test this year's occurrence and the previous one: a range beginning in December has to
        // still match in January. AddYears clamps 29 February to the 28th, which is desired.
        var offset = date.Year - holiday.Start.Year;

        foreach (var years in (int[])[offset, offset - 1])
        {
            var start = holiday.Start.AddYears(years);
            var end = holiday.End.AddYears(years);

            if (date >= start && date <= end)
            {
                occurrenceStart = start;
                return true;
            }
        }

        return false;
    }
}
