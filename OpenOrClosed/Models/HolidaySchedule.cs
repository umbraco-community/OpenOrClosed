using System.Text.Json.Serialization;

namespace OpenOrClosed.Core.Models;

/// <summary>The value of an <c>OpenOrClosed.Holidays</c> property.</summary>
public sealed class HolidaySchedule
{
    /// <summary>
    /// The hours a holiday uses when its mode is <see cref="HolidayHoursMode.Default"/>. Empty
    /// means such a holiday is closed, which is the intended reading of an empty default track.
    /// </summary>
    [JsonPropertyName("defaultHours")]
    public IReadOnlyList<HoursRange> DefaultHours { get; init; } = [];

    [JsonPropertyName("holidays")]
    public IReadOnlyList<Holiday> Holidays { get; init; } = [];
}
