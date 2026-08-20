using OpenOrClosed.Core.Extensions;
using OpenOrClosed.Core.Models;

namespace OpenOrClosed.Tests.Extensions;

public class OpeningHoursExtensionsTests
{
    /// <summary>
    /// Parses "HH:mm". Not <see cref="TimeSpan.Parse(string)"/>, which overflows on "24:00"
    /// because it caps the hour component at 23 - the whole reason HoursTimeSpanJsonConverter
    /// exists.
    /// </summary>
    private static TimeSpan Time(string value)
    {
        var parts = value.Split(':');
        return new TimeSpan(int.Parse(parts[0]), int.Parse(parts[1]), 0);
    }

    private static HoursRange Range(string start, string end) =>
        new() { Start = Time(start), End = Time(end) };

    /// <summary>Nine to five every day, so a holiday's effect is always visible.</summary>
    private static readonly WeeklyHoursDay[] NineToFive =
    [
        .. new[]
        {
            DayOfWeek.Monday, DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday,
            DayOfWeek.Friday, DayOfWeek.Saturday, DayOfWeek.Sunday,
        }.Select(day => new WeeklyHoursDay { Day = day, Ranges = [Range("09:00", "17:00")] }),
    ];

    private static WeeklyHoursDay[] ClosedAllWeek =>
        [.. NineToFive.Select(day => new WeeklyHoursDay { Day = day.Day, Ranges = [] })];

    private static HolidaySchedule Schedule(params Holiday[] holidays) =>
        new() { DefaultHours = [Range("10:00", "14:00")], Holidays = holidays };

    private static Holiday Holiday(
        string name, string start, string end,
        HolidayHoursMode mode = HolidayHoursMode.Closed,
        bool repeat = false,
        params HoursRange[] hours) =>
        new()
        {
            Name = name,
            Start = DateOnly.Parse(start),
            End = DateOnly.Parse(end),
            RepeatYearly = repeat,
            HoursMode = mode,
            Hours = hours,
        };

    [Fact]
    public void OpeningHoursOn_WithNoHolidaysUsesTheWeeklySchedule()
    {
        var result = NineToFive.OpeningHoursOn(new DateOnly(2026, 8, 20));

        result.IsOpen.Should().BeTrue();
        result.Ranges.Should().HaveCount(1);
        result.Holiday.Should().BeNull();
        result.Date.Should().Be(new DateOnly(2026, 8, 20));
    }

    [Fact]
    public void OpeningHoursOn_PicksTheRangesForTheRightDayOfWeek()
    {
        var weekdaysOnly = new[]
        {
            new WeeklyHoursDay { Day = DayOfWeek.Thursday, Ranges = [Range("09:00", "17:00")] },
            new WeeklyHoursDay { Day = DayOfWeek.Friday, Ranges = [] },
        };

        // 20 August 2026 is a Thursday, 21 August a Friday.
        weekdaysOnly.OpeningHoursOn(new DateOnly(2026, 8, 20)).IsOpen.Should().BeTrue();
        weekdaysOnly.OpeningHoursOn(new DateOnly(2026, 8, 21)).IsOpen.Should().BeFalse();
    }

    [Fact]
    public void OpeningHoursOn_AClosedHolidayBeatsTheWeeklySchedule()
    {
        var result = NineToFive.OpeningHoursOn(
            new DateOnly(2026, 12, 25),
            Schedule(Holiday("Christmas", "2026-12-25", "2026-12-25")));

        result.IsOpen.Should().BeFalse();
        result.Ranges.Should().BeEmpty();
        result.Holiday!.Name.Should().Be("Christmas");
    }

    [Fact]
    public void OpeningHoursOn_ADefaultHolidayUsesTheScheduleDefaultHours()
    {
        var result = NineToFive.OpeningHoursOn(
            new DateOnly(2026, 12, 28),
            Schedule(Holiday("Boxing week", "2026-12-27", "2026-12-31", HolidayHoursMode.Default)));

        result.IsOpen.Should().BeTrue();
        result.Ranges.Should().HaveCount(1);
        result.Ranges[0].Start.Should().Be(TimeSpan.FromHours(10));
        result.Ranges[0].End.Should().Be(TimeSpan.FromHours(14));
    }

    [Fact]
    public void OpeningHoursOn_ADefaultHolidayOnAnEmptyDefaultTrackIsClosed()
    {
        // An empty default track means "closed on holidays" - that is the intended reading.
        var schedule = new HolidaySchedule
        {
            DefaultHours = [],
            Holidays = [Holiday("Shutdown", "2026-12-27", "2026-12-31", HolidayHoursMode.Default)],
        };

        var result = NineToFive.OpeningHoursOn(new DateOnly(2026, 12, 28), schedule);

        result.IsOpen.Should().BeFalse();
        result.Ranges.Should().BeEmpty();
        result.Holiday.Should().NotBeNull();
    }

    [Fact]
    public void OpeningHoursOn_ACustomHolidayUsesItsOwnHours()
    {
        var result = NineToFive.OpeningHoursOn(
            new DateOnly(2027, 2, 4),
            Schedule(Holiday("Stocktake", "2027-02-03", "2027-02-05",
                HolidayHoursMode.Custom, false, Range("09:00", "12:00"))));

        result.Ranges.Should().HaveCount(1);
        result.Ranges[0].End.Should().Be(TimeSpan.FromHours(12));
    }

    [Fact]
    public void OpeningHoursOn_HolidayRangesAreInclusiveOfBothEnds()
    {
        var schedule = Schedule(Holiday("Shutdown", "2026-12-27", "2026-12-29"));

        NineToFive.OpeningHoursOn(new DateOnly(2026, 12, 26), schedule).Holiday.Should().BeNull();
        NineToFive.OpeningHoursOn(new DateOnly(2026, 12, 27), schedule).Holiday.Should().NotBeNull();
        NineToFive.OpeningHoursOn(new DateOnly(2026, 12, 29), schedule).Holiday.Should().NotBeNull();
        NineToFive.OpeningHoursOn(new DateOnly(2026, 12, 30), schedule).Holiday.Should().BeNull();
    }

    [Fact]
    public void OpeningHoursOn_AYearlyHolidayMatchesInALaterYear()
    {
        var schedule = Schedule(Holiday("Christmas", "2020-12-25", "2020-12-25", repeat: true));

        NineToFive.OpeningHoursOn(new DateOnly(2026, 12, 25), schedule).Holiday.Should().NotBeNull();
    }

    [Fact]
    public void OpeningHoursOn_AYearlyHolidayStartingInDecemberStillMatchesInJanuary()
    {
        // This is why the previous year's occurrence has to be tested too.
        var schedule = Schedule(Holiday("Shutdown", "2020-12-27", "2021-01-02", repeat: true));

        NineToFive.OpeningHoursOn(new DateOnly(2027, 1, 1), schedule).Holiday.Should().NotBeNull();
        NineToFive.OpeningHoursOn(new DateOnly(2026, 12, 28), schedule).Holiday.Should().NotBeNull();
        NineToFive.OpeningHoursOn(new DateOnly(2027, 1, 3), schedule).Holiday.Should().BeNull();
    }

    [Fact]
    public void OpeningHoursOn_AYearlyLeapDayHolidayClampsToThe28thInANonLeapYear()
    {
        // .NET's AddYears clamps 29 Feb to the 28th, which is the behaviour we want.
        var schedule = Schedule(Holiday("Leap day", "2024-02-29", "2024-02-29", repeat: true));

        NineToFive.OpeningHoursOn(new DateOnly(2026, 2, 28), schedule).Holiday.Should().NotBeNull();
        NineToFive.OpeningHoursOn(new DateOnly(2026, 3, 1), schedule).Holiday.Should().BeNull();
    }

    [Fact]
    public void OpeningHoursOn_ANonRepeatingHolidayDoesNotMatchAnotherYear()
    {
        var schedule = Schedule(Holiday("One off", "2020-12-25", "2020-12-25"));

        NineToFive.OpeningHoursOn(new DateOnly(2026, 12, 25), schedule).Holiday.Should().BeNull();
    }

    [Fact]
    public void OpeningHoursOn_TheEarliestStartingHolidayWinsWhenSeveralMatch()
    {
        var schedule = Schedule(
            Holiday("Later", "2026-12-24", "2026-12-26"),
            Holiday("Earlier", "2026-12-20", "2026-12-31", HolidayHoursMode.Default));

        NineToFive.OpeningHoursOn(new DateOnly(2026, 12, 25), schedule)
            .Holiday!.Name.Should().Be("Earlier");
    }

    [Fact]
    public void OpeningHoursOn_TiesBreakOnListOrder()
    {
        var schedule = Schedule(
            Holiday("First listed", "2026-12-25", "2026-12-25"),
            Holiday("Second listed", "2026-12-25", "2026-12-25", HolidayHoursMode.Default));

        NineToFive.OpeningHoursOn(new DateOnly(2026, 12, 25), schedule)
            .Holiday!.Name.Should().Be("First listed");
    }

    [Fact]
    public void OpeningHoursOn_ADayWithNoWeeklyRangesIsClosed()
    {
        var result = ClosedAllWeek.OpeningHoursOn(new DateOnly(2026, 8, 20));

        result.IsOpen.Should().BeFalse();
        result.Ranges.Should().BeEmpty();
    }

    [Fact]
    public void OpeningHoursOn_AnEmptyWeeklyScheduleIsClosedRatherThanThrowing()
    {
        Array.Empty<WeeklyHoursDay>().OpeningHoursOn(new DateOnly(2026, 8, 20))
            .IsOpen.Should().BeFalse();
    }

    [Fact]
    public void OpeningHoursOn_AnEmptyHolidayScheduleFallsBackToTheWeeklyHours()
    {
        var result = NineToFive.OpeningHoursOn(new DateOnly(2026, 8, 20), new HolidaySchedule());

        result.IsOpen.Should().BeTrue();
        result.Holiday.Should().BeNull();
    }

    [Theory]
    [InlineData("08:59", false)]
    [InlineData("09:00", true)]
    [InlineData("12:00", true)]
    [InlineData("16:59", true)]
    [InlineData("17:00", false)]  // closing at 17:00 means shut at exactly 17:00
    [InlineData("23:59", false)]
    public void IsOpenAt_TreatsARangeAsStartInclusiveEndExclusive(string time, bool expected)
    {
        var instant = new DateTime(2026, 8, 20).Add(Time(time));

        NineToFive.IsOpenAt(instant).Should().Be(expected);
    }

    [Theory]
    [InlineData("18:00")]
    [InlineData("23:59")]
    public void IsOpenAt_ARangeEndingAtMidnightCoversEveryInstantToTheEndOfTheDay(string time)
    {
        var openTillMidnight = new[]
        {
            new WeeklyHoursDay { Day = DayOfWeek.Thursday, Ranges = [Range("18:00", "24:00")] },
        };

        openTillMidnight.IsOpenAt(new DateTime(2026, 8, 20).Add(Time(time)))
            .Should().BeTrue($"{time} is before midnight");
    }

    [Fact]
    public void IsOpenAt_AClosedHolidayShutsADayThatWouldOtherwiseBeOpen()
    {
        var instant = new DateTime(2026, 12, 25, 12, 0, 0);

        NineToFive.IsOpenAt(instant).Should().BeTrue("25 December 2026 is a Friday");
        NineToFive.IsOpenAt(instant, Schedule(Holiday("Christmas", "2026-12-25", "2026-12-25")))
            .Should().BeFalse();
    }

    [Fact]
    public void IsOpenAt_UsesTheHolidayHoursNotTheWeeklyOnes()
    {
        var schedule = Schedule(Holiday("Boxing week", "2026-12-27", "2026-12-31",
            HolidayHoursMode.Default));

        // Default hours are 10:00-14:00, weekly are 09:00-17:00.
        NineToFive.IsOpenAt(new DateTime(2026, 12, 28, 9, 30, 0), schedule).Should().BeFalse();
        NineToFive.IsOpenAt(new DateTime(2026, 12, 28, 11, 0, 0), schedule).Should().BeTrue();
        NineToFive.IsOpenAt(new DateTime(2026, 12, 28, 16, 0, 0), schedule).Should().BeFalse();
    }

    [Fact]
    public void IsOpenAt_HandlesSeveralRangesInOneDay()
    {
        var split = new[]
        {
            new WeeklyHoursDay
            {
                Day = DayOfWeek.Thursday,
                Ranges = [Range("09:00", "12:30"), Range("13:30", "17:00")],
            },
        };

        split.IsOpenAt(new DateTime(2026, 8, 20, 10, 0, 0)).Should().BeTrue();
        split.IsOpenAt(new DateTime(2026, 8, 20, 13, 0, 0)).Should().BeFalse("that is the lunch gap");
        split.IsOpenAt(new DateTime(2026, 8, 20, 14, 0, 0)).Should().BeTrue();
    }
}
