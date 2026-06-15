using System.Runtime.Serialization;

namespace OpenOrClosed.Core.ViewModels;

[DataContract]
public class SpecialDaysViewModel
{
    [DataMember(Name = "date")]
    public DateTime Date { get; set; }

    [DataMember(Name = "isOpen")]
    public bool IsOpen { get; set; }

    [DataMember(Name = "openComment")]
    public string? OpenComment { get; set; }

    [DataMember(Name = "closedComment")]
    public string? ClosedComment { get; set; }

    [DataMember(Name = "hasHours")]
    public bool HasHours { get; set; }

    [DataMember(Name = "hoursOfBusiness")]
    public List<HoursViewModel> HoursOfBusiness { get; set; } = [];
}
