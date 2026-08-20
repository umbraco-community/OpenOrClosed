using Umbraco.Cms.Core.Models.PublishedContent;

namespace OpenOrClosed.Core.PropertyValueConverters;

/// <summary>Reads data type settings without trusting how they were stored.</summary>
internal static class DataTypeConfig
{
    /// <summary>
    /// Reads a boolean setting, returning <paramref name="fallback"/> when it is absent.
    /// </summary>
    /// <remarks>
    /// Toggles have been stored as booleans, as 1/0 and as "1"/"0" over the years, and an
    /// unconverted System.Text.Json value can arrive here too - so never hard cast.
    /// </remarks>
    internal static bool Toggle(IPublishedPropertyType propertyType, string alias, bool fallback)
    {
        var config = propertyType.DataType.ConfigurationAs<Dictionary<string, object>>();

        if (config?.TryGetValue(alias, out var value) != true)
        {
            return fallback;
        }

        return value switch
        {
            bool b => b,
            string s => s is "1" or "true" or "True",
            _ => value is not null && Convert.ToString(value) is "1" or "true" or "True",
        };
    }
}
