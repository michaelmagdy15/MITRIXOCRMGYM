namespace MitrixoGym.Desktop.Core.Domain.Entities;

/// <summary>
/// Cached and locally recorded gym attendance/check-in record.
/// </summary>
public class AttendanceEntity : SyncableEntity
{
    /// <summary>
    /// ID of the member / client who checked in.
    /// </summary>
    public required string ClientId { get; set; }

    /// <summary>
    /// Denormalized member name for instant offline presentation.
    /// </summary>
    public string? ClientName { get; set; }

    /// <summary>
    /// Branch ID where attendance was registered.
    /// </summary>
    public string? BranchId { get; set; }

    /// <summary>
    /// UTC timestamp of the check-in event.
    /// </summary>
    public DateTimeOffset DateUtc { get; set; } = DateTimeOffset.UtcNow;

    /// <summary>
    /// User ID of the receptionist/staff member who logged the check-in.
    /// </summary>
    public required string RecordedByUserId { get; set; }

    /// <summary>
    /// Name or type of package utilized for this session.
    /// </summary>
    public string? PackageName { get; set; }

    /// <summary>
    /// Optional front-desk reception notes.
    /// </summary>
    public string? Notes { get; set; }
}
