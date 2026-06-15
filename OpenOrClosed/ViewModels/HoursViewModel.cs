using System.Runtime.Serialization;

namespace OpenOrClosed.Core.ViewModels;

[DataContract]
public class HoursViewModel
{
    [DataMember(Name = "opensAt")]
    public DateTime? OpensAt { get; set; }

    [DataMember(Name = "closesAt")]
    public DateTime? ClosesAt { get; set; }

    [DataMember(Name = "comment")]
    public string? Comment { get; set; }

    [DataMember(Name = "byAppointmentOnly")]
    public bool ByAppointmentOnly { get; set; } = false;
}
