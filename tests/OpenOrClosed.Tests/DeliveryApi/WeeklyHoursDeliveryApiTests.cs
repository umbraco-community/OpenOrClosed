using System.Text.Json;
using OpenOrClosed.Core.Models;
using OpenOrClosed.Core.PropertyEditors;
using OpenOrClosed.Core.PropertyValueConverters;
using OpenOrClosed.Tests.TestDoubles;
using Umbraco.Cms.Core.Models.PublishedContent;
using Umbraco.Cms.Core.PropertyEditors;

namespace OpenOrClosed.Tests.DeliveryApi;

public class WeeklyHoursDeliveryApiTests
{
    private const string StoredValue = """
        [
          { "day": 1, "ranges": [
              { "start": "09:00", "end": "12:30", "label": null, "byAppointmentOnly": false },
              { "start": "13:30", "end": "17:00", "label": "Kitchen closes 4:30", "byAppointmentOnly": false } ] },
          { "day": 6, "ranges": [
              { "start": "18:00", "end": "24:00", "label": null, "byAppointmentOnly": true } ] }
        ]
        """;

    private static readonly WeeklyHoursConverter Converter = new();

    private static IPublishedPropertyType PropertyType =>
        PropertyTypeStub.For(WeeklyHoursPropertyEditor.EditorAlias);

    private static object? Intermediate(string? source) =>
        Converter.ConvertSourceToIntermediate(null!, PropertyType, source, false);

    private static List<WeeklyHoursDay> DeliveryApiValue(string? source) =>
        ((IEnumerable<WeeklyHoursDay>)Converter.ConvertIntermediateToDeliveryApiObject(
            null!, PropertyType, PropertyCacheLevel.Element, Intermediate(source), false, false)!).ToList();

    [Fact]
    public void IsConverter_MatchesOnlyItsOwnEditorAlias()
    {
        Converter.IsConverter(PropertyTypeStub.For(WeeklyHoursPropertyEditor.EditorAlias)).Should().BeTrue();
        Converter.IsConverter(PropertyTypeStub.For(StandardHoursPropertyEditor.EditorAlias)).Should().BeFalse();
    }

    [Fact]
    public void GetDeliveryApiPropertyValueType_MatchesTheRazorValueType()
    {
        Converter.GetDeliveryApiPropertyValueType(PropertyType)
            .Should().Be(typeof(IEnumerable<WeeklyHoursDay>))
            .And.Be(Converter.GetPropertyValueType(PropertyType));
    }

    [Fact]
    public void GetDeliveryApiPropertyCacheLevel_IsElement()
    {
        // Nothing in this conversion depends on today, unlike the older editors.
        Converter.GetDeliveryApiPropertyCacheLevel(PropertyType).Should().Be(PropertyCacheLevel.Element);
        Converter.GetPropertyCacheLevel(PropertyType).Should().Be(PropertyCacheLevel.Element);
    }

    [Fact]
    public void Convert_AlwaysReturnsSevenDaysMondayFirst()
    {
        var days = DeliveryApiValue(StoredValue);

        days.Select(d => d.Day).Should().Equal(
            DayOfWeek.Monday, DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday,
            DayOfWeek.Friday, DayOfWeek.Saturday, DayOfWeek.Sunday);
    }

    [Fact]
    public void Convert_MarksDaysWithoutRangesClosed()
    {
        var days = DeliveryApiValue(StoredValue);

        days.Single(d => d.Day == DayOfWeek.Monday).IsOpen.Should().BeTrue();
        days.Single(d => d.Day == DayOfWeek.Tuesday).IsOpen.Should().BeFalse();
        days.Single(d => d.Day == DayOfWeek.Tuesday).Ranges.Should().BeEmpty();
    }

    [Fact]
    public void Convert_KeepsTheDetailOfEachRangeAndSortsThem()
    {
        var monday = DeliveryApiValue(StoredValue).Single(d => d.Day == DayOfWeek.Monday);

        monday.Ranges.Select(r => r.Start).Should().Equal(new TimeSpan(9, 0, 0), new TimeSpan(13, 30, 0));
        monday.Ranges[1].Label.Should().Be("Kitchen closes 4:30");
    }

    [Fact]
    public void Convert_HandlesAnEndOfMidnight()
    {
        var saturday = DeliveryApiValue(StoredValue).Single(d => d.Day == DayOfWeek.Saturday);

        saturday.Ranges.Should().ContainSingle();
        saturday.Ranges[0].End.Should().Be(TimeSpan.FromHours(24));
        saturday.Ranges[0].ByAppointmentOnly.Should().BeTrue();
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Convert_StillReturnsSevenClosedDaysForNoValue(string? source)
    {
        var days = DeliveryApiValue(source);

        days.Should().HaveCount(7);
        days.Should().OnlyContain(d => d.IsOpen == false);
    }

    /// <summary>
    /// A value written by the AngularJS editor, then edited in this one. The old rows are still there,
    /// and one of them - the "Holidays" row - names no day at all.
    /// </summary>
    private const string StoredValueUpgradedFromTheOldEditor = """
        [
          { "dayoftheweek": "Saturday", "day": 6, "isOpen": false, "hoursOfBusiness": [] },
          { "dayoftheweek": "Holidays", "day": null, "isOpen": false, "hoursOfBusiness": [] },
          { "day": 1, "ranges": [ { "start": "07:00", "end": "19:00" } ] },
          { "day": 2, "ranges": [ { "start": "07:00", "end": "19:00" } ] }
        ]
        """;

    /// <summary>
    /// The row naming no day used to refuse the entire document, and a refused document is indistinguishable
    /// from an empty one - so a site that had upgraded from the old editor quietly read as shut all week.
    /// </summary>
    [Fact]
    public void Convert_SkipsARowThatNamesNoDayRatherThanLosingTheWholeWeek()
    {
        var days = DeliveryApiValue(StoredValueUpgradedFromTheOldEditor);

        days.Single(d => d.Day == DayOfWeek.Monday).Ranges.Should().ContainSingle()
            .Which.Start.Should().Be(TimeSpan.FromHours(7));
        days.Single(d => d.Day == DayOfWeek.Tuesday).IsOpen.Should().BeTrue();
    }

    /// <summary>
    /// And the old rows themselves are simply ignored. They carry <c>hoursOfBusiness</c> rather than
    /// <c>ranges</c>, so there is nothing in them this editor can show.
    /// </summary>
    [Fact]
    public void Convert_IgnoresRowsFromTheOldEditor()
    {
        var days = DeliveryApiValue(StoredValueUpgradedFromTheOldEditor);

        days.Should().HaveCount(7);
        days.Single(d => d.Day == DayOfWeek.Saturday).IsOpen.Should().BeFalse();
    }

    [Fact]
    public void Convert_DoesNotMutateTheIntermediate()
    {
        var intermediate = Intermediate(StoredValue);

        var first = ((IEnumerable<WeeklyHoursDay>)Converter.ConvertIntermediateToObject(
            null!, PropertyType, PropertyCacheLevel.Element, intermediate, false)!).ToList();
        var second = ((IEnumerable<WeeklyHoursDay>)Converter.ConvertIntermediateToObject(
            null!, PropertyType, PropertyCacheLevel.Element, intermediate, false)!).ToList();

        first.Single(d => d.Day == DayOfWeek.Monday).Ranges.Should()
            .HaveCount(second.Single(d => d.Day == DayOfWeek.Monday).Ranges.Count);
    }

    [Fact]
    public void Convert_SerializesToCamelCaseJson()
    {
        var monday = DeliveryApiValue(StoredValue).Single(d => d.Day == DayOfWeek.Monday);
        var json = JsonSerializer.Serialize(monday,
            new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });

        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;

        root.GetProperty("day").GetInt32().Should().Be((int)DayOfWeek.Monday);
        root.GetProperty("isOpen").GetBoolean().Should().BeTrue();
        root.GetProperty("ranges")[0].GetProperty("start").GetString().Should().Be("09:00");
        root.GetProperty("ranges")[0].GetProperty("end").GetString().Should().Be("12:30");
    }
}
