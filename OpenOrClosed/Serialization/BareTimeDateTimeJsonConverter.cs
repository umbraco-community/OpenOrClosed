using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace OpenOrClosed.Core.Serialization;

/// <summary>
/// Reads the date and time formats the property editors have written over the years: a full date,
/// and a bare time of day such as "09:00:00" or "09:00".
/// </summary>
/// <remarks>
/// A bare time carries no date, so it is anchored to <see cref="DateTime.MinValue"/> rather than to
/// today. The converters re-anchor hours onto the day they belong to and read only the time of day,
/// and using today here is what let the original staleness bug hide for so long.
/// </remarks>
internal sealed class BareTimeDateTimeJsonConverter : JsonConverter<DateTime>
{
    private static readonly string[] TimeFormats = ["hh\\:mm\\:ss", "hh\\:mm"];

    public override DateTime Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType != JsonTokenType.String)
        {
            throw new JsonException($"Expected a string for {typeToConvert.Name}, found {reader.TokenType}.");
        }

        var value = reader.GetString();
        if (string.IsNullOrWhiteSpace(value))
        {
            return default;
        }

        // A bare time has to be tested first: DateTime.TryParse happily accepts "09:00:00" and
        // silently attaches today's date, which is the behaviour this converter exists to avoid.
        if (TimeSpan.TryParseExact(value, TimeFormats, CultureInfo.InvariantCulture, out var timeOfDay))
        {
            return default(DateTime).Add(timeOfDay);
        }

        if (DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.None, out var dateTime))
        {
            return dateTime;
        }

        throw new JsonException($"'{value}' is not a date or a time of day.");
    }

    public override void Write(Utf8JsonWriter writer, DateTime value, JsonSerializerOptions options)
        => writer.WriteStringValue(value);
}
