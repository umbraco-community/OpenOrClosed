using System.Text.Json.Serialization;

namespace OpenOrClosed.Core.ViewModels;

public class DaysViewModel
{
    [JsonPropertyName("dayOfTheWeek")]
    public required string DayOfTheWeek { get; set; }

    [JsonPropertyName("day")]
    public DayOfWeek? Day {get; set;}

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
