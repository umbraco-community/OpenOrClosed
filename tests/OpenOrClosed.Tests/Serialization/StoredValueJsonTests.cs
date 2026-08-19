using OpenOrClosed.Core.Serialization;
using OpenOrClosed.Core.ViewModels;

namespace OpenOrClosed.Tests.Serialization;

public class StoredValueJsonTests
{
    [Fact]
    public void Deserialize_ReadsTheLowercaseKeyTheEditorActuallyWrites()
    {
        // The editor has written "dayoftheweek" since the AngularJS version. Newtonsoft matched it
        // case-insensitively; STJ has to be told to.
        const string stored = """[{"dayoftheweek":"Monday","day":1,"isOpen":true,"hoursOfBusiness":[]}]""";

        var days = StoredValueJson.Deserialize<List<DaysViewModel>>(stored)!;

        days.Should().ContainSingle();
        days[0].DayOfTheWeek.Should().Be("Monday");
        days[0].Day.Should().Be(DayOfWeek.Monday);
        days[0].IsOpen.Should().BeTrue();
    }

    [Theory]
    [InlineData("09:00:00", 9, 0)]
    [InlineData("09:00", 9, 0)]
    [InlineData("17:30:00", 17, 30)]
    public void Deserialize_ReadsABareTimeAsATimeOfDay(string stored, int hour, int minute)
    {
        // STJ rejects a bare time outright, and Newtonsoft used to attach today's date to it -
        // which is what made the old staleness bug so easy to write. Anchor to no date at all.
        var json = $$"""[{"opensAt":"{{stored}}","closesAt":null}]""";

        var hours = StoredValueJson.Deserialize<List<HoursViewModel>>(json)!;

        hours[0].OpensAt!.Value.TimeOfDay.Should().Be(new TimeSpan(hour, minute, 0));
        hours[0].OpensAt!.Value.Date.Should().Be(default(DateTime));
        hours[0].ClosesAt.Should().BeNull();
    }

    [Fact]
    public void Deserialize_StillReadsARealDate()
    {
        const string stored = """[{"date":"2026-12-25","isOpen":false,"hoursOfBusiness":[]}]""";

        var days = StoredValueJson.Deserialize<List<SpecialDaysViewModel>>(stored)!;

        days[0].Date.Should().Be(new DateTime(2026, 12, 25));
    }

    [Fact]
    public void Deserialize_ReturnsNullForRubbishRatherThanThrowing()
    {
        StoredValueJson.Deserialize<List<DaysViewModel>>("not json").Should().BeNull();
    }
}
