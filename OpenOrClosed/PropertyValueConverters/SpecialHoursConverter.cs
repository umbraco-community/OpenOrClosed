using Umbraco.Cms.Core.Models.PublishedContent;
using Umbraco.Cms.Core.PropertyEditors;
using Umbraco.Cms.Core.PropertyEditors.DeliveryApi;
using OpenOrClosed.Core.Serialization;
using OpenOrClosed.Core.ViewModels;
using OpenOrClosed.Core.PropertyEditors;

namespace OpenOrClosed.Core.PropertyValueConverters;

public class SpecialHoursConverter : PropertyValueConverterBase, IDeliveryApiPropertyValueConverter
{
    public override bool IsConverter(IPublishedPropertyType propertyType)
        => SpecialHoursPropertyEditor.EditorAlias == propertyType.EditorAlias;

    public override Type GetPropertyValueType(IPublishedPropertyType propertyType)
        => typeof(IEnumerable<SpecialDaysViewModel>);

    // "Remove old dates" is relative to today, so the converted value must not be cached -
    // a cached value goes stale as soon as the request crosses a day boundary.
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

        return StoredValueJson.Deserialize<List<SpecialDaysViewModel>>(sourceString);
    }

    public override object? ConvertIntermediateToObject(IPublishedElement owner, IPublishedPropertyType propertyType, PropertyCacheLevel referenceCacheLevel, object? inter, bool preview)
        => AnchorToDates(inter as IEnumerable<SpecialDaysViewModel>, RemoveOldDates(propertyType), DateTime.Now.Date);

    public PropertyCacheLevel GetDeliveryApiPropertyCacheLevel(IPublishedPropertyType propertyType)
        => GetPropertyCacheLevel(propertyType);

    public Type GetDeliveryApiPropertyValueType(IPublishedPropertyType propertyType)
        => GetPropertyValueType(propertyType);

    public object? ConvertIntermediateToDeliveryApiObject(IPublishedElement owner, IPublishedPropertyType propertyType, PropertyCacheLevel referenceCacheLevel, object? inter, bool preview, bool expanding)
        => AnchorToDates(inter as IEnumerable<SpecialDaysViewModel>, RemoveOldDates(propertyType), DateTime.Now.Date);

    // TODO: There has to be a better way to get the configuration object...
    private static bool RemoveOldDates(IPublishedPropertyType propertyType)
    {
        var config = propertyType.DataType.ConfigurationAs<Dictionary<string, object>>();
        if (config?.TryGetValue(Core.Constants.PropertyEditors.PreValues.RemoveOldDates, out var value) != true)
        {
            return false;
        }

        // Toggles have been stored as booleans, as 1/0 and as "1"/"0" over the years, and an
        // unconverted System.Text.Json value can arrive here too - so never hard cast.
        return value switch
        {
            bool b => b,
            string s => s is "1" or "true" or "True",
            _ => value is not null && Convert.ToString(value) is "1" or "true" or "True",
        };
    }

    /// <summary>
    /// Moves each set of hours onto the date of the day it belongs to, optionally dropping dates
    /// that have already passed.
    /// </summary>
    /// <remarks>
    /// Always returns fresh instances - the intermediate value is shared and cached, so it must
    /// never be mutated here.
    /// </remarks>
    internal static IEnumerable<SpecialDaysViewModel> AnchorToDates(IEnumerable<SpecialDaysViewModel>? days, bool removeOldDates, DateTime today)
    {
        if (days is null)
        {
            return [];
        }

        if (removeOldDates)
        {
            days = days.Where(day => day.Date.Date >= today);
        }

        return [.. days.Select(day => new SpecialDaysViewModel
        {
            Date = day.Date,
            IsOpen = day.IsOpen,
            OpenComment = day.OpenComment,
            ClosedComment = day.ClosedComment,
            HasHours = day.HoursOfBusiness.Count > 0,
            HoursOfBusiness = [.. day.HoursOfBusiness.Select(hours => new HoursViewModel
            {
                OpensAt = HoursDate.OnDate(day.Date.Date, hours.OpensAt),
                ClosesAt = HoursDate.OnDate(day.Date.Date, hours.ClosesAt),
                Comment = hours.Comment,
                ByAppointmentOnly = hours.ByAppointmentOnly,
            })],
        })];
    }
}
