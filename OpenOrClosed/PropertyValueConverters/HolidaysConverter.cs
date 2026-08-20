using OpenOrClosed.Core.Models;
using OpenOrClosed.Core.PropertyEditors;
using OpenOrClosed.Core.Serialization;
using Umbraco.Cms.Core.Models.PublishedContent;
using Umbraco.Cms.Core.PropertyEditors;
using Umbraco.Cms.Core.PropertyEditors.DeliveryApi;

namespace OpenOrClosed.Core.PropertyValueConverters;

public class HolidaysConverter : PropertyValueConverterBase, IDeliveryApiPropertyValueConverter
{
    public override bool IsConverter(IPublishedPropertyType propertyType)
        => HolidaysPropertyEditor.EditorAlias == propertyType.EditorAlias;

    public override Type GetPropertyValueType(IPublishedPropertyType propertyType)
        => typeof(HolidaySchedule);

    // Expiry is relative to today, so the converted value must not be cached - a cached value
    // goes stale as soon as a request crosses a day boundary.
    public override PropertyCacheLevel GetPropertyCacheLevel(IPublishedPropertyType propertyType)
        => PropertyCacheLevel.None;

    /// <summary>
    /// Deserializes the stored value. This is cached for the lifetime of the element, so it must
    /// stay free of anything time-dependent - see <see cref="Project"/>.
    /// </summary>
    public override object? ConvertSourceToIntermediate(
        IPublishedElement owner, IPublishedPropertyType propertyType, object? source, bool preview)
    {
        var sourceString = source?.ToString();

        return string.IsNullOrWhiteSpace(sourceString)
            ? null
            : StoredValueJson.Deserialize<HolidaySchedule>(sourceString);
    }

    public override object? ConvertIntermediateToObject(
        IPublishedElement owner, IPublishedPropertyType propertyType,
        PropertyCacheLevel referenceCacheLevel, object? inter, bool preview)
        => Project(inter as HolidaySchedule, RemoveExpired(propertyType), Today);

    public PropertyCacheLevel GetDeliveryApiPropertyCacheLevel(IPublishedPropertyType propertyType)
        => GetPropertyCacheLevel(propertyType);

    public Type GetDeliveryApiPropertyValueType(IPublishedPropertyType propertyType)
        => GetPropertyValueType(propertyType);

    public object? ConvertIntermediateToDeliveryApiObject(
        IPublishedElement owner, IPublishedPropertyType propertyType,
        PropertyCacheLevel referenceCacheLevel, object? inter, bool preview, bool expanding)
        => Project(inter as HolidaySchedule, RemoveExpired(propertyType), Today);

    private static DateOnly Today => DateOnly.FromDateTime(DateTime.Now);

    private static bool RemoveExpired(IPublishedPropertyType propertyType)
        => DataTypeConfig.Toggle(
            propertyType, Constants.PropertyEditors.PreValues.RemoveExpiredHolidays, fallback: true);

    /// <summary>
    /// Projects the stored schedule into the converted value, optionally dropping holidays that
    /// have already finished.
    /// </summary>
    /// <remarks>
    /// Always returns fresh instances - the intermediate value is shared and cached, so it must
    /// never be mutated here. <paramref name="today"/> is a parameter so this is testable against
    /// fixed dates.
    /// </remarks>
    internal static HolidaySchedule Project(HolidaySchedule? stored, bool removeExpired, DateOnly today)
    {
        if (stored is null)
        {
            return new HolidaySchedule();
        }

        IEnumerable<Holiday> holidays = stored.Holidays ?? [];

        if (removeExpired)
        {
            holidays = holidays.Where(holiday => !IsExpired(holiday, today));
        }

        return new HolidaySchedule
        {
            DefaultHours = Copy(stored.DefaultHours),
            Holidays =
            [
                // Start then name, matching the editor's sortHolidays - a consumer should not
                // see a different order than the person who typed them in.
                .. holidays
                    .OrderBy(holiday => holiday.Start)
                    .ThenBy(holiday => holiday.Name, StringComparer.CurrentCulture)
                    .Select(holiday => new Holiday
                    {
                        Name = holiday.Name,
                        Start = holiday.Start,
                        End = holiday.End,
                        RepeatYearly = holiday.RepeatYearly,
                        HoursMode = holiday.HoursMode,
                        Hours = Copy(holiday.Hours),
                    }),
            ],
        };
    }

    /// <summary>A repeating holiday never expires, because it recurs.</summary>
    private static bool IsExpired(Holiday holiday, DateOnly today)
        => !holiday.RepeatYearly && holiday.End < today;

    private static IReadOnlyList<HoursRange> Copy(IReadOnlyList<HoursRange>? ranges)
        =>
        [
            .. (ranges ?? []).OrderBy(range => range.Start).Select(range => new HoursRange
            {
                Start = range.Start,
                End = range.End,
                Label = range.Label,
                ByAppointmentOnly = range.ByAppointmentOnly,
            }),
        ];
}
