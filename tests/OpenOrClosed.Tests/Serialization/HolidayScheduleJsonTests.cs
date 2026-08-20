using System.Text.Json;
using OpenOrClosed.Core.Models;
using OpenOrClosed.Core.Serialization;

namespace OpenOrClosed.Tests.Serialization;

public class HolidayScheduleJsonTests
{
    private const string StoredValue = """
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
        """;

    private static HolidaySchedule Read(string json) =>
        StoredValueJson.Deserialize<HolidaySchedule>(json)!;

    [Fact]
    public void Deserialize_ReadsDefaultHoursAndHolidays()
    {
        var schedule = Read(StoredValue);

        schedule.DefaultHours.Should().HaveCount(1);
        schedule.DefaultHours[0].Start.Should().Be(TimeSpan.FromHours(10));
        schedule.DefaultHours[0].End.Should().Be(TimeSpan.FromHours(14));

        schedule.Holidays.Should().HaveCount(2);
        schedule.Holidays[0].Name.Should().Be("Christmas Shutdown");
        schedule.Holidays[0].Start.Should().Be(new DateOnly(2026, 12, 27));
        schedule.Holidays[0].End.Should().Be(new DateOnly(2027, 1, 2));
        schedule.Holidays[0].RepeatYearly.Should().BeTrue();
        schedule.Holidays[0].HoursMode.Should().Be(HolidayHoursMode.Default);
        schedule.Holidays[0].Hours.Should().BeEmpty();
    }

    [Fact]
    public void Deserialize_ReadsCustomHoursIncludingEndOfDay()
    {
        var holiday = Read(StoredValue).Holidays[1];

        holiday.HoursMode.Should().Be(HolidayHoursMode.Custom);
        holiday.Hours.Should().HaveCount(1);
        holiday.Hours[0].End.Should().Be(TimeSpan.FromHours(12));
    }

    [Fact]
    public void Deserialize_ReadsAnEndOfDayRange()
    {
        const string tillMidnight = """
            { "defaultHours": [ { "start": "18:00", "end": "24:00" } ], "holidays": [] }
            """;

        Read(tillMidnight).DefaultHours[0].End.Should().Be(TimeSpan.FromHours(24));
    }

    [Theory]
    [InlineData("\"default\"", HolidayHoursMode.Default)]
    [InlineData("\"closed\"", HolidayHoursMode.Closed)]
    [InlineData("\"custom\"", HolidayHoursMode.Custom)]
    [InlineData("\"Custom\"", HolidayHoursMode.Custom)]
    [InlineData("\"CLOSED\"", HolidayHoursMode.Closed)]
    public void HoursMode_IsReadCaseInsensitively(string json, HolidayHoursMode expected)
    {
        JsonSerializer.Deserialize<HolidayHoursMode>(json, StoredValueJson.Options)
            .Should().Be(expected);
    }

    [Theory]
    [InlineData("\"\"")]
    [InlineData("\"nonsense\"")]
    [InlineData("null")]
    [InlineData("3")]
    public void HoursMode_FallsBackToDefaultRatherThanThrowing(string json)
    {
        // Stored values were written by several generations of editor; a bad mode must not
        // take the whole property down.
        JsonSerializer.Deserialize<HolidayHoursMode>(json, StoredValueJson.Options)
            .Should().Be(HolidayHoursMode.Default);
    }

    [Fact]
    public void HoursMode_IsWrittenAsLowercase()
    {
        // The Delivery API emits this, so the wire format must match what the editor stores.
        JsonSerializer.Serialize(HolidayHoursMode.Custom, StoredValueJson.Options)
            .Should().Be("\"custom\"");
    }

    [Fact]
    public void HoursMode_IsWrittenAsLowercaseByTheAttributeAlone()
    {
        // The Delivery API serializes the converted model with Umbraco's options, not ours, so
        // the [JsonConverter] attribute has to carry the wire format on its own.
        var holiday = new Holiday { Name = "Stocktake", HoursMode = HolidayHoursMode.Closed };

        JsonSerializer.Serialize(holiday).Should().Contain("\"hoursMode\":\"closed\"");
    }

    [Fact]
    public void Deserialize_MalformedJsonReturnsNullRatherThanThrowing()
    {
        StoredValueJson.Deserialize<HolidaySchedule>("{ not json").Should().BeNull();
    }

    [Fact]
    public void Deserialize_MissingCollectionsBecomeEmptyNotNull()
    {
        var schedule = Read("{}");

        schedule.DefaultHours.Should().NotBeNull().And.BeEmpty();
        schedule.Holidays.Should().NotBeNull().And.BeEmpty();
    }

    [Fact]
    public void WeeklyDayIsStillWrittenAsANumber()
    {
        // Guards the Delivery API contract: registering a mode converter must not turn every
        // enum in the package into a string.
        var day = new WeeklyHoursDay { Day = DayOfWeek.Tuesday, DayName = "Tuesday" };

        JsonSerializer.Serialize(day, StoredValueJson.Options).Should().Contain("\"day\":2");
    }
}
