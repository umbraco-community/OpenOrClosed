using System.Text.Json.Serialization;

namespace OpenOrClosed.Core.ViewModels;

public class SpecialDaysViewModel
{
    [JsonPropertyName("date")]
    public DateTime Date { get; set; }

    [JsonPropertyName("isOpen")]
    public bool IsOpen { get; set; }

    [JsonPropertyName("openComment")]
    public string? OpenComment { get; set; }

    [JsonPropertyName("closedComment")]
    public string? ClosedComment { get; set; }

    [JsonPropertyName("hasHours")]
    public bool HasHours { get; set; }

    [JsonPropertyName("hoursOfBusiness")]
    public List<HoursViewModel> HoursOfBusiness { get; set; } = [];
}
