using System.Text.Json.Serialization;

namespace OpenOrClosed.Core.ViewModels;

public class HoursViewModel
{
    [JsonPropertyName("opensAt")]
    public DateTime? OpensAt { get; set; }

    [JsonPropertyName("closesAt")]
    public DateTime? ClosesAt { get; set; }

    [JsonPropertyName("comment")]
    public string? Comment { get; set; }

    [JsonPropertyName("byAppointmentOnly")]
    public bool ByAppointmentOnly { get; set; } = false;
}
