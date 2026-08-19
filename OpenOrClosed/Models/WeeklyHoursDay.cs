using System.Globalization;
using System.Text.Json.Serialization;

namespace OpenOrClosed.Core.Models;

/// <summary>One day of the recurring weekly schedule.</summary>
public sealed class WeeklyHoursDay
{
    [JsonPropertyName("day")]
    public DayOfWeek Day { get; init; }

    /// <summary>The day's name in the current culture.</summary>
    [JsonPropertyName("dayName")]
    public string DayName { get; init; } = string.Empty;

    [JsonPropertyName("ranges")]
    public IReadOnlyList<HoursRange> Ranges { get; init; } = [];

    [JsonPropertyName("isOpen")]
    public bool IsOpen => Ranges.Count > 0;

    internal static string NameOf(DayOfWeek day)
        => CultureInfo.CurrentCulture.DateTimeFormat.GetDayName(day);
}

/// <summary>The stored shape, which holds only the days that have hours.</summary>
internal sealed class WeeklyHoursDayDto
{
    [JsonPropertyName("day")]
    public int Day { get; init; }

    [JsonPropertyName("ranges")]
    public List<HoursRange> Ranges { get; init; } = [];
}
