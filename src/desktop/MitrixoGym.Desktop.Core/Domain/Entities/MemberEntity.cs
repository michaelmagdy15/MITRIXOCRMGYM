namespace MitrixoGym.Desktop.Core.Domain.Entities;

/// <summary>
/// Cached local working-set representation of a gym member / client.
/// </summary>
public class MemberEntity : SyncableEntity
{
    public required string Name { get; set; }
    public required string Phone { get; set; }
    public string? MemberCode { get; set; }
    public string Status { get; set; } = "Active";
    public string? PackageType { get; set; }
    public int? SessionsRemaining { get; set; }
    public int? PtSessionsRemaining { get; set; }
    public DateTimeOffset? StartDate { get; set; }
    public DateTimeOffset? MembershipExpiry { get; set; }
    public string? BranchId { get; set; }
    public string? Gender { get; set; }
    public DateTimeOffset? DateOfBirth { get; set; }
    public string? Notes { get; set; }
    public string? PhotoUrl { get; set; }
    public string? Email { get; set; }

    /// <summary>
    /// Evaluates if member currently has valid access (Active status and expiry in future or sessions remaining).
    /// </summary>
    public bool HasValidAccess
    {
        get
        {
            if (DeletedAt != null) return false;
            if (string.Equals(Status, "Expired", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(Status, "Hold", StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }

            if (MembershipExpiry.HasValue && MembershipExpiry.Value < DateTimeOffset.UtcNow)
            {
                return false;
            }

            if (SessionsRemaining.HasValue && SessionsRemaining.Value <= 0)
            {
                return false;
            }

            return true;
        }
    }
}
