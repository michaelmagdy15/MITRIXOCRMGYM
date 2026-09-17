using MitrixoGym.Desktop.Core.Domain.Enums;

namespace MitrixoGym.Desktop.Core.Domain.Entities;

/// <summary>
/// Transactional outbox entry representing a durable offline mutation queued for server push.
/// </summary>
public class OutboxOperation
{
    /// <summary>
    /// Unique client-generated UUID and server idempotency key.
    /// </summary>
    public required string OperationId { get; set; }

    /// <summary>
    /// Tenant identifier ('strike' or 'inzanathletics').
    /// </summary>
    public required string TenantId { get; set; }

    /// <summary>
    /// Unique identifier of the registered client workstation.
    /// </summary>
    public required string DeviceId { get; set; }

    /// <summary>
    /// User ID of the staff member / receptionist executing this mutation.
    /// </summary>
    public required string ActorUserId { get; set; }

    /// <summary>
    /// Target domain entity type (e.g., "attendance", "member").
    /// </summary>
    public required string EntityType { get; set; }

    /// <summary>
    /// Local/server entity identifier.
    /// </summary>
    public required string EntityId { get; set; }

    /// <summary>
    /// Operation action (e.g., "CheckIn", "UpdateMember", "DeleteMember").
    /// </summary>
    public required string OperationType { get; set; }

    /// <summary>
    /// Monotonic server version known at the time of local mutation, for concurrency checks.
    /// </summary>
    public long? BaseServerVersion { get; set; }

    /// <summary>
    /// Canonical JSON payload of the mutation data.
    /// </summary>
    public required string PayloadJson { get; set; }

    /// <summary>
    /// Schema version of the payload contract (default 1).
    /// </summary>
    public int SchemaVersion { get; set; } = 1;

    /// <summary>
    /// Timestamp when operation was created locally.
    /// </summary>
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;

    /// <summary>
    /// Total number of sync push attempts made.
    /// </summary>
    public int AttemptCount { get; set; } = 0;

    /// <summary>
    /// Earliest UTC time at which this operation may be retried.
    /// </summary>
    public DateTimeOffset? NextAttemptAtUtc { get; set; }

    /// <summary>
    /// Current execution state in the outbox pipeline.
    /// </summary>
    public OutboxStatus Status { get; set; } = OutboxStatus.Pending;

    /// <summary>
    /// Safe machine-readable error code if last push attempt failed.
    /// </summary>
    public string? LastErrorCode { get; set; }

    /// <summary>
    /// Diagnostic error message (sanitized, no PII).
    /// </summary>
    public string? LastErrorMessage { get; set; }
}
