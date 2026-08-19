using OpenOrClosed.Core.Models;
using OpenOrClosed.Core.PropertyEditors;
using OpenOrClosed.Core.PropertyValueConverters;
using OpenOrClosed.Core.Serialization;
using OpenOrClosed.Tests.TestDoubles;
using Umbraco.Cms.Core.Models.PublishedContent;
using Umbraco.Cms.Core.PropertyEditors;

namespace OpenOrClosed.Tests.DeliveryApi;

public class HolidaysDeliveryApiTests
{
    private const string StoredValue = """
        {
          "defaultHours": [
            { "start": "10:00", "end": "14:00", "label": null, "byAppointmentOnly": false }
          ],
          "holidays": [
            { "name": "Stocktake 2020", "start": "2020-02-03", "end": "2020-02-05",
              "repeatYearly": false, "hoursMode": "closed", "hours": [] },
            { "name": "Christmas Shutdown", "start": "2020-12-27", "end": "2021-01-02",
              "repeatYearly": true, "hoursMode": "default", "hours": [] },
            { "name": "Stocktake", "start": "2027-02-03", "end": "2027-02-05",
              "repeatYearly": false, "hoursMode": "custom",
              "hours": [ { "start": "09:00", "end": "12:00", "label": null, "byAppointmentOnly": false } ] }
          ]
        }
        """;

    private static readonly HolidaysConverter Converter = new();
    private static readonly DateOnly Today = new(2026, 8, 20);

    private static IPublishedPropertyType PropertyType =>
        PropertyTypeStub.For(HolidaysPropertyEditor.EditorAlias);

    private static object? Intermediate(string? source) =>
        Converter.ConvertSourceToIntermediate(null!, PropertyType, source, false);

    private static HolidaySchedule Project(string? source, bool removeExpired) =>
        HolidaysConverter.Project(
            StoredValueJson.Deserialize<HolidaySchedule>(source ?? string.Empty), removeExpired, Today);

    [Fact]
    public void IsConverter_MatchesOnlyItsOwnEditorAlias()
    {
        Converter.IsConverter(PropertyTypeStub.For(HolidaysPropertyEditor.EditorAlias)).Should().BeTrue();
        Converter.IsConverter(PropertyTypeStub.For(WeeklyHoursPropertyEditor.EditorAlias)).Should().BeFalse();
    }

    [Fact]
    public void ValueTypes_MatchAcrossRazorAndDeliveryApi()
    {
        Converter.GetDeliveryApiPropertyValueType(PropertyType)
            .Should().Be(typeof(HolidaySchedule))
            .And.Be(Converter.GetPropertyValueType(PropertyType));
    }

    [Fact]
    public void CacheLevel_IsNoneBecauseExpiryIsRelativeToToday()
    {
        Converter.GetPropertyCacheLevel(PropertyType).Should().Be(PropertyCacheLevel.None);
        Converter.GetDeliveryApiPropertyCacheLevel(PropertyType).Should().Be(PropertyCacheLevel.None);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void ConvertSourceToIntermediate_EmptySourceIsNull(string? source)
    {
        Intermediate(source).Should().BeNull();
    }

    [Fact]
    public void ConvertSourceToIntermediate_DoesNotFilterByDate()
    {
        // The intermediate is cached for the element's lifetime, so anything date-dependent here
        // would freeze at whenever the cache was warmed. This is the bug already fixed once in
        // SpecialHoursConverter.
        var intermediate = (HolidaySchedule)Intermediate(StoredValue)!;

        intermediate.Holidays.Should().HaveCount(3, "expiry belongs in the projection, not here");
    }

    [Fact]
    public void Convert_NeverReturnsNull()
    {
        var value = (HolidaySchedule)Converter.ConvertIntermediateToObject(
            null!, PropertyType, PropertyCacheLevel.None, null, false)!;

        value.Should().NotBeNull();
        value.DefaultHours.Should().BeEmpty();
        value.Holidays.Should().BeEmpty();
    }

    [Fact]
    public void ConvertToDeliveryApi_NeverReturnsNull()
    {
        var value = (HolidaySchedule)Converter.ConvertIntermediateToDeliveryApiObject(
            null!, PropertyType, PropertyCacheLevel.None, null, false, false)!;

        value.DefaultHours.Should().BeEmpty();
        value.Holidays.Should().BeEmpty();
    }

    [Fact]
    public void Project_DropsAPastOneOffHoliday()
    {
        Project(StoredValue, removeExpired: true).Holidays
            .Select(holiday => holiday.Name)
            .Should().NotContain("Stocktake 2020");
    }

    [Fact]
    public void Project_KeepsAPastHolidayThatRepeatsYearly()
    {
        // A repeating holiday never expires - it recurs.
        Project(StoredValue, removeExpired: true).Holidays
            .Select(holiday => holiday.Name)
            .Should().Contain("Christmas Shutdown");
    }

    [Fact]
    public void Project_KeepsAFutureHoliday()
    {
        Project(StoredValue, removeExpired: true).Holidays
            .Select(holiday => holiday.Name)
            .Should().Contain("Stocktake");
    }

    [Fact]
    public void Project_KeepsAHolidayEndingToday()
    {
        const string endsToday = """
            { "defaultHours": [], "holidays": [
                { "name": "Ends today", "start": "2026-08-18", "end": "2026-08-20",
                  "repeatYearly": false, "hoursMode": "closed", "hours": [] } ] }
            """;

        Project(endsToday, removeExpired: true).Holidays.Should().HaveCount(1);
    }

    [Fact]
    public void Project_DropsAHolidayThatEndedYesterday()
    {
        const string endedYesterday = """
            { "defaultHours": [], "holidays": [
                { "name": "Ended yesterday", "start": "2026-08-17", "end": "2026-08-19",
                  "repeatYearly": false, "hoursMode": "closed", "hours": [] } ] }
            """;

        Project(endedYesterday, removeExpired: true).Holidays.Should().BeEmpty();
    }

    [Fact]
    public void Project_KeepsEverythingWhenTheSettingIsOff()
    {
        Project(StoredValue, removeExpired: false).Holidays.Should().HaveCount(3);
    }

    [Fact]
    public void Project_KeepsDefaultHoursRegardlessOfExpiry()
    {
        Project(StoredValue, removeExpired: true).DefaultHours.Should().HaveCount(1);
    }

    [Fact]
    public void Project_PreservesEveryFieldOfAHoliday()
    {
        var holiday = Project(StoredValue, removeExpired: false).Holidays
            .Single(entry => entry.Name == "Stocktake");

        holiday.Start.Should().Be(new DateOnly(2027, 2, 3));
        holiday.End.Should().Be(new DateOnly(2027, 2, 5));
        holiday.RepeatYearly.Should().BeFalse();
        holiday.HoursMode.Should().Be(HolidayHoursMode.Custom);
        holiday.Hours.Should().HaveCount(1);
        holiday.Hours[0].Start.Should().Be(TimeSpan.FromHours(9));
    }

    [Fact]
    public void Project_SortsRangesByStart()
    {
        const string unsorted = """
            { "defaultHours": [
                { "start": "13:00", "end": "17:00" }, { "start": "09:00", "end": "12:00" } ],
              "holidays": [] }
            """;

        Project(unsorted, removeExpired: true).DefaultHours
            .Select(range => range.Start)
            .Should().BeInAscendingOrder();
    }

    [Fact]
    public void Project_DoesNotMutateTheSharedIntermediate()
    {
        // The intermediate is cached for the element's lifetime, so projecting twice from the
        // same instance must give the same answer.
        var stored = StoredValueJson.Deserialize<HolidaySchedule>(StoredValue);

        var first = HolidaysConverter.Project(stored, removeExpired: true, Today).Holidays.Count;
        var second = HolidaysConverter.Project(stored, removeExpired: true, Today).Holidays.Count;

        second.Should().Be(first);
        stored!.Holidays.Should().HaveCount(3, "the stored value itself must be untouched");
    }

    [Fact]
    public void Project_ReturnsFreshInstancesNotTheStoredOnes()
    {
        var stored = StoredValueJson.Deserialize<HolidaySchedule>(StoredValue);

        var projected = HolidaysConverter.Project(stored, removeExpired: false, Today);

        projected.Should().NotBeSameAs(stored);
        projected.Holidays[0].Should().NotBeSameAs(stored!.Holidays[0]);
    }

    [Fact]
    public void Project_MalformedStoredValueBecomesAnEmptySchedule()
    {
        Project("{ not json", removeExpired: true).Holidays.Should().BeEmpty();
    }
}
