using OpenOrClosed.Core.Models;
using OpenOrClosed.Core.PropertyEditors;
using OpenOrClosed.Core.Serialization;
using Umbraco.Cms.Core.Models.PublishedContent;
using Umbraco.Cms.Core.PropertyEditors;
using Umbraco.Cms.Core.PropertyEditors.DeliveryApi;

namespace OpenOrClosed.Core.PropertyValueConverters;

public class WeeklyHoursConverter : PropertyValueConverterBase, IDeliveryApiPropertyValueConverter
{
    /// <summary>Monday first, matching how the editor presents the week.</summary>
    private static readonly DayOfWeek[] Week =
    [
        DayOfWeek.Monday, DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday,
        DayOfWeek.Friday, DayOfWeek.Saturday, DayOfWeek.Sunday,
    ];

    public override bool IsConverter(IPublishedPropertyType propertyType)
        => WeeklyHoursPropertyEditor.EditorAlias == propertyType.EditorAlias;

    public override Type GetPropertyValueType(IPublishedPropertyType propertyType)
        => typeof(IEnumerable<WeeklyHoursDay>);

    // Nothing here depends on today, so the converted value is safe to cache.
    public override PropertyCacheLevel GetPropertyCacheLevel(IPublishedPropertyType propertyType)
        => PropertyCacheLevel.Element;

    public override object? ConvertSourceToIntermediate(
        IPublishedElement owner, IPublishedPropertyType propertyType, object? source, bool preview)
    {
        var sourceString = source?.ToString();

        return string.IsNullOrWhiteSpace(sourceString)
            ? null
            : StoredValueJson.Deserialize<List<WeeklyHoursDayDto>>(sourceString);
    }

    public override object? ConvertIntermediateToObject(
        IPublishedElement owner, IPublishedPropertyType propertyType,
        PropertyCacheLevel referenceCacheLevel, object? inter, bool preview)
        => ExpandWeek(inter as IEnumerable<WeeklyHoursDayDto>);

    public PropertyCacheLevel GetDeliveryApiPropertyCacheLevel(IPublishedPropertyType propertyType)
        => GetPropertyCacheLevel(propertyType);

    public Type GetDeliveryApiPropertyValueType(IPublishedPropertyType propertyType)
        => GetPropertyValueType(propertyType);

    public object? ConvertIntermediateToDeliveryApiObject(
        IPublishedElement owner, IPublishedPropertyType propertyType,
        PropertyCacheLevel referenceCacheLevel, object? inter, bool preview, bool expanding)
        => ExpandWeek(inter as IEnumerable<WeeklyHoursDayDto>);

    /// <summary>
    /// Produces all seven days, Monday first, whether or not the stored value holds an entry for
    /// each, so that a view can loop over a full week and <c>IsOpen</c> means something.
    /// </summary>
    /// <remarks>Always returns fresh instances - the intermediate is shared and cached.</remarks>
    internal static IEnumerable<WeeklyHoursDay> ExpandWeek(IEnumerable<WeeklyHoursDayDto>? stored)
    {
        // Entries without a usable day are skipped rather than allowed to spoil the week: a value left
        // over from the AngularJS editor carries a "Holidays" row that names no day at all.
        var byDay = stored?
            .Where(day => day.Day is >= 0 and <= 6)
            .ToLookup(day => (DayOfWeek)day.Day!.Value);

        return
        [
            .. Week.Select(day => new WeeklyHoursDay
            {
                Day = day,
                DayName = WeeklyHoursDay.NameOf(day),
                Ranges =
                [
                    .. (byDay?[day].SelectMany(entry => entry.Ranges) ?? [])
                        .OrderBy(range => range.Start)
                ],
            }),
        ];
    }
}
