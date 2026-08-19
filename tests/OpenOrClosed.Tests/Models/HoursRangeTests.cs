using System.Text.Json;
using OpenOrClosed.Core.Models;
using OpenOrClosed.Core.Serialization;

namespace OpenOrClosed.Tests.Models;

public class HoursRangeTests
{
    [Fact]
    public void Deserializes_FromTheStoredShape()
    {
        const string json = """{"start":"09:00","end":"17:00","label":"Kitchen closes 4:30","byAppointmentOnly":true}""";

        var range = StoredValueJson.Deserialize<HoursRange>(json)!;

        range.Start.Should().Be(new TimeSpan(9, 0, 0));
        range.End.Should().Be(new TimeSpan(17, 0, 0));
        range.Duration.Should().Be(TimeSpan.FromHours(8));
        range.Label.Should().Be("Kitchen closes 4:30");
        range.ByAppointmentOnly.Should().BeTrue();
    }

    [Fact]
    public void Deserializes_AnEndOfMidnight()
    {
        // TimeOnly cannot hold this, which is why the model uses TimeSpan.
        var range = StoredValueJson.Deserialize<HoursRange>("""{"start":"18:00","end":"24:00"}""")!;

        range.End.Should().Be(TimeSpan.FromHours(24));
        range.Duration.Should().Be(TimeSpan.FromHours(6));
    }

    [Fact]
    public void Serializes_BackToHoursAndMinutes()
    {
        var range = new HoursRange { Start = new TimeSpan(9, 0, 0), End = TimeSpan.FromHours(24) };

        var json = JsonSerializer.Serialize(range);

        json.Should().Contain("\"start\":\"09:00\"").And.Contain("\"end\":\"24:00\"");
    }

    [Fact]
    public void Serializes_WithoutLeakingDuration()
    {
        // Duration is a convenience for Razor, not part of the API payload.
        JsonSerializer.Serialize(new HoursRange()).Should().NotContain("duration");
    }

    [Theory]
    [InlineData("\"9:00\"")]
    [InlineData("\"25:00\"")]
    [InlineData("\"nope\"")]
    public void Deserialize_RejectsAMalformedTime(string stored)
    {
        var act = () => JsonSerializer.Deserialize<HoursRange>($$"""{"start":{{stored}},"end":"17:00"}""");

        act.Should().Throw<JsonException>();
    }
}
