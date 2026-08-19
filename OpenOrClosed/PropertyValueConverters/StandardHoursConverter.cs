using Umbraco.Cms.Core.Models.PublishedContent;
using Umbraco.Cms.Core.PropertyEditors;
using Umbraco.Cms.Core.PropertyEditors.DeliveryApi;
using OpenOrClosed.Core.Serialization;
using OpenOrClosed.Core.ViewModels;
using OpenOrClosed.Core.PropertyEditors;

namespace OpenOrClosed.Core.PropertyValueConverters;

public class StandardHoursConverter : PropertyValueConverterBase, IDeliveryApiPropertyValueConverter
{
    public override bool IsConverter(IPublishedPropertyType propertyType)
        => StandardHoursPropertyEditor.EditorAlias == propertyType.EditorAlias;

    public override Type GetPropertyValueType(IPublishedPropertyType propertyType)
        => typeof(IEnumerable<DaysViewModel>);

    // The converted value anchors each day's times to the current week, so it must not be
    // cached - a cached value goes stale as soon as the request crosses a day boundary.
    public override PropertyCacheLevel GetPropertyCacheLevel(IPublishedPropertyType propertyType)
        => PropertyCacheLevel.None;

    /// <summary>
    /// Deserializes the stored value. This is cached for the lifetime of the element, so it
    /// must stay free of anything time-dependent - see <see cref="ConvertIntermediateToObject"/>.
    /// </summary>
    public override object? ConvertSourceToIntermediate(IPublishedElement owner, IPublishedPropertyType propertyType, object? source, bool preview)
    {
        var sourceString = source?.ToString();
        if (string.IsNullOrWhiteSpace(sourceString))
        {
            return null;
        }

        return StoredValueJson.Deserialize<List<DaysViewModel>>(sourceString);
    }

    public override object? ConvertIntermediateToObject(IPublishedElement owner, IPublishedPropertyType propertyType, PropertyCacheLevel referenceCacheLevel, object? inter, bool preview)
        => AnchorToCurrentWeek(inter as IEnumerable<DaysViewModel>, DateTime.Now.Date);

    public PropertyCacheLevel GetDeliveryApiPropertyCacheLevel(IPublishedPropertyType propertyType)
        => GetPropertyCacheLevel(propertyType);

    public Type GetDeliveryApiPropertyValueType(IPublishedPropertyType propertyType)
        => GetPropertyValueType(propertyType);

    public object? ConvertIntermediateToDeliveryApiObject(IPublishedElement owner, IPublishedPropertyType propertyType, PropertyCacheLevel referenceCacheLevel, object? inter, bool preview, bool expanding)
        => AnchorToCurrentWeek(inter as IEnumerable<DaysViewModel>, DateTime.Now.Date);

    /// <summary>
    /// Projects the stored days onto the Monday-to-Sunday week that today falls in, so that each
    /// day's opening and closing times carry the date of the day they describe.
    /// </summary>
    /// <remarks>
    /// Always returns fresh instances - the intermediate value is shared and cached, so it must
    /// never be mutated here.
    /// </remarks>
    internal static IEnumerable<DaysViewModel> AnchorToCurrentWeek(IEnumerable<DaysViewModel>? days, DateTime today)
    {
        if (days is null)
        {
            return [];
        }

        var monday = today.AddDays(-HoursDate.DaysFromMonday(today.DayOfWeek));

        return [.. days.Select(day =>
        {
            // Bank Holidays have no day of the week, so they stay anchored to today.
            var date = day.Day is null ? today : monday.AddDays(HoursDate.DaysFromMonday(day.Day.Value));

            return new DaysViewModel
            {
                DayOfTheWeek = day.DayOfTheWeek,
                Day = day.Day,
                IsOpen = day.IsOpen,
                OpenComment = day.OpenComment,
                ClosedComment = day.ClosedComment,
                HasHours = day.HoursOfBusiness.Count > 0,
                HoursOfBusiness = [.. day.HoursOfBusiness.Select(hours => new HoursViewModel
                {
                    OpensAt = HoursDate.OnDate(date, hours.OpensAt),
                    ClosesAt = HoursDate.OnDate(date, hours.ClosesAt),
                    Comment = hours.Comment,
                    ByAppointmentOnly = hours.ByAppointmentOnly,
                })],
            };
        })];
    }
}
