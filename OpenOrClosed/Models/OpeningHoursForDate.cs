namespace OpenOrClosed.Core.Models;

/// <summary>The opening hours that apply on one date, after holidays have been taken into account.</summary>
public sealed class OpeningHoursForDate
{
    public DateOnly Date { get; init; }

    public bool IsOpen { get; init; }

    public IReadOnlyList<HoursRange> Ranges { get; init; } = [];

    /// <summary>Set when a holiday applied on this date, otherwise null.</summary>
    public Holiday? Holiday { get; init; }
}
