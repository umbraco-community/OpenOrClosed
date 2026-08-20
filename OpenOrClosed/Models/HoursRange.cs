using System.Text.Json.Serialization;
using OpenOrClosed.Core.Serialization;

namespace OpenOrClosed.Core.Models;

/// <summary>One set of opening hours within a single day.</summary>
public sealed class HoursRange
{
    [JsonPropertyName("start")]
    [JsonConverter(typeof(HoursTimeSpanJsonConverter))]
    public TimeSpan Start { get; init; }

    /// <summary>May be 24:00, meaning the end of the day.</summary>
    [JsonPropertyName("end")]
    [JsonConverter(typeof(HoursTimeSpanJsonConverter))]
    public TimeSpan End { get; init; }

    [JsonIgnore]
    public TimeSpan Duration => End - Start;

    [JsonPropertyName("label")]
    public string? Label { get; init; }

    [JsonPropertyName("byAppointmentOnly")]
    public bool ByAppointmentOnly { get; init; }
}
