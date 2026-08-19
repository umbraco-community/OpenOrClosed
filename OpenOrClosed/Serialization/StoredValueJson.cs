using System.Text.Json;

namespace OpenOrClosed.Core.Serialization;

/// <summary>
/// Reads the JSON a property editor persisted. Deliberately lenient: stored values predate the
/// current models and were written by several generations of editor.
/// </summary>
internal static class StoredValueJson
{
    internal static JsonSerializerOptions Options { get; } = Build();

    private static JsonSerializerOptions Build()
    {
        var options = new JsonSerializerOptions
        {
            // The editor writes "dayoftheweek"; the model declares "dayOfTheWeek".
            PropertyNameCaseInsensitive = true,
            ReadCommentHandling = JsonCommentHandling.Skip,
            AllowTrailingCommas = true,
        };

        options.Converters.Add(new BareTimeDateTimeJsonConverter());
        options.Converters.Add(new NullableBareTimeConverterFactory());

        return options;
    }

    /// <summary>Deserializes a stored value, returning null rather than throwing on malformed JSON.</summary>
    internal static T? Deserialize<T>(string json)
    {
        try
        {
            return JsonSerializer.Deserialize<T>(json, Options);
        }
        catch (JsonException)
        {
            return default;
        }
    }
}
