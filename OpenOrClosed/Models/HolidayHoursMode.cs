namespace OpenOrClosed.Core.Models;

/// <summary>How a holiday's own hours are decided.</summary>
public enum HolidayHoursMode
{
    /// <summary>Use the schedule's shared default hours.</summary>
    Default,

    /// <summary>Closed for the whole holiday.</summary>
    Closed,

    /// <summary>Use the holiday's own <see cref="Holiday.Hours"/>.</summary>
    Custom,
}
