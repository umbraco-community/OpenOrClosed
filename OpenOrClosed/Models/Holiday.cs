using System.Text.Json.Serialization;
using OpenOrClosed.Core.Serialization;

namespace OpenOrClosed.Core.Models;

/// <summary>A named date range that overrides the weekly schedule.</summary>
public sealed class Holiday
{
    [JsonPropertyName("name")]
    public string Name { get; init; } = string.Empty;

    [JsonPropertyName("start")]
    public DateOnly Start { get; init; }

    /// <summary>Inclusive - a one-day holiday has <see cref="End"/> equal to <see cref="Start"/>.</summary>
    [JsonPropertyName("end")]
    public DateOnly End { get; init; }

    /// <summary>When true the range recurs every year and never expires.</summary>
    [JsonPropertyName("repeatYearly")]
    public bool RepeatYearly { get; init; }

    /// <summary>
    /// Explicit rather than inferred from whether <see cref="Hours"/> is empty, because that
    /// distinction does not survive a round-trip reliably.
    /// </summary>
    /// <remarks>
    /// The attribute matters independently of <see cref="StoredValueJson.Options"/>: the Delivery
    /// API serializes this model with Umbraco's own options, so the wire format has to travel on
    /// the property itself.
    /// </remarks>
    [JsonPropertyName("hoursMode")]
    [JsonConverter(typeof(HolidayHoursModeJsonConverter))]
    public HolidayHoursMode HoursMode { get; init; }

    /// <summary>Ignored unless <see cref="HoursMode"/> is <see cref="HolidayHoursMode.Custom"/>.</summary>
    [JsonPropertyName("hours")]
    public IReadOnlyList<HoursRange> Hours { get; init; } = [];
}
