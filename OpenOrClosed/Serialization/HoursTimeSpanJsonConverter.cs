using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace OpenOrClosed.Core.Serialization;

/// <summary>
/// Reads and writes a time of day as "HH:mm", where "24:00" means the end of the day.
/// </summary>
/// <remarks>
/// TimeSpan is used rather than TimeOnly precisely because TimeOnly cannot represent 24:00, and
/// .NET's own TimeSpan format would render it as "1.00:00:00" - neither is much use in an API.
/// </remarks>
public sealed class HoursTimeSpanJsonConverter : JsonConverter<TimeSpan>
{
    public override TimeSpan Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var value = reader.TokenType == JsonTokenType.String ? reader.GetString() : null;

        if (value?.Length == 5 &&
            value[2] == ':' &&
            int.TryParse(value[..2], NumberStyles.None, CultureInfo.InvariantCulture, out var hours) &&
            int.TryParse(value[3..], NumberStyles.None, CultureInfo.InvariantCulture, out var minutes) &&
            hours <= 24 && minutes <= 59 &&
            (hours < 24 || minutes == 0))
        {
            return new TimeSpan(hours, minutes, 0);
        }

        throw new JsonException($"'{value}' is not a time of day in HH:mm format.");
    }

    public override void Write(Utf8JsonWriter writer, TimeSpan value, JsonSerializerOptions options)
        => writer.WriteStringValue($"{(int)value.TotalHours:D2}:{value.Minutes:D2}");
}
