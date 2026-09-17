using MitrixoGym.Desktop.Core.Domain.Enums;

namespace MitrixoGym.Desktop.Core.Domain.Entities;

/// <summary>
/// Persistent record of a concurrency or domain invariant conflict detected during synchronization.
/// Conflicts must remain visible to staff and never be silently dropped.
/// </summary>
public class ConflictRecord
{
    /// <summary>
    /// Unique identifier for this conflict entry.
    /// </summary>
    public required string ConflictId { get; set; }

    /// <summary>
    /// Tenant identifier.
    /// </summary>
    public required string TenantId { get; set; }

    /// <summary>
    /// Type of entity experiencing conflict (e.g. "member", "attendance").
    /// </summary>
    public required string EntityType { get; set; }

    /// <summary>
    /// Entity identifier under contention.
    /// </summary>
    public required string EntityId { get; set; }

    /// <summary>
    /// ID of the outbox operation that caused the conflict.
    /// </summary>
    public required string OperationId { get; set; }

    /// <summary>
    /// JSON serialization of what the client intended to save.
    /// </summary>
    public required string LocalIntentJson { get; set; }

    /// <summary>
    /// JSON serialization of the authoritative server state at rejection time.
    /// </summary>
    public required string ServerStateJson { get; set; }

    /// <summary>
    /// Machine-readable code explaining why the operation was rejected.
    /// </summary>
    public required string ReasonCode { get; set; }

    /// <summary>
    /// Resolution state (Pending, Resolved, Ignored, Overridden).
    /// </summary>
    public ConflictResolutionState ResolutionState { get; set; } = ConflictResolutionState.Pending;

    /// <summary>
    /// UTC timestamp when conflict was logged.
    /// </summary>
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;

    /// <summary>
    /// UTC timestamp when conflict was resolved, if applicable.
    /// </summary>
    public DateTimeOffset? ResolvedAtUtc { get; set; }

    /// <summary>
    /// Staff member user ID who resolved this conflict.
    /// </summary>
    public string? ResolvedByUserId { get; set; }

    /// <summary>
    /// Resolution notes entered by staff.
    /// </summary>
    public string? ResolutionNotes { get; set; }
}
