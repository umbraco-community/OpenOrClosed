namespace OpenOrClosed.Core.PropertyValueConverters;

/// <summary>
/// Helpers for placing stored opening and closing times onto a calendar date.
/// </summary>
/// <remarks>
/// Times are stored without a meaningful date (the editor writes "09:00:00"), so whatever date
/// the deserializer happens to attach to them has to be replaced before the value is handed out.
/// </remarks>
internal static class HoursDate
{
    /// <summary>Number of days from the Monday that starts the week (Monday = 0 ... Sunday = 6).</summary>
    internal static int DaysFromMonday(DayOfWeek dayOfWeek) => ((int)dayOfWeek + 6) % 7;

    /// <summary>Moves a stored time onto <paramref name="date"/>, keeping only its time of day.</summary>
    internal static DateTime? OnDate(DateTime date, DateTime? time)
        => time is null ? null : date.Date.Add(time.Value.TimeOfDay);
}
