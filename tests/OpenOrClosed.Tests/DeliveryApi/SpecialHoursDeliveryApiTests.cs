using System.Text.Json;
using OpenOrClosed.Core.PropertyEditors;
using OpenOrClosed.Core.PropertyValueConverters;
using OpenOrClosed.Core.ViewModels;
using OpenOrClosed.Tests.TestDoubles;
using Umbraco.Cms.Core.Models.PublishedContent;
using Umbraco.Cms.Core.PropertyEditors;

namespace OpenOrClosed.Tests.DeliveryApi;

public class SpecialHoursDeliveryApiTests
{
    private const string RemoveOldDates = Core.Constants.PropertyEditors.PreValues.RemoveOldDates;

    private const string StoredValue = """
        [
          {"date":"2020-01-02","isOpen":false,"openComment":"","closedComment":"New Year",
           "hoursOfBusiness":[]},
          {"date":"2099-12-25","isOpen":true,"openComment":"Short day","closedComment":"",
           "hoursOfBusiness":[{"opensAt":"08:30:00","closesAt":"12:00:00","comment":"","byAppointmentOnly":true}]}
        ]
        """;

    private static readonly SpecialHoursConverter Converter = new();

    private static IPublishedPropertyType PropertyType(object? removeOldDates = null) =>
        PropertyTypeStub.For(
            SpecialHoursPropertyEditor.EditorAlias,
            removeOldDates is null ? null : new Dictionary<string, object> { [RemoveOldDates] = removeOldDates });

    private static object? Intermediate(string? source, IPublishedPropertyType propertyType) =>
        Converter.ConvertSourceToIntermediate(null!, propertyType, source, false);

    private static List<SpecialDaysViewModel> DeliveryApiValue(string? source, object? removeOldDates = null)
    {
        var propertyType = PropertyType(removeOldDates);
        return ((IEnumerable<SpecialDaysViewModel>)Converter.ConvertIntermediateToDeliveryApiObject(
            null!, propertyType, PropertyCacheLevel.Element, Intermediate(source, propertyType), false, false)!).ToList();
    }

    [Fact]
    public void IsConverter_MatchesOnlyItsOwnEditorAlias()
    {
        Converter.IsConverter(PropertyTypeStub.For(SpecialHoursPropertyEditor.EditorAlias)).Should().BeTrue();
        Converter.IsConverter(PropertyTypeStub.For(StandardHoursPropertyEditor.EditorAlias)).Should().BeFalse();
    }

    [Fact]
    public void GetDeliveryApiPropertyValueType_MatchesTheRazorValueType()
    {
        Converter.GetDeliveryApiPropertyValueType(PropertyType())
            .Should().Be(typeof(IEnumerable<SpecialDaysViewModel>))
            .And.Be(Converter.GetPropertyValueType(PropertyType()));
    }

    [Fact]
    public void GetDeliveryApiPropertyCacheLevel_IsNone()
    {
        // "Remove old dates" is relative to today, so a cached value goes stale overnight.
        Converter.GetDeliveryApiPropertyCacheLevel(PropertyType()).Should().Be(PropertyCacheLevel.None);
        Converter.GetPropertyCacheLevel(PropertyType()).Should().Be(PropertyCacheLevel.None);
    }

    [Fact]
    public void ConvertIntermediateToDeliveryApiObject_ReturnsEveryStoredDateWhenNotRemovingOldOnes()
    {
        var days = DeliveryApiValue(StoredValue, removeOldDates: false);

        days.Should().HaveCount(2);
        days[0].Date.Should().Be(new DateTime(2020, 1, 2));
        days[0].ClosedComment.Should().Be("New Year");
        days[1].OpenComment.Should().Be("Short day");
    }

    [Fact]
    public void ConvertIntermediateToDeliveryApiObject_DropsPastDatesWhenRemovingOldOnes()
    {
        var days = DeliveryApiValue(StoredValue, removeOldDates: true);

        days.Should().ContainSingle();
        days[0].Date.Should().Be(new DateTime(2099, 12, 25));
    }

    [Theory]
    [InlineData(true)]
    [InlineData(1)]
    [InlineData("1")]
    [InlineData("true")]
    [InlineData("True")]
    public void ConvertIntermediateToDeliveryApiObject_ReadsRemoveOldDatesHoweverItWasStored(object stored)
    {
        // Toggles have been persisted as booleans, as "1" and as "true" across versions - none of
        // them may throw on the way out.
        DeliveryApiValue(StoredValue, stored).Should().ContainSingle();
    }

    [Theory]
    [InlineData(false)]
    [InlineData("0")]
    [InlineData("")]
    [InlineData(null)]
    public void ConvertIntermediateToDeliveryApiObject_KeepsPastDatesWhenRemoveOldDatesIsNotSet(object? stored)
    {
        DeliveryApiValue(StoredValue, stored).Should().HaveCount(2);
    }

    [Theory]
    [InlineData("true", true)]
    [InlineData("false", false)]
    public void ConvertIntermediateToDeliveryApiObject_ReadsRemoveOldDatesFromAnUnconvertedJsonValue(string rawJson, bool expectedToFilter)
    {
        // Umbraco deserializes data type configuration with System.Text.Json, so the boxed value
        // reaching us can still be a JsonElement rather than a bool.
        using var document = JsonDocument.Parse(rawJson);

        var days = DeliveryApiValue(StoredValue, document.RootElement.Clone());

        days.Should().HaveCount(expectedToFilter ? 1 : 2);
    }

    [Fact]
    public void ConvertIntermediateToDeliveryApiObject_SetsHasHoursFromTheHoursItActuallyHas()
    {
        var days = DeliveryApiValue(StoredValue, removeOldDates: false);

        days[0].HasHours.Should().BeFalse();
        days[1].HasHours.Should().BeTrue();
    }

    [Fact]
    public void ConvertIntermediateToDeliveryApiObject_PutsEachSetOfHoursOnItsOwnDate()
    {
        var christmas = DeliveryApiValue(StoredValue, removeOldDates: false)[1];

        var hours = christmas.HoursOfBusiness.Should().ContainSingle().Subject;
        hours.OpensAt.Should().Be(new DateTime(2099, 12, 25, 8, 30, 0));
        hours.ClosesAt.Should().Be(new DateTime(2099, 12, 25, 12, 0, 0));
        hours.ByAppointmentOnly.Should().BeTrue();
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void ConvertIntermediateToDeliveryApiObject_IsEmptyRatherThanNullForNoValue(string? source)
    {
        DeliveryApiValue(source).Should().BeEmpty();
    }

    [Fact]
    public void ConvertIntermediateToDeliveryApiObject_DoesNotMutateTheIntermediate()
    {
        var propertyType = PropertyType(removeOldDates: false);
        var intermediate = (List<SpecialDaysViewModel>)Intermediate(StoredValue, propertyType)!;
        var before = intermediate[1].HoursOfBusiness[0].OpensAt;

        Converter.ConvertIntermediateToDeliveryApiObject(null!, propertyType, PropertyCacheLevel.Element, intermediate, false, false);
        Converter.ConvertIntermediateToObject(null!, propertyType, PropertyCacheLevel.Element, intermediate, false);

        intermediate.Should().HaveCount(2, "filtering must not remove entries from the shared intermediate");
        intermediate[1].HoursOfBusiness[0].OpensAt.Should().Be(before);
        intermediate[1].HasHours.Should().BeFalse("the stored value has no hasHours flag");
    }

    [Fact]
    public void ConvertIntermediateToDeliveryApiObject_SerializesToCamelCaseJson()
    {
        var christmas = DeliveryApiValue(StoredValue, removeOldDates: false)[1];
        var json = JsonSerializer.Serialize(christmas, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });

        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;

        root.GetProperty("date").GetDateTime().Should().Be(new DateTime(2099, 12, 25));
        root.GetProperty("isOpen").GetBoolean().Should().BeTrue();
        root.GetProperty("hasHours").GetBoolean().Should().BeTrue();
        root.GetProperty("hoursOfBusiness")[0].GetProperty("opensAt").GetDateTime().Should().Be(new DateTime(2099, 12, 25, 8, 30, 0));
    }

    [Fact]
    public void AnchorToDates_ComparesRemoveOldDatesAgainstTodayNotNow()
    {
        // A date is "past" only once the day itself has passed - today's entry has to survive,
        // however late in the day the request arrives.
        var propertyType = PropertyType(removeOldDates: true);
        var intermediate = (List<SpecialDaysViewModel>)Intermediate(
            """[{"date":"2026-08-19","isOpen":true,"hoursOfBusiness":[{"opensAt":"09:00:00"}]}]""", propertyType)!;

        var days = SpecialHoursConverter.AnchorToDates(intermediate, removeOldDates: true, today: new DateTime(2026, 8, 19)).ToList();

        days.Should().ContainSingle();

        SpecialHoursConverter.AnchorToDates(intermediate, removeOldDates: true, today: new DateTime(2026, 8, 20))
            .Should().BeEmpty();
    }
}
