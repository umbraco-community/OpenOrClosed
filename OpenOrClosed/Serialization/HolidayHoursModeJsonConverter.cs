using System.Text.Json;
using System.Text.Json.Serialization;
using OpenOrClosed.Core.Models;

namespace OpenOrClosed.Core.Serialization;

/// <summary>
/// Reads and writes <see cref="HolidayHoursMode"/> as the lowercase strings the editor stores.
/// </summary>
/// <remarks>
/// Deliberately lenient on read, matching <see cref="StoredValueJson"/>: anything unrecognised
/// becomes <see cref="HolidayHoursMode.Default"/> rather than throwing, so one bad stored mode
/// cannot take a whole property down.
/// </remarks>
internal sealed class HolidayHoursModeJsonConverter : JsonConverter<HolidayHoursMode>
{
    public override HolidayHoursMode Read(
        ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        => reader.TokenType switch
        {
            JsonTokenType.String => Parse(reader.GetString()),
            _ => HolidayHoursMode.Default,
        };

    public override void Write(
        Utf8JsonWriter writer, HolidayHoursMode value, JsonSerializerOptions options)
        => writer.WriteStringValue(value switch
        {
            HolidayHoursMode.Closed => "closed",
            HolidayHoursMode.Custom => "custom",
            _ => "default",
        });

    private static HolidayHoursMode Parse(string? value)
        => value?.ToLowerInvariant() switch
        {
            "closed" => HolidayHoursMode.Closed,
            "custom" => HolidayHoursMode.Custom,
            _ => HolidayHoursMode.Default,
        };
}
