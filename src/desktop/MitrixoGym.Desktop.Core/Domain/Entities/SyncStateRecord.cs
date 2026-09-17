namespace MitrixoGym.Desktop.Core.Domain.Entities;

/// <summary>
/// Persistent state tracking client synchronization progress, cursors, and backoff for a tenant.
/// </summary>
public class SyncStateRecord
{
    /// <summary>
    /// Tenant identifier.
    /// </summary>
    public required string TenantId { get; set; }

    /// <summary>
    /// Opaque cursor token marking the last fully committed pull position.
    /// </summary>
    public string? LastCommittedCursor { get; set; }

    /// <summary>
    /// UTC timestamp of the last successful complete push and pull sync.
    /// </summary>
    public DateTimeOffset? LastSyncTimeUtc { get; set; }

    /// <summary>
    /// Current retry backoff interval in milliseconds.
    /// </summary>
    public int CurrentBackoffMs { get; set; } = 0;

    /// <summary>
    /// Diagnostic description of the most recent sync failure, if any.
    /// </summary>
    public string? LastError { get; set; }

    /// <summary>
    /// When this record was last modified locally.
    /// </summary>
    public DateTimeOffset UpdatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
}
