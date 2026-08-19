using System.Text.Json;
using OpenOrClosed.Core.PropertyEditors;
using OpenOrClosed.Core.PropertyValueConverters;
using OpenOrClosed.Core.ViewModels;
using OpenOrClosed.Tests.TestDoubles;
using Umbraco.Cms.Core.Models.PublishedContent;
using Umbraco.Cms.Core.PropertyEditors;

namespace OpenOrClosed.Tests.DeliveryApi;

public class StandardHoursDeliveryApiTests
{
    private const string StoredValue = """
        [
          {"dayoftheweek":"Monday","day":1,"isOpen":true,"openComment":"","closedComment":"",
           "hoursOfBusiness":[{"opensAt":"09:00:00","closesAt":"17:00:00","comment":"","byAppointmentOnly":false}]},
          {"dayoftheweek":"Sunday","day":0,"isOpen":true,"openComment":"","closedComment":"",
           "hoursOfBusiness":[{"opensAt":"10:00:00","closesAt":"14:00:00","comment":"brunch","byAppointmentOnly":true}]},
          {"dayoftheweek":"Bank Holidays","day":null,"isOpen":false,"openComment":"","closedComment":"Closed",
           "hoursOfBusiness":[]}
        ]
        """;

    private static readonly StandardHoursConverter Converter = new();

    private static IPublishedPropertyType PropertyType => PropertyTypeStub.For(StandardHoursPropertyEditor.EditorAlias);

    private static object? Intermediate(string? source) =>
        Converter.ConvertSourceToIntermediate(null!, PropertyType, source, false);

    private static List<DaysViewModel> DeliveryApiValue(string? source) =>
        ((IEnumerable<DaysViewModel>)Converter.ConvertIntermediateToDeliveryApiObject(
            null!, PropertyType, PropertyCacheLevel.Element, Intermediate(source), false, false)!).ToList();

    [Fact]
    public void IsConverter_MatchesOnlyItsOwnEditorAlias()
    {
        Converter.IsConverter(PropertyTypeStub.For(StandardHoursPropertyEditor.EditorAlias)).Should().BeTrue();
        Converter.IsConverter(PropertyTypeStub.For(SpecialHoursPropertyEditor.EditorAlias)).Should().BeFalse();
        Converter.IsConverter(PropertyTypeStub.For("Umbraco.TextBox")).Should().BeFalse();
    }

    [Fact]
    public void GetDeliveryApiPropertyValueType_MatchesTheRazorValueType()
    {
        // A Delivery API consumer and a view should be looking at the same model.
        Converter.GetDeliveryApiPropertyValueType(PropertyType)
            .Should().Be(typeof(IEnumerable<DaysViewModel>))
            .And.Be(Converter.GetPropertyValueType(PropertyType));
    }

    [Fact]
    public void GetDeliveryApiPropertyCacheLevel_IsNone()
    {
        // The converted value is anchored to the current week, so caching it would serve stale
        // dates as soon as a request crossed a day boundary.
        Converter.GetDeliveryApiPropertyCacheLevel(PropertyType).Should().Be(PropertyCacheLevel.None);
        Converter.GetPropertyCacheLevel(PropertyType).Should().Be(PropertyCacheLevel.None);
    }

    [Fact]
    public void ConvertIntermediateToDeliveryApiObject_ReturnsEveryStoredDay()
    {
        var days = DeliveryApiValue(StoredValue);

        days.Should().HaveCount(3);
        days.Select(day => day.DayOfTheWeek).Should().Equal("Monday", "Sunday", "Bank Holidays");
        days[0].IsOpen.Should().BeTrue();
        days[0].HoursOfBusiness.Should().ContainSingle();
        days[2].ClosedComment.Should().Be("Closed");
    }

    [Fact]
    public void ConvertIntermediateToDeliveryApiObject_SetsHasHoursFromTheHoursItActuallyHas()
    {
        // The editor never writes `hasHours`, so it has to be derived on the way out.
        var days = DeliveryApiValue(StoredValue);

        days[0].HasHours.Should().BeTrue();
        days[2].HasHours.Should().BeFalse();
    }

    [Fact]
    public void ConvertIntermediateToDeliveryApiObject_KeepsTheDetailOfEachSetOfHours()
    {
        var sunday = DeliveryApiValue(StoredValue).Single(day => day.Day == DayOfWeek.Sunday);

        var hours = sunday.HoursOfBusiness.Should().ContainSingle().Subject;
        hours.Comment.Should().Be("brunch");
        hours.ByAppointmentOnly.Should().BeTrue();
        hours.OpensAt!.Value.TimeOfDay.Should().Be(new TimeSpan(10, 0, 0));
        hours.ClosesAt!.Value.TimeOfDay.Should().Be(new TimeSpan(14, 0, 0));
    }

    [Fact]
    public void ConvertIntermediateToDeliveryApiObject_PutsEachDaysHoursOnThatDaysDate()
    {
        foreach (var day in DeliveryApiValue(StoredValue).Where(d => d.Day is not null))
        {
            foreach (var hours in day.HoursOfBusiness)
            {
                hours.OpensAt!.Value.DayOfWeek.Should().Be(day.Day!.Value);
                hours.ClosesAt!.Value.DayOfWeek.Should().Be(day.Day!.Value);
            }
        }
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void ConvertIntermediateToDeliveryApiObject_IsEmptyRatherThanNullForNoValue(string? source)
    {
        // Returning null makes every consumer guard before enumerating.
        DeliveryApiValue(source).Should().BeEmpty();
    }

    [Fact]
    public void ConvertIntermediateToDeliveryApiObject_DoesNotMutateTheIntermediate()
    {
        // The intermediate is cached for the lifetime of the element and shared between the
        // Delivery API and Razor, so converting must not write back into it.
        var intermediate = (List<DaysViewModel>)Intermediate(StoredValue)!;
        var before = intermediate[0].HoursOfBusiness[0].OpensAt;

        Converter.ConvertIntermediateToDeliveryApiObject(null!, PropertyType, PropertyCacheLevel.Element, intermediate, false, false);
        Converter.ConvertIntermediateToObject(null!, PropertyType, PropertyCacheLevel.Element, intermediate, false);

        intermediate[0].HoursOfBusiness[0].OpensAt.Should().Be(before);
        intermediate[0].HasHours.Should().BeFalse("the stored value has no hasHours flag");
    }

    [Fact]
    public void ConvertIntermediateToDeliveryApiObject_IsRepeatable()
    {
        var intermediate = Intermediate(StoredValue);

        var first = (IEnumerable<DaysViewModel>)Converter.ConvertIntermediateToDeliveryApiObject(null!, PropertyType, PropertyCacheLevel.Element, intermediate, false, false)!;
        var second = (IEnumerable<DaysViewModel>)Converter.ConvertIntermediateToDeliveryApiObject(null!, PropertyType, PropertyCacheLevel.Element, intermediate, false, false)!;

        first.First().HoursOfBusiness[0].OpensAt.Should().Be(second.First().HoursOfBusiness[0].OpensAt);
    }

    [Fact]
    public void ConvertIntermediateToDeliveryApiObject_SerializesToCamelCaseJson()
    {
        // The shape an API consumer actually receives.
        var monday = DeliveryApiValue(StoredValue).First();
        var json = JsonSerializer.Serialize(monday, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });

        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;

        root.GetProperty("dayOfTheWeek").GetString().Should().Be("Monday");
        root.GetProperty("isOpen").GetBoolean().Should().BeTrue();
        root.GetProperty("hasHours").GetBoolean().Should().BeTrue();
        root.GetProperty("hoursOfBusiness")[0].GetProperty("byAppointmentOnly").GetBoolean().Should().BeFalse();
        root.GetProperty("hoursOfBusiness")[0].GetProperty("opensAt").GetDateTime().TimeOfDay.Should().Be(new TimeSpan(9, 0, 0));
    }

    [Theory]
    // Monday 17 Aug 2026 through Sunday 23 Aug 2026 - whichever day it is, the week must not move.
    [InlineData("2026-08-17")]
    [InlineData("2026-08-18")]
    [InlineData("2026-08-19")]
    [InlineData("2026-08-20")]
    [InlineData("2026-08-21")]
    [InlineData("2026-08-22")]
    [InlineData("2026-08-23")]
    public void AnchorToCurrentWeek_MapsEveryDayIntoTheMondayToSundayWeekContainingToday(string todayText)
    {
        var today = DateTime.Parse(todayText);
        var intermediate = (List<DaysViewModel>)Intermediate(StoredValue)!;

        var days = StandardHoursConverter.AnchorToCurrentWeek(intermediate, today).ToList();

        var monday = days.Single(day => day.Day == DayOfWeek.Monday);
        var sunday = days.Single(day => day.Day == DayOfWeek.Sunday);

        monday.HoursOfBusiness[0].OpensAt.Should().Be(new DateTime(2026, 8, 17, 9, 0, 0));
        sunday.HoursOfBusiness[0].OpensAt.Should().Be(new DateTime(2026, 8, 23, 10, 0, 0));
    }

    [Fact]
    public void AnchorToCurrentWeek_OnASundayKeepsSundayAsToday()
    {
        // The previous offset maths pushed the whole week forward whenever today was a Sunday,
        // so Sunday's hours were reported a week late.
        var sunday = new DateTime(2026, 8, 23);
        var intermediate = (List<DaysViewModel>)Intermediate(StoredValue)!;

        var days = StandardHoursConverter.AnchorToCurrentWeek(intermediate, sunday).ToList();

        days.Single(day => day.Day == DayOfWeek.Sunday).HoursOfBusiness[0].OpensAt!.Value.Date.Should().Be(sunday);
        days.Single(day => day.Day == DayOfWeek.Monday).HoursOfBusiness[0].OpensAt!.Value.Date.Should().Be(new DateTime(2026, 8, 17));
    }

    [Fact]
    public void AnchorToCurrentWeek_LeavesBankHolidaysOnToday()
    {
        // Bank Holidays carry no day of the week, so there is no week position to anchor them to.
        var today = new DateTime(2026, 8, 19);
        var intermediate = (List<DaysViewModel>)Intermediate(StoredValue)!;

        var bankHolidays = StandardHoursConverter.AnchorToCurrentWeek(intermediate, today).Single(day => day.Day is null);

        bankHolidays.DayOfTheWeek.Should().Be("Bank Holidays");
        bankHolidays.HoursOfBusiness.Should().BeEmpty();
    }
}
