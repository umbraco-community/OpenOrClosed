using Umbraco.Cms.Core.Models.PublishedContent;
using Umbraco.Cms.Core.PropertyEditors;
using Newtonsoft.Json;
using OpenOrClosed.Core.PropertyEditors;

namespace OpenOrClosed.Core.PropertyValueConverters;

public class SpecialHoursConverter() : PropertyValueConverterBase
{
    public override bool IsConverter(IPublishedPropertyType propertyType)
        => SpecialHoursPropertyEditor.EditorAlias == propertyType.EditorAlias;

    public override Type GetPropertyValueType(IPublishedPropertyType propertyType)
        => typeof(IEnumerable<ViewModels.SpecialDaysViewModel>);

    public override PropertyCacheLevel GetPropertyCacheLevel(IPublishedPropertyType propertyType)
        => PropertyCacheLevel.Element;

    public override object? ConvertSourceToIntermediate(IPublishedElement owner, IPublishedPropertyType propertyType, object? source, bool preview)
    {
        var sourceString = source?.ToString();
        if (string.IsNullOrWhiteSpace(sourceString))
        {
            return default;
            // return Enumerable.Empty<ViewModels.SpecialDaysViewModel>();
        }
        var data = JsonConvert.DeserializeObject<IEnumerable<ViewModels.SpecialDaysViewModel>>(sourceString);
        if (data is null)
        {
            return default;
            // return Enumerable.Empty<ViewModels.SpecialDaysViewModel>();
        }

        // TODO: There has to be a better way to get the configuration object...
        var config = propertyType.DataType.ConfigurationAs<Dictionary<string, object>>();
        var removeOldDates = (config?.TryGetValue(Core.Constants.PropertyEditors.PreValues.RemoveOldDates, out var oRemoveOldDates) ?? false) && (bool)oRemoveOldDates;
        var currDate = DateTime.Now.Date.Date;

        // Go through and adjust the dates for each set of hours.
        foreach (var date in data)
        {
            if (removeOldDates)
            {
                if (date.Date.Date < currDate)
                {
                    continue;
                }
            }

            foreach (var hours in date.HoursOfBusiness)
            {
                if (hours.OpensAt != null)
                {
                    hours.OpensAt = new DateTime(date.Date.Year, date.Date.Month, date.Date.Day, hours.OpensAt?.Hour ?? 0, hours.OpensAt?.Minute ?? 0, hours.OpensAt?.Second ?? 0);
                }
                if (hours.ClosesAt != null)
                {
                    hours.ClosesAt = new DateTime(date.Date.Year, date.Date.Month, date.Date.Day, hours.ClosesAt?.Hour ?? 0, hours.ClosesAt?.Minute ?? 0, hours.ClosesAt?.Second ?? 0);
                }
            }
        }

        if (removeOldDates)
        {
            // Only all dates in the future 
            return data.Where(x => x.Date.Date >= DateTime.Now.Date).ToList();
        }

        return data;
    }
}
