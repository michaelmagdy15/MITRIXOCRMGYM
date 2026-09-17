namespace MitrixoGym.Desktop.Core.Domain.Entities;

/// <summary>
/// Receipt of an applied server event to ensure pull operations are idempotent.
/// </summary>
public class InboxReceipt
{
    /// <summary>
    /// Unique identifier of the applied server event or revision.
    /// </summary>
    public required string EventId { get; set; }

    /// <summary>
    /// Tenant identifier.
    /// </summary>
    public required string TenantId { get; set; }

    /// <summary>
    /// Entity type processed (e.g., "member", "attendance").
    /// </summary>
    public required string EntityType { get; set; }

    /// <summary>
    /// Entity identifier processed.
    /// </summary>
    public required string EntityId { get; set; }

    /// <summary>
    /// Timestamp when event was locally applied and committed.
    /// </summary>
    public DateTimeOffset AppliedAtUtc { get; set; } = DateTimeOffset.UtcNow;

    /// <summary>
    /// Monotonic version applied.
    /// </summary>
    public long ServerVersion { get; set; }
}
