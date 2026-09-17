using MitrixoGym.Desktop.Core.Domain.Enums;

namespace MitrixoGym.Desktop.Core.Domain.Entities;

/// <summary>
/// Base class for all synchronized business entities stored in local SQLite working set.
/// </summary>
public abstract class SyncableEntity
{
    /// <summary>
    /// Stable server record ID (e.g., Firestore document ID or GUID).
    /// </summary>
    public required string Id { get; set; }

    /// <summary>
    /// Defense-in-depth tenant marker ('strike' or 'inzanathletics').
    /// </summary>
    public required string TenantId { get; set; }

    /// <summary>
    /// Monotonic version or revision assigned by the server.
    /// </summary>
    public long ServerVersion { get; set; }

    /// <summary>
    /// Server timestamp for display and diagnostics.
    /// </summary>
    public DateTimeOffset? ServerUpdatedAt { get; set; }

    /// <summary>
    /// Soft delete tombstone timestamp. Null if record is active.
    /// </summary>
    public DateTimeOffset? DeletedAt { get; set; }

    /// <summary>
    /// Synchronization status of this local record.
    /// </summary>
    public SyncState SyncState { get; set; } = SyncState.Synced;

    /// <summary>
    /// True if record has not been soft-deleted.
    /// </summary>
    public bool IsActive => DeletedAt == null;
}
