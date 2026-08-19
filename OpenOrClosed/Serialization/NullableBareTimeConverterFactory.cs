using System.Text.Json;
using System.Text.Json.Serialization;

namespace OpenOrClosed.Core.Serialization;

/// <summary>Applies <see cref="BareTimeDateTimeJsonConverter"/> to <c>DateTime?</c> as well.</summary>
internal sealed class NullableBareTimeConverterFactory : JsonConverterFactory
{
    public override bool CanConvert(Type typeToConvert) => typeToConvert == typeof(DateTime?);

    public override JsonConverter CreateConverter(Type typeToConvert, JsonSerializerOptions options)
        => new NullableBareTimeConverter();

    private sealed class NullableBareTimeConverter : JsonConverter<DateTime?>
    {
        private readonly BareTimeDateTimeJsonConverter _inner = new();

        public override DateTime? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
            => reader.TokenType == JsonTokenType.Null ? null : _inner.Read(ref reader, typeof(DateTime), options);

        public override void Write(Utf8JsonWriter writer, DateTime? value, JsonSerializerOptions options)
        {
            if (value is null)
            {
                writer.WriteNullValue();
                return;
            }

            _inner.Write(writer, value.Value, options);
        }
    }
}
